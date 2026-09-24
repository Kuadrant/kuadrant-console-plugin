# MCP Inspector

The MCP Inspector lets an OpenShift Console user inspect and run tools exposed by an MCP Gateway. Browser requests remain on the OpenShift Console origin and pass through the Console plugin backend. For each request, the backend reads the selected `MCPGatewayExtension`, follows its `spec.targetRef` to the Gateway listener, derives the MCP URL, and relays the exchange to that gateway.

## Prerequisites

- The `MCPGatewayExtension` must have a current `Ready=True` condition.
- The Kuadrant Operator must deploy the Console plugin backend and reconcile its `ConsolePlugin.spec.proxy` entry with `authorization: UserToken`.
- The Console user must have Kubernetes `get` access to the selected `MCPGatewayExtension` and its referenced Gateway.
- The Console user needs `list`/`watch` access to extensions in the selected namespace (cluster-wide in all-namespaces mode). Server-name metadata additionally needs cluster-wide `list`/`watch` access to `MCPServerRegistration`; this metadata is optional.
- Gateways and `MCPGatewayExtension` resources must be managed by trusted administrators. Their configuration determines where the plugin backend sends MCP requests.
- A bearer token supplied for an MCP gateway is only forwarded over HTTPS. The insecure-auth override is for local development only.

## Proxy and security model

The UI sends MCP JSON-RPC requests to the same-origin Console path:

```text
/api/proxy/plugin/kuadrant-console-plugin/backend/api/mcp/v1/mcpgatewayextensions/<namespace>/<name>
```

Console supplies the current OpenShift user token to the backend. The backend uses that token only to read the named `MCPGatewayExtension` and its referenced Gateway. It is never sent to the MCP gateway. The backend validates Kubernetes identifiers, takes the host from `spec.publicHost` (or the listener hostname), and takes the scheme and port from the listener, using `/mcp` as the path. Gateway and extension editors are trusted to configure these destinations. No separate per-gateway backend configuration is required by default. Kubernetes read permission and the Ready condition authorize resource access and confirm reconciliation; they do not independently approve network destinations.

Administrators can optionally restrict destinations with `MCP_PROXY_ALLOWED_ORIGINS`. When configured, the backend requires an exact origin match before forwarding. Use this restriction when resource editors should not control proxy destinations. Hostnames, DNS, and listener configuration must remain trusted; the allowlist authorizes names, not individual resolved IP addresses. Retain network egress restrictions where destination IP boundaries matter. Browser requests still require no gateway-specific CSP or CORS configuration.

The backend accepts only the Inspector's current MCP methods (`server/discover`, `initialize`, `notifications/initialized`, `tools/list`, `tools/call`, `prompts/list`, and `prompts/get`), limits request size, rejects redirects, and relays the content, protocol, session, and MCP routing headers needed by Streamable HTTP. Routing headers include `Mcp-Method`, `Mcp-Name`, and `Mcp-Param-*`; unrelated browser headers are not forwarded.

## Protocol selection

The **Protocol** selector supports these modes:

| Mode                   | Connection behavior                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auto (default)         | Calls `server/discover`, prefers `2026-07-28`, and falls back to `2025-11-25` when advertised or when discovery receives a legacy compatibility response.        |
| 2026-07-28 (stateless) | Uses discovery and per-request metadata, without `initialize`, `notifications/initialized`, or a session ID. Fails if the gateway does not support this version. |
| 2025-11-25 (legacy)    | Uses `initialize` and `notifications/initialized`. Accepts gateways with or without a session ID and rejects a different negotiated version.                     |

Connection details show the selected version and whether it is stateless, session-based, or sessionless legacy. Changing the selector reconnects and clears the catalog, outputs, and counters. The bearer token is retained in memory for the same gateway. Authentication, authorization, server failures, and recognized modern protocol errors do not trigger a blind downgrade.

On gateways supporting both revisions, tools can differ by protocol. Select a specific version to inspect that catalog. Both modes use the gateway's `/mcp` endpoint. See [Kuadrant's multi-protocol guide](https://github.com/Kuadrant/mcp-gateway/blob/main/docs/guides/multi-protocol-support.md).

Modern requests include protocol version, client identity, and empty client capabilities in `_meta`. The inspector supplies these fields even when custom tool metadata is entered. It derives routing headers from the request and tool schema, encodes values according to the [Streamable HTTP specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http), and excludes tools with invalid `x-mcp-header` annotations, logging a browser console warning.

Both versions accept JSON and request-scoped SSE responses. Legacy HTTP+SSE endpoints, subscriptions, and interactive multi-round-trip continuation are not supported. A tool or prompt returning `resultType: "input_required"` is shown as **Input required**, counted as a warning, and left incomplete; the raw response remains available for inspection. No continuation is automatically executed.

## Authentication

The inspector first connects without a gateway credential, using `server/discover` or `initialize` according to the selected protocol mode. If a connection request returns `401`, the user can paste a bearer token. The browser sends it to the plugin backend in a dedicated header, and the backend translates it to `Authorization: Bearer` only for the selected MCP gateway.

Bearer tokens and MCP session IDs are held in memory only. OIDC sign-in is not currently supported by the Inspector.

A `401` during tool execution, prompt generation, or catalog refresh invalidates the active client and opens the bearer-token dialog again. An expired session invalidates the client and displays a warning; use **Reconnect** to start a new session on the selected gateway and protocol. Reconnect also remains available after dismissing an authentication dialog.

## Backend settings

Environment variables read by the plugin backend (`cmd/plugin-server`):

- `MCP_PROXY_ALLOWED_ORIGINS`: optional comma-separated exact origins, for example `https://mcp.example.com,https://internal.example.com:8443`. Default empty: permits destinations derived from admin-managed Gateways and extensions. A non-empty list restricts proxying to those origins. Do not include `/mcp`, wildcards, credentials, or query parameters. Default ports and hostname case are normalized. Changes require a backend restart.
- `MCP_PROXY_CA_FILE`: optional PEM CA bundle appended to system trust for gateway HTTPS connections. Kubernetes API trust remains separate. An unreadable or invalid bundle fails startup; restart the backend after rotating the bundle.
- `MCP_PROXY_REQUEST_TIMEOUT`: upstream request timeout as a Go duration. Default `2m`.
- `MCP_PROXY_DIAL_ADDRESS`: `host:port` dialled for every MCP gateway instead of the derived endpoint host. The derived URL and `Host` header are kept. Development only, for clusters where the public gateway host does not resolve from inside the plugin pod; oinc resolves `*.127-0-0-1.sslip.io` to loopback.
- `MCP_PROXY_ALLOW_INSECURE_AUTH`: `true` forwards a bearer token over a plain HTTP listener. Development only.
- `KUBERNETES_INSECURE_SKIP_TLS_VERIFY`: `true` skips verification of the Kubernetes API certificate. Development only.
- `KUBERNETES_CA_FILE`: API trust bundle; defaults to the mounted service-account CA.
- `KUBERNETES_API_URL`: API endpoint; defaults to `https://kubernetes.default.svc`.

To enable the optional origin restriction in an operator-managed deployment, set the allowlist on the plugin Deployment; the operator retains environment variables it does not own:

```bash
kubectl set env deployment/kuadrant-console-plugin -n kuadrant-system \
  MCP_PROXY_ALLOWED_ORIGINS=https://mcp.example.com
```

For private-CA gateways, mount a ConfigMap containing the trusted PEM bundle into the backend and set `MCP_PROXY_CA_FILE` to its mounted path. Do not use the Kubernetes TLS bypass for gateway trust; it affects a different client. The Helm chart exposes both settings:

```yaml
plugin:
  mcpProxy:
    allowedOrigins: # Optional: restrict destinations to this list
      - https://mcp.example.com
    caConfigMapName: mcp-gateway-ca # ConfigMap key: ca-bundle.crt
```

`make oinc` deploys the backend through the operator's `CONSOLE_PLUGIN_IMAGE_OVERRIDE` (oinc has no ClusterVersion) and applies these development settings for the plain-HTTP demo before syncing the Console proxy:

```bash
kubectl --context=oinc set env deployment/kuadrant-console-plugin -n kuadrant-system \
  MCP_PROXY_DIAL_ADDRESS=mcp-gateway-istio.gateway-system.svc.cluster.local:80 \
  MCP_PROXY_ALLOW_INSECURE_AUTH=true
```

## Network access

The companion [Kuadrant operator PR #2206](https://github.com/Kuadrant/kuadrant-operator/pull/2206)
reconciles the production plugin NetworkPolicy: TCP 9443 from `app: console` pods
in `openshift-console`, selecting only plugin pods. Extra access belongs in a
separate, additive policy; edits to the managed policy are reverted.

It does not grant unrestricted egress. On egress-isolated clusters, allow the
backend to reach DNS, the Kubernetes API over HTTPS, and each configured Gateway
listener. Console egress and Gateway ingress must also allow their respective
connections. The Inspector reaches the Gateway listener, not the broker's
internal ports. The MCP gateway controller manages its own broker policy; see
[PR #1429](https://github.com/Kuadrant/mcp-gateway/pull/1429) and
[its documentation](https://github.com/Kuadrant/mcp-gateway/pull/1474).

For oinc, select the `oinc` kubectl context and run `make oinc-sync-plugin-proxy`.
After restarting Bridge, this creates or refreshes
`oinc-mcp-inspector-console-ingress` using the current standalone Console source
addresses (`/32` for IPv4, `/128` for IPv6), the backend Service's pod selector,
and TCP 9443 only. Bridged containers use their container IPs. Linux host-networked
containers use the source selected by `ip -j route get` for the backend's exact
service-host mapping in the Console container's `ExtraHosts`. This requires the
Linux `ip` command. The script checks `/backend/healthz` through Console after
applying the rule. Re-run the command after a Console/container recreation or
routing change so old IPs are removed from the rule.

The bridged configuration has been verified on oinc with Docker/OrbStack. Rootless
runtimes and other CNIs may translate the source address; missing or invalid
addresses fail closed, and an unexpected NAT source can fail the health check. In that case, inspect the
observed source and use a separately scoped development rule. Do not widen the
production policy or use `0.0.0.0/0` to make development work.

## Using the inspector

1. Open **MCP management → MCP Inspector**.
2. Select a Ready MCP gateway extension. The inspector connects using the selected protocol mode and lists its tools.
3. Find a tool by name. The server shown for a tool is the `MCPServerRegistration` whose `spec.prefix` matches the tool name, which needs list access to registrations across namespaces. Use the **Refresh tools** icon to run `tools/list` again without reconnecting.
4. Fill the schema-generated inputs. Complex object and array inputs accept JSON. Optional booleans offer **Not set**, **True**, and **False**; **Not set** omits the argument so the server can apply its own default.
5. Optionally add MCP `_meta` key-value pairs.
6. Use **Validate only** to check the input locally, or **Run tool** to execute it.
7. Inspect the server result, JSON-RPC request and response, HTTP status, and elapsed time in the Output card.
8. Switch to **Prompts** to render a prompt template. Pick a prompt, fill its arguments and use **Generate prompt**. The Output card shows the rendered messages with a copy action and a size estimate; the token count is an estimate at four characters per token, not a model tokenizer. Gateways that do not expose prompts show "This gateway does not expose prompts."

Changing gateways clears the current token, MCP session, selected tool, output, and session statistics.

## Demo servers

Fresh `make oinc` setup applies `scripts/mcp-demo.yaml`. To install or refresh the
same resources on an existing cluster, without recreating it:

```bash
kubectl config use-context oinc
make oinc-mcp-demo
```

This creates the demo namespaces, the `gateway-system/mcp-gateway` Gateway with
its `mcp` listener, a ReferenceGrant for that Gateway,
`mcp-gateway-system/mcp-gateway-extension`, and two Deployments,
Services, HTTPRoutes and MCPServerRegistrations in `toystore`. The command waits
for both Deployments and registrations and the extension to become Ready. It
requires Istio and the MCP controller/CRDs supplied by the Kuadrant operator; it
does not install a second MCP controller or change the Console backend image.

| Inspector protocol | Sample image (under `ghcr.io/kuadrant/mcp-gateway/`) | Tool                                                | Prompt                                                       |
| ------------------ | ---------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| `2025-11-25`       | `test-server1:latest`                                | `toystore_greet`, `Name=Ada` → `Hi Ada`             | `toystore_greet`, no declared arguments → `Say hi to `       |
| `2026-07-28`       | `test-stateless-server:latest`                       | `stateless_hello_world`, `Name=Ada` → `Hello, Ada!` | `stateless_greeting`, `Name=Ada` → `Please greet Ada warmly` |

The stateless fixture comes from the gateway repository's
[`config/test-servers`](https://github.com/Kuadrant/mcp-gateway/tree/main/config/test-servers)
sample. It uses `MCP_TRANSPORT=http`, `PORT=9090`, and a separate `stateless_`
registration prefix. Both samples use `IfNotPresent` so published images can be
pulled or loaded locally; they are development fixtures, not pinned production images.

Select the same extension for either protocol. **Auto prefers `2026-07-28`** once
the gateway has discovered both backends, and shows the stateless catalog. Select
`2025-11-25` explicitly to inspect `toystore_*`. Reconnect after installing the
second backend if the existing connection still uses the legacy catalog.

## Live Playwright journey

The standard smoke test verifies that the inspector opens in Console. A live tool-call journey is available when a Ready development gateway is present:

```bash
MCP_INSPECTOR_E2E_EXTENSION=mcp-gateway-system/mcp-gateway-extension \
  MCP_INSPECTOR_E2E_PROTOCOL=2025-11-25 \
  npx playwright test --config=e2e/playwright.config.ts \
  e2e/tests/mcp-inspector.spec.ts -g "connects to a live gateway"
```

The journey defaults to protocol `2025-11-25` and `toystore_greet` with `Name=Ada`,
so adding the stateless fixture does not change its catalog. Override
`MCP_INSPECTOR_E2E_TOOL`, `MCP_INSPECTOR_E2E_ARGUMENT_LABEL`, and
`MCP_INSPECTOR_E2E_ARGUMENT_VALUE` for another server.

For the stateless server, exercise both its tool and its required prompt argument:

```bash
MCP_INSPECTOR_E2E_EXTENSION=mcp-gateway-system/mcp-gateway-extension \
  MCP_INSPECTOR_E2E_PROTOCOL=2026-07-28 \
  MCP_INSPECTOR_E2E_TOOL=stateless_hello_world \
  MCP_INSPECTOR_E2E_PROMPT=stateless_greeting \
  MCP_INSPECTOR_E2E_PROMPT_ARGUMENT_LABEL=Name \
  MCP_INSPECTOR_E2E_PROMPT_OUTPUT='Please greet Ada warmly' \
  npx playwright test --config=e2e/playwright.config.ts \
  e2e/tests/mcp-inspector.spec.ts -g 'connects to a live gateway'
```

Use the same stateless arguments with `MCP_INSPECTOR_E2E_PROTOCOL=auto` to check
automatic negotiation on the dual-protocol demo. The UI itself still defaults to Auto.
