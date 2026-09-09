package main

import (
	"encoding/json"
	"encoding/pem"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestMCPProxyKeepsConsoleAndMCPAuthorizationSeparate(t *testing.T) {
	var kubernetesAuthorization string
	var kubernetesRequests int
	var upstreamAuthorization string

	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		upstreamAuthorization = request.Header.Get("Authorization")
		writer.Header().Set("Content-Type", "application/json")
		writer.Header().Set("Mcp-Session-Id", "session-1")
		_, _ = io.WriteString(writer, `{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-11-25"}}`)
	}))
	defer upstream.Close()

	kubernetes := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		kubernetesAuthorization = request.Header.Get("Authorization")
		kubernetesRequests++
		writer.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(request.URL.Path, "/mcpgatewayextensions/"):
			_ = json.NewEncoder(writer).Encode(map[string]any{
				"metadata": map[string]any{"generation": 4},
				"spec": map[string]any{
					"publicHost": "mcp.example.test",
					"targetRef": map[string]any{
						"name":        "test-gateway",
						"namespace":   "gateway-system",
						"sectionName": "mcp",
					},
				},
				"status": map[string]any{
					"conditions": []map[string]any{{"type": "Ready", "status": "True", "observedGeneration": 4}},
				},
			})
		case strings.Contains(request.URL.Path, "/gateways/"):
			_ = json.NewEncoder(writer).Encode(map[string]any{
				"spec": map[string]any{
					"listeners": []map[string]any{{
						"name":     "mcp",
						"port":     80,
						"protocol": "HTTP",
					}},
				},
			})
		default:
			http.NotFound(writer, request)
		}
	}))
	defer kubernetes.Close()

	backend, err := newServer(config{
		kubernetesAPIURL:     kubernetes.URL,
		kubernetesSkipVerify: true,
		upstreamDialAddress:  strings.TrimPrefix(upstream.URL, "http://"),
		allowInsecureMCPAuth: true,
		requestTimeout:       time.Second,
	}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(
		http.MethodPost,
		mcpProxyPrefix+"test-ns/test-extension",
		strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`),
	)
	request.Header.Set("Authorization", "Bearer openshift-user-token")
	request.Header.Set(mcpAuthorizationHeader, "Bearer mcp-gateway-token")
	response := httptest.NewRecorder()

	backend.routes().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if kubernetesAuthorization != "Bearer openshift-user-token" {
		t.Fatalf("Kubernetes Authorization = %q", kubernetesAuthorization)
	}
	if kubernetesRequests != 2 {
		t.Fatalf("Kubernetes requests = %d, want extension and Gateway lookups", kubernetesRequests)
	}
	if upstreamAuthorization != "Bearer mcp-gateway-token" {
		t.Fatalf("MCP upstream Authorization = %q", upstreamAuthorization)
	}
	if response.Header().Get("Mcp-Session-Id") != "session-1" {
		t.Fatalf("MCP session header was not relayed")
	}
}

func TestDeriveMCPEndpoint(t *testing.T) {
	tests := []struct {
		name       string
		publicHost string
		section    string
		listener   gatewayListener
		want       string
		wantErr    string
	}{
		{
			name:       "public host on default HTTP port",
			publicHost: "mcp.example.test",
			section:    "mcp",
			listener:   gatewayListener{Name: "mcp", Hostname: "ignored.example.test", Protocol: "HTTP", Port: 80},
			want:       "http://mcp.example.test/mcp",
		},
		{
			name:     "wildcard listener on non-default HTTPS port",
			section:  "secure-mcp",
			listener: gatewayListener{Name: "secure-mcp", Hostname: "*.example.test", Protocol: "HTTPS", Port: 8443},
			want:     "https://mcp.example.test:8443/mcp",
		},
		{
			name:       "missing target listener",
			publicHost: "mcp.example.test",
			section:    "other",
			listener:   gatewayListener{Name: "mcp", Protocol: "HTTP", Port: 80},
			wantErr:    "target listener was not found",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			extension := &mcpGatewayExtension{}
			extension.Spec.PublicHost = test.publicHost
			extension.Spec.TargetRef.SectionName = test.section
			targetGateway := &gateway{}
			targetGateway.Spec.Listeners = append(targetGateway.Spec.Listeners, test.listener)

			got, err := deriveMCPEndpoint(extension, targetGateway)
			if test.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), test.wantErr) {
					t.Fatalf("error = %v, want %q", err, test.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got != test.want {
				t.Fatalf("endpoint = %q, want %q", got, test.want)
			}
		})
	}
}

func TestMCPProxyRequiresConsoleUserToken(t *testing.T) {
	backend := &server{logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	request := httptest.NewRequest(
		http.MethodPost,
		mcpProxyPrefix+"test-ns/test-extension",
		strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`),
	)
	response := httptest.NewRecorder()

	backend.routes().ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusUnauthorized)
	}
}

func TestAllowedMCPMethods(t *testing.T) {
	for _, method := range []string{"server/discover", "initialize", "notifications/initialized", "tools/list", "tools/call", "prompts/list", "prompts/get"} {
		if !allowedMCPMethod(method) {
			t.Errorf("%q should be relayed", method)
		}
	}
	for _, method := range []string{"", "resources/list", "prompts/delete", "completion/complete", "notifications/cancelled"} {
		if allowedMCPMethod(method) {
			t.Errorf("%q should be rejected", method)
		}
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func TestMCPProxyModernRequests(t *testing.T) {
	for _, method := range []string{"server/discover", "tools/list", "tools/call", "prompts/get"} {
		for _, contentType := range []string{"application/json", "text/event-stream"} {
			t.Run(method+"/"+contentType, func(t *testing.T) {
				responseBody := `{"jsonrpc":"2.0","id":1,"result":{"resultType":"complete"}}`
				if contentType == "text/event-stream" {
					responseBody = "event: message\ndata: " + responseBody + "\n\n"
				}
				body := `{"jsonrpc":"2.0","id":1,"method":"` + method + `","params":{"name":"greet","arguments":{"tenant":"test"},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}`
				upstreamCalls := 0
				backend := &server{
					config: config{kubernetesAPIURL: "https://kubernetes.test"},
					logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
					kubernetesHTTP: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
						if request.Header.Get("Authorization") != "Bearer console-token" {
							t.Fatal("Kubernetes lookup did not use Console credential")
						}
						resource := `{"spec":{"listeners":[{"name":"mcp","protocol":"HTTPS","port":443,"hostname":"mcp.test"}]}}`
						if strings.Contains(request.URL.Path, "mcpgatewayextensions") {
							resource = `{"metadata":{"generation":1},"spec":{"targetRef":{"name":"gateway","sectionName":"mcp"}},"status":{"conditions":[{"type":"Ready","status":"True","observedGeneration":1}]}}`
						}
						return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(resource)), Header: make(http.Header)}, nil
					})},
					upstreamHTTP: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
						upstreamCalls++
						if request.URL.String() != "https://mcp.test/mcp" || request.Method != http.MethodPost {
							t.Fatalf("unexpected upstream target: %s %s", request.Method, request.URL)
						}
						for header, want := range map[string]string{
							"Authorization": "Bearer gateway-token", "MCP-Protocol-Version": "2026-07-28",
							"Mcp-Method": method, "Mcp-Name": "greet", "Mcp-Param-Tenant": "test",
							"Cookie": "", "X-Unrelated": "", mcpAuthorizationHeader: "", "Mcp-Session-Id": "",
						} {
							if got := request.Header.Get(header); got != want {
								t.Errorf("header %s = %q, want %q", header, got, want)
							}
						}
						gotBody, _ := io.ReadAll(request.Body)
						if string(gotBody) != body {
							t.Fatalf("request body changed: %s", gotBody)
						}
						return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {contentType}}, Body: io.NopCloser(strings.NewReader(responseBody))}, nil
					})},
				}
				for _, test := range []struct {
					name    string
					origins map[string]bool
					allowed bool
				}{
					{name: "unset", allowed: true},
					{name: "empty", origins: map[string]bool{}, allowed: true},
					{name: "matching", origins: map[string]bool{"https://mcp.test:443": true}, allowed: true},
					{name: "non-matching", origins: map[string]bool{"https://other.test:443": true}},
				} {
					t.Run(test.name, func(t *testing.T) {
						backend.allowedOrigins = test.origins
						callsBefore := upstreamCalls
						request := httptest.NewRequest(http.MethodPost, mcpProxyPrefix+"ns/extension", strings.NewReader(body))
						for header, value := range map[string]string{
							"Authorization": "Bearer console-token", mcpAuthorizationHeader: "Bearer gateway-token",
							"MCP-Protocol-Version": "2026-07-28", "Mcp-Method": method, "Mcp-Name": "greet",
							"Mcp-Param-Tenant": "test", "Cookie": "console-cookie", "X-Unrelated": "private",
						} {
							request.Header.Set(header, value)
						}
						response := httptest.NewRecorder()
						backend.routes().ServeHTTP(response, request)
						if !test.allowed {
							if response.Code != http.StatusForbidden || upstreamCalls != callsBefore {
								t.Fatalf("unapproved origin: status %d, upstream calls %d", response.Code, upstreamCalls-callsBefore)
							}
							return
						}
						if response.Code != http.StatusOK || upstreamCalls != callsBefore+1 || response.Body.String() != responseBody || response.Header().Get("Content-Type") != contentType {
							t.Fatalf("unexpected proxy response: %d %s (upstream calls: %d)", response.Code, response.Body.String(), upstreamCalls-callsBefore)
						}
					})
				}
			})
		}
	}
}

func TestKubernetesIdentifiers(t *testing.T) {
	for _, value := range []string{"default", "gateway-system", "a1"} {
		if !validNamespace(value) || !validResourceName(value) {
			t.Errorf("valid identifier rejected: %q", value)
		}
	}
	for _, value := range []string{"", "Uppercase", "with_space", strings.Repeat("a", 254)} {
		if validNamespace(value) || validResourceName(value) {
			t.Errorf("invalid identifier accepted: %q", value)
		}
	}
	if validNamespace("gateway.example") || !validResourceName("gateway.example") {
		t.Fatal("namespace and resource name rules must differ for subdomains")
	}
	if validNamespace(strings.Repeat("a", 64)) {
		t.Fatal("namespace exceeds the DNS label limit")
	}
}

func TestOriginConfiguration(t *testing.T) {
	for _, value := range []string{"https://mcp.example.test", "https://MCP.example.test:443/"} {
		origin, err := parseOrigin(value)
		if err != nil || origin != "https://mcp.example.test:443" {
			t.Fatalf("origin %q: %q, %v", value, origin, err)
		}
	}
	for _, value := range []string{"mcp.example.test", "https://*.example.test", "https://mcp.example.test/mcp", "https://mcp.example.test:0"} {
		if _, err := parseOrigin(value); err == nil {
			t.Errorf("invalid origin accepted: %q", value)
		}
	}
}

func TestUpstreamCustomCA(t *testing.T) {
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer upstream.Close()
	caFile := filepath.Join(t.TempDir(), "ca.crt")
	if err := os.WriteFile(caFile, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: upstream.Certificate().Raw}), 0600); err != nil {
		t.Fatal(err)
	}
	backend, err := newServer(config{kubernetesSkipVerify: true, upstreamCAFile: caFile, requestTimeout: time.Second}, slog.Default())
	if err != nil {
		t.Fatal(err)
	}
	response, err := backend.upstreamHTTP.Get(upstream.URL)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d", response.StatusCode)
	}
	if err := os.WriteFile(caFile, []byte("not a certificate"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := newServer(config{kubernetesSkipVerify: true, upstreamCAFile: caFile}, slog.Default()); err == nil {
		t.Fatal("invalid CA configuration should fail at startup")
	}
}
