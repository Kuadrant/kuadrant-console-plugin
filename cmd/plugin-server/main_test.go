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
		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(map[string]any{
			"status": map[string]any{
				"conditions":  []map[string]string{{"type": "Ready", "status": "True"}},
				"mcpEndpoint": upstream.URL,
			},
		})
	}))
	defer kubernetes.Close()

	backend, err := newServer(config{
		kubernetesAPIURL:     kubernetes.URL,
		kubernetesSkipVerify: true,
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
	if upstreamAuthorization != "Bearer mcp-gateway-token" {
		t.Fatalf("MCP upstream Authorization = %q", upstreamAuthorization)
	}
	if response.Header().Get("Mcp-Session-Id") != "session-1" {
		t.Fatalf("MCP session header was not relayed")
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
