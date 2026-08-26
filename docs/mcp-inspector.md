# MCP Inspector

The MCP Inspector lets an OpenShift Console user inspect and run tools exposed by an MCP Gateway. Browser requests remain on the OpenShift Console origin and pass through the Console plugin backend. For each request, the backend reads the selected `MCPGatewayExtension`, follows its `spec.targetRef` to the Gateway listener, derives the MCP URL, and relays the exchange to that gateway.

## Prerequisites

- The `MCPGatewayExtension` must have a current `Ready=True` condition.
- The Kuadrant Operator must deploy the Console plugin backend and reconcile its `ConsolePlugin.spec.proxy` entry with `authorization: UserToken`.
- The Console user must have Kubernetes `get` access to the selected `MCPGatewayExtension` and its referenced Gateway.
- A bearer token supplied for an MCP gateway is only forwarded over HTTPS. The insecure-auth override is for local development only.

## Proxy and security model

The UI sends MCP JSON-RPC requests to the same-origin Console path:

```text
/api/proxy/plugin/kuadrant-console-plugin/backend/api/mcp/v1/mcpgatewayextensions/<namespace>/<name>
```

Console supplies the current OpenShift user token to the backend. The backend uses that token only to read the named `MCPGatewayExtension` and its referenced Gateway. It is never sent to the MCP gateway. The backend takes the host from `spec.publicHost`, or from the listener hostname when no override is set. It takes the scheme and port from the referenced listener and uses `/mcp` as the path. This keeps endpoint selection subject to the user's Kubernetes RBAC and avoids maintaining a cluster-wide CSP or CORS allowlist for gateway hosts.

The backend accepts only the Inspector's current MCP methods (`initialize`, `notifications/initialized`, `tools/list`, and `tools/call`), limits request size, rejects redirects, and relays only the protocol, session, content, and authentication-challenge headers needed by Streamable HTTP.

## Authentication

The inspector first attempts an MCP `initialize` request without a gateway credential. If the gateway returns a `401` challenge, the user can paste a bearer token. The browser sends it to the plugin backend in a dedicated header, and the backend translates it to `Authorization: Bearer` only for the selected MCP gateway.

Bearer tokens and MCP session IDs are held in memory only. OIDC sign-in is not currently supported by the Inspector.

## Using the inspector

1. Open **MCP management → MCP Inspector**.
2. Select a Ready MCP gateway extension. The inspector initializes a session and lists its tools.
3. Select or search for a tool. Use the **Refresh tools** icon to run `tools/list` again without reconnecting the session.
4. Fill the schema-generated inputs. Complex object and array inputs accept JSON.
5. Optionally add MCP `_meta` key-value pairs.
6. Use **Validate only** to check the input locally, or **Run tool** to execute it.
7. Inspect the server result, JSON-RPC request and response, HTTP status, and elapsed time in the Output card.

Changing gateways clears the current token, MCP session, selected tool, output, and session statistics.

## Live Playwright journey

The standard smoke test verifies that the inspector opens in Console. A live tool-call journey is available when a Ready development gateway is present:

```bash
MCP_INSPECTOR_E2E_EXTENSION=mcp-gateway-system/mcp-gateway-extension \
  npx playwright test --config=e2e/playwright.config.ts \
  e2e/tests/mcp-inspector.spec.ts -g "connects to a live gateway"
```

The journey defaults to `toystore_greet` with `Name=Ada`. Override `MCP_INSPECTOR_E2E_TOOL`, `MCP_INSPECTOR_E2E_ARGUMENT_LABEL`, and `MCP_INSPECTOR_E2E_ARGUMENT_VALUE` for another development server.
