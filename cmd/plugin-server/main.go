package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	mcpProxyPrefix         = "/api/mcp/v1/mcpgatewayextensions/"
	mcpAuthorizationHeader = "X-Kuadrant-MCP-Authorization"
	maxMCPRequestBytes     = 1024 * 1024
)

type config struct {
	listenAddress         string
	staticDirectory       string
	tlsCertificateFile    string
	tlsKeyFile            string
	kubernetesAPIURL      string
	kubernetesCAFile      string
	kubernetesSkipVerify  bool
	upstreamDialAddress   string
	allowInsecureMCPAuth  bool
	requestTimeout        time.Duration
	topologyConfigMapName string
	topologyNamespace     string
	metricsWorkloadSuffix string
}

type server struct {
	config         config
	kubernetesHTTP *http.Client
	upstreamHTTP   *http.Client
	logger         *slog.Logger
}

type mcpGatewayExtension struct {
	Metadata struct {
		Generation int64 `json:"generation"`
	} `json:"metadata"`
	Spec struct {
		PublicHost string `json:"publicHost"`
		TargetRef  struct {
			Name        string `json:"name"`
			Namespace   string `json:"namespace"`
			SectionName string `json:"sectionName"`
		} `json:"targetRef"`
	} `json:"spec"`
	Status struct {
		Conditions []struct {
			Type               string `json:"type"`
			Status             string `json:"status"`
			ObservedGeneration int64  `json:"observedGeneration"`
		} `json:"conditions"`
	} `json:"status"`
}

type gateway struct {
	Spec struct {
		Listeners []gatewayListener `json:"listeners"`
	} `json:"spec"`
}

type gatewayListener struct {
	Name     string `json:"name"`
	Hostname string `json:"hostname"`
	Protocol string `json:"protocol"`
	Port     uint32 `json:"port"`
}

type kubernetesStatus struct {
	Message string `json:"message"`
}

type rpcEnvelope struct {
	Method string `json:"method"`
}

func main() {
	cfg, err := loadConfig()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	backend, err := newServer(cfg, logger)
	if err != nil {
		logger.Error("configure server", "error", err)
		os.Exit(1)
	}

	handler := backend.routes()
	httpServer := &http.Server{
		Addr:              cfg.listenAddress,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	isTLS := cfg.tlsCertificateFile != "" && cfg.tlsKeyFile != ""
	go func() {
		logger.Info("server listening", "address", httpServer.Addr, "tls", isTLS)
		var serveErr error
		if isTLS {
			serveErr = httpServer.ListenAndServeTLS(cfg.tlsCertificateFile, cfg.tlsKeyFile)
		} else {
			serveErr = httpServer.ListenAndServe()
		}
		if serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			logger.Error("server stopped", "error", serveErr)
			stop()
		}
	}()

	<-ctx.Done()
	shutdownContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownContext); err != nil {
		logger.Error("server shutdown", "error", err)
	}
}

func loadConfig() (config, error) {
	requestTimeout, err := time.ParseDuration(env("MCP_PROXY_REQUEST_TIMEOUT", "2m"))
	if err != nil {
		return config{}, fmt.Errorf("parse MCP_PROXY_REQUEST_TIMEOUT: %w", err)
	}
	return config{
		listenAddress:         env("LISTEN_ADDRESS", ":9443"),
		staticDirectory:       env("STATIC_DIRECTORY", "/usr/share/kuadrant-console-plugin"),
		tlsCertificateFile:    os.Getenv("TLS_CERTIFICATE_FILE"),
		tlsKeyFile:            os.Getenv("TLS_KEY_FILE"),
		kubernetesAPIURL:      env("KUBERNETES_API_URL", "https://kubernetes.default.svc"),
		kubernetesCAFile:      env("KUBERNETES_CA_FILE", "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"),
		kubernetesSkipVerify:  envBool("KUBERNETES_INSECURE_SKIP_TLS_VERIFY"),
		upstreamDialAddress:   os.Getenv("MCP_PROXY_DIAL_ADDRESS"),
		allowInsecureMCPAuth:  envBool("MCP_PROXY_ALLOW_INSECURE_AUTH"),
		requestTimeout:        requestTimeout,
		topologyConfigMapName: env("TOPOLOGY_CONFIGMAP_NAME", "topology"),
		topologyNamespace:     env("TOPOLOGY_CONFIGMAP_NAMESPACE", "kuadrant-system"),
		metricsWorkloadSuffix: env("METRICS_WORKLOAD_SUFFIX", "-openshift-default"),
	}, nil
}

func newServer(cfg config, logger *slog.Logger) (*server, error) {
	kubernetesTLS := &tls.Config{MinVersion: tls.VersionTLS12, InsecureSkipVerify: cfg.kubernetesSkipVerify} // #nosec G402 -- explicit development option
	if !cfg.kubernetesSkipVerify {
		caPEM, err := os.ReadFile(cfg.kubernetesCAFile)
		if err != nil {
			return nil, fmt.Errorf("read Kubernetes CA: %w", err)
		}
		roots, err := x509.SystemCertPool()
		if err != nil || roots == nil {
			roots = x509.NewCertPool()
		}
		if !roots.AppendCertsFromPEM(caPEM) {
			return nil, errors.New("Kubernetes CA file contains no certificates")
		}
		kubernetesTLS.RootCAs = roots
	}

	upstreamTransport := http.DefaultTransport.(*http.Transport).Clone()
	upstreamTransport.TLSClientConfig = &tls.Config{
		MinVersion: tls.VersionTLS12,
	}
	if cfg.upstreamDialAddress != "" {
		dialer := &net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}
		upstreamTransport.DialContext = func(ctx context.Context, _, _ string) (net.Conn, error) {
			return dialer.DialContext(ctx, "tcp", cfg.upstreamDialAddress)
		}
	}

	return &server{
		config: cfg,
		kubernetesHTTP: &http.Client{
			Timeout: cfg.requestTimeout,
			Transport: &http.Transport{
				Proxy:           http.ProxyFromEnvironment,
				TLSClientConfig: kubernetesTLS,
			},
			CheckRedirect: rejectRedirect,
		},
		upstreamHTTP: &http.Client{
			Timeout:       cfg.requestTimeout,
			Transport:     upstreamTransport,
			CheckRedirect: rejectRedirect,
		},
		logger: logger,
	}, nil
}

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("GET /config.js", s.serveConfig)
	mux.HandleFunc("POST "+mcpProxyPrefix+"{namespace}/{name}", s.proxyMCP)
	mux.Handle("/", http.FileServer(http.Dir(s.config.staticDirectory)))
	return mux
}

func (s *server) serveConfig(writer http.ResponseWriter, _ *http.Request) {
	value := map[string]string{
		"TOPOLOGY_CONFIGMAP_NAME":      s.config.topologyConfigMapName,
		"TOPOLOGY_CONFIGMAP_NAMESPACE": s.config.topologyNamespace,
		"METRICS_WORKLOAD_SUFFIX":      s.config.metricsWorkloadSuffix,
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		http.Error(writer, "could not render config", http.StatusInternalServerError)
		return
	}
	writer.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	_, _ = fmt.Fprintf(writer, "window.kuadrant_config = %s;\n", encoded)
}

func (s *server) proxyMCP(writer http.ResponseWriter, request *http.Request) {
	userAuthorization := request.Header.Get("Authorization")
	if !strings.HasPrefix(userAuthorization, "Bearer ") {
		writeJSONError(writer, http.StatusUnauthorized, "OpenShift user authentication is required")
		return
	}

	request.Body = http.MaxBytesReader(writer, request.Body, maxMCPRequestBytes)
	body, err := io.ReadAll(request.Body)
	if err != nil {
		writeJSONError(writer, http.StatusRequestEntityTooLarge, "MCP request is too large")
		return
	}
	var envelope rpcEnvelope
	if err := json.Unmarshal(body, &envelope); err != nil || !allowedMCPMethod(envelope.Method) {
		writeJSONError(writer, http.StatusBadRequest, "unsupported MCP request")
		return
	}

	namespace := request.PathValue("namespace")
	name := request.PathValue("name")
	endpoint, status, err := s.resolveMCPEndpoint(request.Context(), namespace, name, userAuthorization)
	if err != nil {
		writeJSONError(writer, status, err.Error())
		return
	}

	target, err := url.Parse(endpoint)
	if err != nil || target.Host == "" || (target.Scheme != "http" && target.Scheme != "https") || target.User != nil || target.Fragment != "" {
		writeJSONError(writer, http.StatusBadGateway, "MCPGatewayExtension has an invalid MCP endpoint")
		return
	}
	mcpAuthorization := request.Header.Get(mcpAuthorizationHeader)
	if mcpAuthorization != "" && target.Scheme != "https" && !s.config.allowInsecureMCPAuth {
		writeJSONError(writer, http.StatusBadRequest, "refusing to send MCP credentials over an insecure connection")
		return
	}

	upstreamRequest, err := http.NewRequestWithContext(request.Context(), http.MethodPost, target.String(), strings.NewReader(string(body)))
	if err != nil {
		writeJSONError(writer, http.StatusBadGateway, "could not create MCP request")
		return
	}
	copyRequestHeader(request.Header, upstreamRequest.Header, "Content-Type")
	copyRequestHeader(request.Header, upstreamRequest.Header, "Accept")
	copyRequestHeader(request.Header, upstreamRequest.Header, "MCP-Protocol-Version")
	copyRequestHeader(request.Header, upstreamRequest.Header, "Mcp-Session-Id")
	if mcpAuthorization != "" {
		upstreamRequest.Header.Set("Authorization", mcpAuthorization)
	}

	upstreamResponse, err := s.upstreamHTTP.Do(upstreamRequest)
	if err != nil {
		s.logger.Warn("MCP upstream request failed", "namespace", namespace, "name", name, "error", err)
		writeJSONError(writer, http.StatusBadGateway, "MCP gateway request failed")
		return
	}
	defer upstreamResponse.Body.Close()
	for _, header := range []string{"Content-Type", "Mcp-Session-Id", "MCP-Protocol-Version"} {
		copyResponseHeader(upstreamResponse.Header, writer.Header(), header)
	}
	writer.WriteHeader(upstreamResponse.StatusCode)
	_, _ = io.Copy(writer, upstreamResponse.Body)
}

func (s *server) resolveMCPEndpoint(ctx context.Context, namespace, name, authorization string) (string, int, error) {
	baseURL, err := url.Parse(s.config.kubernetesAPIURL)
	if err != nil {
		return "", http.StatusInternalServerError, errors.New("Kubernetes API URL is invalid")
	}
	apiBasePath := baseURL.Path
	baseURL.Path = filepath.ToSlash(filepath.Join(apiBasePath, "apis/mcp.kuadrant.io/v1/namespaces", namespace, "mcpgatewayextensions", name))
	lookup, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL.String(), nil)
	if err != nil {
		return "", http.StatusInternalServerError, errors.New("could not create Kubernetes API request")
	}
	lookup.Header.Set("Authorization", authorization)
	lookup.Header.Set("Accept", "application/json")

	response, err := s.kubernetesHTTP.Do(lookup)
	if err != nil {
		s.logger.Error("Kubernetes API lookup failed", "error", err)
		return "", http.StatusBadGateway, errors.New("could not resolve MCP gateway")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		var status kubernetesStatus
		_ = json.NewDecoder(io.LimitReader(response.Body, 64*1024)).Decode(&status)
		message := status.Message
		if message == "" {
			message = "could not access MCPGatewayExtension"
		}
		return "", response.StatusCode, errors.New(message)
	}

	var extension mcpGatewayExtension
	if err := json.NewDecoder(io.LimitReader(response.Body, 1024*1024)).Decode(&extension); err != nil {
		return "", http.StatusBadGateway, errors.New("Kubernetes API returned an invalid MCPGatewayExtension")
	}
	ready := false
	for _, condition := range extension.Status.Conditions {
		if condition.Type == "Ready" && condition.Status == "True" && condition.ObservedGeneration == extension.Metadata.Generation {
			ready = true
			break
		}
	}
	if !ready {
		return "", http.StatusConflict, errors.New("MCPGatewayExtension is not ready")
	}

	targetNamespace := extension.Spec.TargetRef.Namespace
	if targetNamespace == "" {
		targetNamespace = namespace
	}
	baseURL.Path = filepath.ToSlash(filepath.Join(
		apiBasePath,
		"apis/gateway.networking.k8s.io/v1/namespaces",
		targetNamespace,
		"gateways",
		extension.Spec.TargetRef.Name,
	))
	lookup, err = http.NewRequestWithContext(ctx, http.MethodGet, baseURL.String(), nil)
	if err != nil {
		return "", http.StatusInternalServerError, errors.New("could not create Gateway API request")
	}
	lookup.Header.Set("Authorization", authorization)
	lookup.Header.Set("Accept", "application/json")

	response, err = s.kubernetesHTTP.Do(lookup)
	if err != nil {
		s.logger.Error("Gateway API lookup failed", "error", err)
		return "", http.StatusBadGateway, errors.New("could not resolve MCP gateway listener")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		var status kubernetesStatus
		_ = json.NewDecoder(io.LimitReader(response.Body, 64*1024)).Decode(&status)
		message := status.Message
		if message == "" {
			message = "could not access the MCP Gateway listener"
		}
		return "", response.StatusCode, errors.New(message)
	}

	var targetGateway gateway
	if err := json.NewDecoder(io.LimitReader(response.Body, 1024*1024)).Decode(&targetGateway); err != nil {
		return "", http.StatusBadGateway, errors.New("Kubernetes API returned an invalid Gateway")
	}
	endpoint, err := deriveMCPEndpoint(&extension, &targetGateway)
	if err != nil {
		return "", http.StatusBadGateway, err
	}
	return endpoint, http.StatusOK, nil
}

func deriveMCPEndpoint(extension *mcpGatewayExtension, targetGateway *gateway) (string, error) {
	sectionName := extension.Spec.TargetRef.SectionName
	for _, listener := range targetGateway.Spec.Listeners {
		if listener.Name != sectionName {
			continue
		}

		host := extension.Spec.PublicHost
		if host == "" {
			host = listener.Hostname
			if strings.HasPrefix(host, "*.") {
				host = "mcp" + host[1:]
			}
		}
		if strings.Contains(host, "://") {
			return "", errors.New("MCPGatewayExtension has an invalid public host")
		}
		if hostname, _, err := net.SplitHostPort(host); err == nil {
			host = hostname
		}
		if host == "" || strings.ContainsAny(host, "/?#@") {
			return "", errors.New("MCPGatewayExtension has an invalid public host")
		}

		scheme := "http"
		defaultPort := uint32(80)
		switch {
		case strings.EqualFold(listener.Protocol, "HTTP"):
		case strings.EqualFold(listener.Protocol, "HTTPS"):
			scheme = "https"
			defaultPort = 443
		default:
			return "", errors.New("MCP Gateway listener must use HTTP or HTTPS")
		}
		if listener.Port == 0 {
			return "", errors.New("MCP Gateway listener has an invalid port")
		}

		urlHost := host
		if listener.Port != defaultPort {
			urlHost = net.JoinHostPort(host, strconv.FormatUint(uint64(listener.Port), 10))
		}
		return (&url.URL{Scheme: scheme, Host: urlHost, Path: "/mcp"}).String(), nil
	}
	return "", errors.New("MCPGatewayExtension target listener was not found")
}

func allowedMCPMethod(method string) bool {
	switch method {
	case "initialize", "notifications/initialized", "tools/list", "tools/call", "prompts/list", "prompts/get":
		return true
	default:
		return false
	}
}

func copyRequestHeader(from, to http.Header, name string) {
	if value := from.Get(name); value != "" {
		to.Set(name, value)
	}
}

func copyResponseHeader(from, to http.Header, name string) {
	for _, value := range from.Values(name) {
		to.Add(name, value)
	}
}

func writeJSONError(writer http.ResponseWriter, status int, message string) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(map[string]string{"error": message})
}

func rejectRedirect(_ *http.Request, _ []*http.Request) error {
	return http.ErrUseLastResponse
}

func env(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func envBool(name string) bool {
	value := strings.ToLower(os.Getenv(name))
	return value == "1" || value == "true" || value == "yes"
}
