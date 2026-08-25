# MCP Inspector

The MCP Inspector lets an OpenShift Console user inspect and run tools exposed by an MCP Gateway. The browser connects directly to the endpoint reported in `MCPGatewayExtension.status.mcpEndpoint`; the console plugin does not proxy MCP traffic.

## Prerequisites

- The `MCPGatewayExtension` must have a `Ready=True` condition and a non-empty `status.mcpEndpoint`.
- The gateway must allow the OpenShift Console origin through CORS, including the MCP protocol and session headers used by Streamable HTTP.
- The plugin's `ConsolePlugin.spec.contentSecurityPolicy` must allow the MCP and OIDC origins with the `ConnectSrc` directive when Console CSP is enabled.
- Production gateways should require authentication. An unauthenticated gateway reachable from a user's browser can be called by malicious websites if its CORS policy permits their origins.

## Content Security Policy

OpenShift Console reports a `connect-src` violation when the inspector connects to an origin that is not listed by an enabled `ConsolePlugin`. Current Console releases report these violations without blocking the request, but the required origins should still be declared so the inspector continues to work when CSP is enforced.

Add every MCP gateway origin and every OIDC origin used for discovery, client registration, or token exchange to the plugin resource. For example:

```yaml
spec:
  contentSecurityPolicy:
    - directive: ConnectSrc
      values:
        - https://mcp.example.com
        - https://sso.example.com
```

Console does not permit `*` as a CSP value, so deployments with gateway endpoints on different origins must maintain this allowlist as gateways are added or removed. The development Console accepts the equivalent bridge setting, for example `BRIDGE_CONTENT_SECURITY_POLICY="connect-src=ws://localhost:9001 http://mcp.127-0-0-1.sslip.io:8080"`.

## Authentication

The inspector first attempts an unauthenticated MCP `initialize` request. If the gateway returns a `401` challenge, the user can:

- sign in with OIDC using authorization-server discovery, dynamic client registration, authorization code, and PKCE; or
- paste a bearer token that is sent as an `Authorization: Bearer` header.

Access tokens and MCP session IDs are held in memory only. Temporary PKCE callback state is held in `sessionStorage` and removed after the callback. Requests use `credentials: omit`; browser cookies are not sent to the MCP endpoint.

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
