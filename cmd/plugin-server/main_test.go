package main

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
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
