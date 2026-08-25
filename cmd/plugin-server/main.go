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
	"strings"
	"syscall"
	"time"
)

const (
	mcpProxyPrefix         = "/api/mcp/v1/gateways/"
	mcpAuthorizationHeader = "X-Kuadrant-MCP-Authorization"
	maxMCPRequestBytes     = 1024 * 1024
)

type config struct {
	listenAddress         string
	devListenAddress      string
	staticDirectory       string
	tlsCertificateFile    string
	tlsKeyFile            string
	kubernetesAPIURL      string
	kubernetesCAFile      string
	kubernetesSkipVerify  bool
	upstreamSkipVerify    bool
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
	Status struct {
		Conditions []struct {
			Type   string `json:"type"`
			Status string `json:"status"`
		} `json:"conditions"`
		MCPEndpoint string `json:"mcpEndpoint"`
	} `json:"status"`
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
	servers := []*http.Server{{
		Addr:              cfg.listenAddress,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}}
	if cfg.devListenAddress != "" {
		servers = append(servers, &http.Server{
			Addr:              cfg.devListenAddress,
			Handler:           handler,
			ReadHeaderTimeout: 10 * time.Second,
		})
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	for index, httpServer := range servers {
		isTLS := index == 0 && cfg.tlsCertificateFile != "" && cfg.tlsKeyFile != ""
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
	}

	<-ctx.Done()
	shutdownContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	for _, httpServer := range servers {
		if err := httpServer.Shutdown(shutdownContext); err != nil {
			logger.Error("server shutdown", "error", err)
		}
	}
}

func loadConfig() (config, error) {
	requestTimeout, err := time.ParseDuration(env("MCP_PROXY_REQUEST_TIMEOUT", "2m"))
	if err != nil {
		return config{}, fmt.Errorf("parse MCP_PROXY_REQUEST_TIMEOUT: %w", err)
	}
	return config{
		listenAddress:         env("LISTEN_ADDRESS", ":9443"),
		devListenAddress:      os.Getenv("DEV_LISTEN_ADDRESS"),
		staticDirectory:       env("STATIC_DIRECTORY", "/usr/share/kuadrant-console-plugin"),
		tlsCertificateFile:    os.Getenv("TLS_CERTIFICATE_FILE"),
		tlsKeyFile:            os.Getenv("TLS_KEY_FILE"),
		kubernetesAPIURL:      env("KUBERNETES_API_URL", "https://kubernetes.default.svc"),
		kubernetesCAFile:      env("KUBERNETES_CA_FILE", "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"),
		kubernetesSkipVerify:  envBool("KUBERNETES_INSECURE_SKIP_TLS_VERIFY"),
		upstreamSkipVerify:    envBool("MCP_PROXY_INSECURE_SKIP_TLS_VERIFY"),
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
		MinVersion:         tls.VersionTLS12,
		InsecureSkipVerify: cfg.upstreamSkipVerify, // #nosec G402 -- explicit development option
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
	for _, header := range []string{"Content-Type", "Mcp-Session-Id", "MCP-Protocol-Version", "WWW-Authenticate"} {
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
	baseURL.Path = filepath.ToSlash(filepath.Join(baseURL.Path, "apis/mcp.kuadrant.io/v1/namespaces", namespace, "mcpgatewayextensions", name))
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
		if condition.Type == "Ready" && condition.Status == "True" {
			ready = true
			break
		}
	}
	if !ready || extension.Status.MCPEndpoint == "" {
		return "", http.StatusConflict, errors.New("MCPGatewayExtension is not ready")
	}
	return extension.Status.MCPEndpoint, http.StatusOK, nil
}

func allowedMCPMethod(method string) bool {
	switch method {
	case "initialize", "notifications/initialized", "tools/list", "tools/call":
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
