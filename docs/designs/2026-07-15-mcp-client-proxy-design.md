# MCP Client Proxy Design

## Problem

Users of MCP Gateway have no built-in way to inspect, test, or interact with the tools and prompts exposed by the gateway. To test a tool call or browse available prompts, they must use external tools like MCP Inspector, which requires manually entering the gateway URL and runs outside the platform. There's no integrated experience in OpenShift.

## Summary

The MCP client proxy lives in the developer-portal-controller, a shared backend that both the OpenShift console plugin and RHDH already depend on. The proxy is needed because:

- Most MCP servers do not enable CORS — while it can be configured, it is not enabled by default and most servers do not support it. Browsers cannot call them directly without it. MCP Inspector solves the same problem with a Node.js backend.
- A cluster can have multiple MCP Gateways. The ConsolePlugin CR's `spec.proxy` is static and triggers console pod restarts on changes, so it cannot handle dynamic gateway discovery.

The proxy discovers gateways from MCPGatewayExtension CRs, resolves their endpoints, and makes HTTP requests to them on behalf of the frontend. Users supply their own auth credentials in the UI.

Dev preview scope: tools (list, call), prompts (list, get).

## Goals

- MCP Inspector-like experience for tools (list, call) and prompts (list, get) through the gateway
- User-supplied auth token, with capability filtering applied by the gateway

## Non-Goals

- SSE notifications (tool list changes, server-initiated events)
- OAuth/OIDC flow (automatic auth discovery and login)

## Design

### Gateway discovery

The proxy watches MCPGatewayExtension CRs across the cluster using the k8s API. For each CR, it resolves the gateway endpoint:

1. Read `spec.targetRef` on the MCPGatewayExtension — this points to a Gateway resource with a `name`, `namespace`, and `sectionName` (listener)
2. Read the referenced Gateway resource to get the `gatewayClassName` and the listener's port
3. If `spec.privateHost` is set on the MCPGatewayExtension, use that as the endpoint
4. Otherwise, derive the endpoint: `<gateway-name>-<gatewayClassName>.<gateway-namespace>.svc.cluster.local:<port>`

The derived endpoint uses `http://` by default. When the targeted Gateway listener uses HTTPS protocol, the scheme is `https://` instead. The proxy handles both — Go's `http.Client` supports HTTPS natively. If the gateway uses a custom CA certificate, the proxy will need the CA configured at deploy time.

The proxy maintains a map of MCPGatewayExtension (namespace + name) → gateway endpoint. When CRs are created, updated, or deleted, the map is updated. No console restarts are needed.

### Proxy API

#### GET /gateways

Lists all discovered MCPGatewayExtensions and their resolved endpoints.

```json
{
  "gateways": [
    {
      "name": "mcp-gateway-extension",
      "namespace": "team-a",
      "publicHost": "mcp.team-a.example.com",
      "ready": true
    },
    {
      "name": "mcp-gateway-extension",
      "namespace": "team-b",
      "publicHost": "mcp.team-b.example.com",
      "ready": true
    }
  ]
}
```

The `ready` field reflects the MCPGatewayExtension's `Ready` status condition. The `publicHost` is derived from the Gateway listener hostname or `spec.publicHost`.

#### POST /gateways/\<namespace\>/\<name\>/mcp

Proxies an MCP JSON-RPC request to the specified gateway. Step by step:

1. The frontend sends a POST with:
   - Body: a JSON-RPC payload (e.g., `{"jsonrpc":"2.0","method":"tools/list","id":1}`)
   - `Authorization` header: the user's auth token (if provided)
   - `Mcp-Session-Id` header: the MCP session ID (if an active session exists)
   - `Content-Type: application/json`

2. The proxy:
   - Parses the namespace and name from the URL
   - Looks up the gateway endpoint from its map
   - Creates a new HTTP POST request to `<gateway-endpoint>/mcp`
   - Copies the body from the frontend request
   - Copies the `Authorization` header as-is
   - Copies the `Mcp-Session-Id` header if present
   - Sets `Content-Type: application/json`
   - Sends this request to the gateway

3. The gateway processes the request through its full stack:
   - AuthPolicy validates the `Authorization` token (if configured)
   - ext_proc router parses the JSON-RPC method, manages sessions, routes tool calls to the correct upstream MCP server
   - Broker handles initialize, tools/list, prompts/list, prompts/get

4. The proxy:
   - Reads the gateway's response
   - Copies the `Mcp-Session-Id` response header back to the frontend
   - Returns the JSON response body to the frontend

### MCP protocol

The proxy forwards standard MCP Streamable HTTP requests. For the full protocol specification, see the [MCP specification](https://modelcontextprotocol.io/specification/2025-03-26) and the [MCP Gateway docs](https://docs.kuadrant.io).

The operations in scope are: `initialize`, `notifications/initialized`, `tools/list`, `tools/call`, `prompts/list`, and `prompts/get`. All are JSON-RPC over POST, all return JSON responses.

### Auth model

- Users enter their auth token in the plugin UI
- The frontend includes it as the `Authorization` header on requests to the proxy
- The proxy copies the header onto the request it sends to the gateway
- AuthPolicy at the gateway validates the token
- The proxy never inspects, stores, or validates the token

If no AuthPolicy is configured on the gateway, requests pass through without auth.

### Session management

1. Frontend sends `initialize` (no `Mcp-Session-Id` yet)
2. Gateway creates a session and returns a `Mcp-Session-Id` JWT in the response header
3. Proxy passes this header back to the frontend
4. Frontend stores it in memory (not persisted to localStorage or cookies)
5. All subsequent requests include `Mcp-Session-Id` as a header
6. Proxy passes it through to the gateway

Each user gets their own session with each gateway. User A connecting to gateway-team-a has a different session than user B connecting to the same gateway, or user A connecting to gateway-team-b. The proxy doesn't track any of this — it just copies the `Mcp-Session-Id` header from responses and onto subsequent requests. It never decodes, validates, or stores the value.

If the gateway returns a 404 (session expired or invalid), the proxy passes it back to the frontend. The user must manually reconnect — the proxy does not automatically re-initialize sessions.

## Security Considerations

- **Auth tokens are passed through, not stored**: the proxy copies the `Authorization` header from the frontend request to the gateway request. It does not log, cache, or persist tokens.
- **Session JWTs in browser memory**: `Mcp-Session-Id` is held in frontend state, not persisted. Lost on page refresh.
- **All auth validation happens at the gateway**: the proxy does not make auth decisions.
- **RBAC for gateway discovery**: the proxy's ServiceAccount needs `get`, `list`, `watch` on MCPGatewayExtension CRs and `get` on Gateway resources.
- **No direct broker access for MCP requests**: all MCP protocol requests go through the gateway, preserving the full security model.

## Future Considerations

- **OAuth/OIDC flow**: automatic auth discovery via RFC 9728 and Authorization Code flow, eliminating manual token entry
- **SSE notifications**: subscribe to tool list changes for live updates
