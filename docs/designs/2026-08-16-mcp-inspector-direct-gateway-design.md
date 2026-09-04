# MCP Inspector: Direct Gateway Access via CORS

**Date:** 2026-08-16 (rev 7, 2026-08-17)
**Status:** Superseded by the Console backend relay in [PR #779](https://github.com/Kuadrant/kuadrant-console-plugin/pull/779) and [issue #776](https://github.com/Kuadrant/kuadrant-console-plugin/issues/776). Retained as a record of the direct-browser PoC.
**Supersedes:** [PR #674](https://github.com/Kuadrant/kuadrant-console-plugin/pull/674) (MCP client proxy design)
**Epic:** [#667](https://github.com/Kuadrant/kuadrant-console-plugin/issues/667)
**Issues:** [#671](https://github.com/Kuadrant/kuadrant-console-plugin/issues/671) Tools, [#672](https://github.com/Kuadrant/kuadrant-console-plugin/issues/672) Prompts, [#673](https://github.com/Kuadrant/kuadrant-console-plugin/issues/673) Setup wizard
**Repos:** `Kuadrant/mcp-gateway`, `Kuadrant/kuadrant-console-plugin`

## Problem

Inspecting a gateway's tools and prompts means running MCP Inspector outside the cluster. #667 wants it in the console.

PR #674 proposed a proxy in `developer-portal-controller` to relay MCP JSON-RPC on the browser's behalf. Not building it. `spec.privateHost` is honoured verbatim, so anything server-side that dials it is an SSRF primitive for anyone who can create an `MCPGatewayExtension`. It is also the wrong hop: the plugin never talks to upstream MCP servers, it talks to our gateway, and the gateway is ours to configure.

## Approach

Add `spec.cors` to `MCPGatewayExtension` in `mcp-gateway`, typed as the Gateway API CORS filter. The controller unions in the MCP transport headers and injects the result to the broker as env vars, and the broker enforces it. The plugin then watches `MCPGatewayExtension` on the signed-in user's token and speaks Streamable HTTP direct to `https://<publicHost>/mcp`.

That is the whole thing. No new service, ServiceAccount or network path. Discovery authorisation stays with the API server, MCP authorisation with AuthPolicy. The gateway owner picks which origins may call in, and the plugin only ever sees gateways the user can already list.

> Reusing the upstream `HTTPCORSFilter` type keeps the door open to the [native Gateway API CORS filter](https://gateway-api.sigs.k8s.io/guides/user-guides/http-cors/) if it ever lands on our provider, but that is not the plan: OpenShift's Gateway API provider does not support it (see [Deferred](#deferred-native-cors-filter)), and enforcement here is entirely our broker middleware.

## `spec.cors`

```go
// cors configures Cross-Origin Resource Sharing, allowing browser-based MCP
// clients to call this gateway. Headers required by the MCP Streamable HTTP
// transport are always included, whether listed here or not. When unset,
// cross-origin requests are refused.
// +optional
CORS *gatewayv1.HTTPCORSFilter `json:"cors,omitempty"`
```

Reusing `sigs.k8s.io/gateway-api`'s `HTTPCORSFilter` as the field schema inherits upstream's validation and wildcard semantics. It's just a Go type — it says nothing about native-filter support (there is none; see Deferred), since enforcement is our broker middleware.

`allowOrigins` is effectively required: reject empty at admission. No default, no implicit wildcard. Do nothing and you get today's behaviour, which is no browser access.

The controller unions the user's lists with what the transport needs:

| Field | Always included |
|-|-|
| `allowMethods` | `GET`, `POST`, `DELETE`, `OPTIONS` |
| `allowHeaders` | `Content-Type`, `Authorization`, `Accept`, `Mcp-Session-Id`, `MCP-Protocol-Version`, `Last-Event-ID` |
| `exposeHeaders` | `Mcp-Session-Id`, `MCP-Protocol-Version`, `WWW-Authenticate` |

`DELETE` and `Last-Event-ID` go in now so session termination and SSE resumption need no API change later.

Miss `exposeHeaders: Mcp-Session-Id` and JavaScript cannot read the session ID off `initialize`, so everything after it fails. Our own [listener guide](https://docs.kuadrant.io/1.4.x/mcp-gateway/docs/guides/configure-mcp-gateway-listener-and-router/) gets that wrong today, and also omits `Mcp-Session-Id` from `allowHeaders`. That is why this is a field and not a doc page.

## Broker enforcement

Same pattern as `spec.oauthProtectedResource`, which the controller turns into `OAUTH_*` env vars that the broker reads back. Inject `CORS_*` the same way, and add them to the managed env list so reconcile does not fight user edits.

Middleware on the mux:

- match `Origin` against the allowlist, exact or leading-wildcard
- on match, echo it in `Access-Control-Allow-Origin`, set `Vary: Origin`
- on `OPTIONS`, 204 and stop
- on no match with an `Origin` present, 403 rather than only omitting the headers, so a state-changing cross-origin call can't run a side effect the browser merely can't read (defence-in-depth; auth is the real control on authenticated gateways)
- no `Origin` means a non-browser client, pass through untouched

Set `Access-Control-Allow-Credentials` from spec, defaulting to omitting it, and never echo `*`. Credentials with a wildcard origin is the classic CORS footgun, so it is blocked twice: admission rejects `allowCredentials: true` alongside any wildcard in `allowOrigins` (CEL), and at runtime the broker drops `Allow-Credentials` on a wildcard match even if somehow configured.

Replaces three sites: the `OPTIONS /mcp` handler (returned 200 with no CORS headers), plus the well-known and status handlers, which hardcoded `*` (the well-known one paired `*` with `Allow-Credentials: true`, a live bug). Dropping that unconditional `*` is a behaviour change: with `spec.cors` unset, browser cross-origin reads of those endpoints that previously worked now get no CORS headers. It ships with a release note.

A route-level `ResponseHeaderModifier` cannot do this: fixed string, so no multi-origin allowlist.

## Preflight

Preflight is never authenticated: the browser sends `OPTIONS` with no `Authorization` header. Our requests carry `Authorization`, `Content-Type` and `Mcp-Session-Id`, so preflight is mandatory on every call, and if Authorino 401s it the real request is never sent. (MCP Inspector dodges this by proxying through Node so nothing is cross-origin — the same move PR #674 was making.)

One predicate fixes it:

```yaml
spec:
  rules:
    authentication: { ... }
  when:
    - predicate: request.method != "OPTIONS"
```

A preflight carries no credentials and returns no application data, so exempting it costs nothing. Scope the exemption to real preflights (`OPTIONS` carrying `Origin` and `Access-Control-Request-Method`), not every `OPTIONS`. Auth is pre-setup for these users anyway, so this belongs alongside the AuthPolicy they already write: the wizard generates it, the authentication guide documents it, and the UI names it when a preflight 401s.

## Endpoint discovery

The plugin needs the public MCP URL per extension without re-deriving it from `spec.publicHost`, the listener hostname, or the managed HTTPRoute.

```go
// mcpEndpoint is the resolved public URL clients use to reach this MCP
// gateway, for example https://mcp.example.com/mcp.
// +optional
MCPEndpoint string `json:"mcpEndpoint,omitempty"`
```

`derivePublicHost` already runs during reconcile, so this is bookkeeping. Independent of the CORS work and can ship on its own.

## Console plugin

```typescript
const resource = {
  groupVersionKind: { group: 'mcp.kuadrant.io', version: 'v1', kind: 'MCPGatewayExtension' },
  isList: true,
  namespace: activeNamespace,
};
const [extensions, loaded, error] = useK8sWatchResource(resource);
```

RBAC comes from the API server, consistent with `docs/designs/2026-03-27-namespace-scoped-overview-design.md`. No new roles. Filter to `Ready` with `status.mcpEndpoint` set.

Client in `src/utils/mcp/`: `initialize`, `notifications/initialized`, then `tools/list` and `tools/call` (#671), `prompts/list` and `prompts/get` (#672). `credentials: 'omit'`. Session ID in React state, never `localStorage`. A 404 means expired: clear, re-initialise once, then offer reconnect rather than looping. No official TypeScript SDK for dev preview, it is six methods over POST.

Most of the work is failure states:

| Symptom | Cause | UI |
|-|-|-|
| `status.mcpEndpoint` empty | Extension not ready | Disable Inspect, link to conditions |
| `TypeError: Failed to fetch`, no status | `spec.cors` unset, or origin not allowed | Print the `allowOrigins` snippet with this origin |
| Preflight 401 | AuthPolicy not exempting `OPTIONS` | Print the `when` predicate snippet |
| 401 with `WWW-Authenticate` | Token rejected | Prompt for credentials |
| 404 on a session call | Session expired | Reconnect |
| 502, 503 | Broker down | Surface the `Ready` condition message |

Rows two and three matter most. A browser tells JavaScript nothing about a CORS rejection, so we infer the cause and print the fix. Console origin is `window.location.origin`.

The wizard (`MCPSetupWizard.tsx`) already creates Gateway, HTTPRoute and MCPGatewayExtension; the `allowOrigins` and AuthPolicy-predicate defaults it should add are in [Setup experience](#setup-experience).

## Authentication

`spec.oauthProtectedResource` already carries what RFC 9728 discovery needs and the broker serves it at `/.well-known/oauth-protected-resource`. That is a prerequisite for browser PKCE, not proof it works: the gates below still apply.

Dev preview: bearer token entry, memory only. Unblocks #671 and #672 with no IdP dependency.

Real flow later reads the 401 `WWW-Authenticate`, then runs PKCE. Two external gates on that. The authorisation server has to permit the console origin as a redirect URI, either via DCR (RFC 7591, which `docs/guides/authentication.md` already exercises with Keycloak) or a pre-registered client ID on the extension. It also has to serve CORS on its own token and registration endpoints, and the guide already carries a Keycloak workaround for exactly that ([keycloak#39629](https://github.com/keycloak/keycloak/issues/39629)). Scope both before promising an OAuth flow.

## Setup experience

Near zero for the end user, one field for a gateway owner, and deliberately not fully OOTB.

| Actor | Action | When |
|-|-|-|
| Console admin | Install the plugin; ship the CSP wildcard `ConnectSrc` chart value | Once |
| Gateway owner | Add the console origin to `spec.cors.allowOrigins` | Per gateway to inspect (wizard defaults it for gateways it creates) |
| Gateway owner | Add `when: request.method != "OPTIONS"` to the AuthPolicy | Only if the gateway has auth (wizard generates it; untested — see grey areas) |
| End user | Open the console, pick a gateway, inspect | — |

The one irreducible step is the gateway owner adding `allowOrigins` — by design (no implicit browser access), and the trade that lets us drop the proxy. It stays cheap: the wizard defaults it (and the AuthPolicy predicate) for gateways it creates; for existing ones the plugin prints the exact snippet to paste; a gateway with no `spec.cors` shows "not reachable" rather than breaking. It's a namespace-scoped edit the owner already has rights to, with no cluster-admin and no console restart.

## Security

CORS is not authorisation: it only stops another origin's JavaScript reading the response. Non-browser clients and AuthPolicy are unchanged. The broker echoes a specific matched origin, never `*`, so the allowlist is genuinely enforced (opt-in posture in [`spec.cors`](#speccors)).

Nothing new runs with privilege and nothing server-side dials a user-supplied URL. `status.mcpEndpoint` is controller-derived, not user-set, but the plugin should still treat it as a request target only when it is an absolute HTTPS URL, and never send a token to a plain-HTTP or otherwise untrusted endpoint. Tokens live in React state and go only to the gateway; session IDs stay in memory.

## Deferred: native CORS filter

If OpenShift's provider ever carries Gateway API v1.5+, [GEP-1767](https://gateway-api.sigs.k8s.io/geps/gep-1767/) could replace the middleware and the preflight predicate. That is a distant "maybe", not a near-term path — do not plan around it.

CORS reached the standard channel in v1.5.0. OCP 4.19 ships v1.2.1, 4.21 ships v1.3, and the Ingress Operator overwrites those CRDs to match its OSSM, so experimental-channel CRDs are not a workaround. Our Makefile pins the CRD download to v1.4.1, whose standard filter enum has no `CORS`. Istio implements the filter; OSSM 3.0 is Istio 1.24.

Migration: bump `GATEWAY_API_VERSION`, stamp `spec.cors` onto the managed route as a native filter, keep the middleware as a fallback for older clusters. No user-visible change, since `spec.cors` is already the upstream type.

## Proof of concept

Built and run end to end on a live oinc cluster (OCP 4.22): the gateway side (`spec.cors`, controller union, broker middleware, `status.mcpEndpoint`) on a branch, a throwaway inspector page in the console, and two live gateways driven from one page in a real browser. Both branches are pushed (below). The approach works. CSP does not block it on the OCP we tested. Auth is the untested gap.

### What's proven

From the console at a foreign origin (`http://localhost:9000`), the browser watched `MCPGatewayExtension` on the signed-in user's token (RBAC for free), read `status.mcpEndpoint`, and ran `initialize` → `tools/list` → `tools/call` against two gateways. Real `toystore_*` and `widgets_*` tools rendered, cross-origin, through `spec.cors`. Each host carries the console origin in its own `allowOrigins`, and sessions are independent: host B's `Mcp-Session-Id` 404s at host A. CORS enforcement, checked against the live broker: an allowed origin gets a 204 preflight with the headers echoed, a disallowed origin gets 204 with none, no-Origin passes through. The unauthenticated `OPTIONS` preflight survives the chain (204, no auth).

Two hosts, because dynamic multi-gateway discovery is the point — one page, many gateways discovered at runtime:

| Host | Gateway | Tools |
|-|-|-|
| A | `mcp-gateway` | `toystore_*` |
| B | `kuadrant-ingressgateway` | `widgets_*` |

`spec.cors` unset (extension C in the original matrix) degrades correctly: no CORS headers, browser refused.

### CSP

The oinc console and a live ROSA console (OCP 4.21.24) both emit only `Content-Security-Policy-Report-Only`, no enforcing header. Confirmed in-browser on ROSA: a cross-origin `fetch` to an MCP gateway fired a `connect-src` violation with `disposition: "report"`, not blocked. So CSP does not block direct browser-to-gateway on current OCP. The allowlist mechanism is already present on 4.21 (`ConsolePlugin.spec.contentSecurityPolicy` + the `ConnectSrc` directive), just unused by any installed plugin; a wildcard `connect-src` silences the violations, so it would pass under enforcing too.

The catch: OpenShift ships plugin CSP report-only deliberately and means to enforce eventually, which can't be exercised on a report-only console. So ship the wildcard `ConnectSrc` in the chart now (free today, ready when a cluster enforces) and confirm it under enforcing when one exists. There is no proxy fallback: if a wildcard is refused in review, the options are explicit per-host `ConnectSrc` entries (admin-maintained, still a direct browser-to-gateway call) or leaving the feature unavailable on that cluster.

### What broke, and the fixes

All three are in the pushed branch:

1. The broker forwarded the browser's `Origin` and `Sec-Fetch-*` to upstream MCP servers, whose transport validates Origin against Host as a DNS-rebinding guard. So every browser tool call 403'd upstream, and a curl without `Origin` masked it. Fix: strip the browser hop headers on the broker→upstream hop, keep them inbound for the CORS middleware.
2. Upstream tool responses skip the broker mux — ext_proc routes them straight to the upstream — so they carried no `Access-Control-Allow-Origin` and the browser blocked them even though the call succeeded. Fix: echo CORS in the ext_proc response phase, with the origin matcher shared via a new `internal/cors` package.
3. Not ours: the oinc addon sets the extension `privateHost` to `:8080` but the gateway listens on `:80`, so the broker hairpin timed out. Patched `spec.privateHost` to `:80`; worth raising against the addon.

### Not covered

Priority order:

1. **Auth — the real gap.** The PoC ran with no AuthPolicy and no token. Unproven: an attached AuthPolicy with the `OPTIONS` predicate, and the OAuth/PKCE browser flow (RFC 9728 discovery, client registration, and the IdP serving CORS on its own token/registration endpoints). Two of those gates live in the IdP, not our code.
2. **HTTPS.** Both hosts were HTTP on sslip.io. Untested: an HTTPS listener, a browser-trusted cert (self-signed fails `fetch` identically to a CORS reject), `https://` scheme derivation, and a real wildcard listener hostname. Real clusters are HTTPS.
3. **CSP under enforcing** — see above.
4. **Clean install.** Everything ran via the plugin dev server, with the branch layered over the released addon and manual patches. A from-scratch helm install and an operator-served packaged plugin were not exercised.
5. **The rest of the plugin** — failure-state UX (session expiry, 401/502), the wizard, tests, docs.

### Branches (pushed to forks, no PRs)

- `mcp-gateway` [`poc/mcp-inspector-cors`](https://github.com/jasonmadigan/mcp-gateway/tree/poc/mcp-inspector-cors) — tip `0bbd6b2a`, five commits: API (`spec.cors` + `status.mcpEndpoint`), controller union + `CORS_*` inject, broker/router enforcement (middleware + shared `internal/cors` + upstream header-strip + response-phase CORS + wildcard-credentials guard), a related inbound strip of the spoofable `x-mcp-resourceuri`, and removal of an unused NetworkPolicy RBAC grant.
- `kuadrant-console-plugin` [`poc/mcp-inspector-direct`](https://github.com/jasonmadigan/kuadrant-console-plugin/tree/poc/mcp-inspector-direct) — `56a3c80`: the throwaway inspector page + `src/utils/mcp/` client.

## Open questions

1. When does OpenShift's provider ship Gateway API v1.5+ (the native CORS filter)? Ask Service Mesh. Tested clusters run v1.2.1 (oinc) and v1.3.0 (ROSA 4.21), both below v1.5, so the middleware is needed today.
2. Does the plugin want a `/status` endpoint (broker readiness without speaking MCP)? Optional, cheap.
3. RHDH needs its own `allowOrigins` entry, if co-installed.

## Plan

`mcp-gateway` (steps 2-5 and `status.mcpEndpoint` are prototyped on the branch above; tests and docs are not):

1. Fix the guide's CORS section and the `*`/credentials bug in the well-known and status handlers. Standalone, ship first.
2. `spec.cors` with admission validation rejecting empty `allowOrigins`. Regenerate CRDs and bundle.
3. Controller: union defaults, inject `CORS_*`, add to the managed env list.
4. Broker middleware, replacing the three sites, plus the two the PoC added: strip browser hop headers on the upstream hop, and echo CORS on ext_proc-routed responses.
5. `status.mcpEndpoint`.
6. Unit tests: controller union/injection; broker origin matching, wildcards, preflight, the upstream header-strip and the response-phase CORS.
7. Docs: `spec.cors` replaces the custom-route guidance, predicate in the authentication guide. Ship the wildcard `ConnectSrc` in the chart's ConsolePlugin template behind a Helm value.

Browser-driven e2e is its own effort: preflight plus `initialize`/`tools/list` from a foreign origin, with and without an AuthPolicy. The Go e2e framework does not send preflights and a Go client will not reproduce browser behaviour, so this needs a headless browser in the harness or a hand-rolled preflight client we then have to trust. Decide which before committing.

`kuadrant-console-plugin`:

8. MCP client in `src/utils/mcp/`, and `status.mcpEndpoint` on the `MCPGatewayExtension` type in `src/components/mcp/types.ts`, with an API fixture (prototyped).
9. Discovery list driven by `MCPGatewayExtension` status (prototyped).
10. Tools (#671), then prompts (#672).
11. Bearer token entry, then the real OAuth/PKCE flow once the two IdP gates are scoped.
12. CORS and preflight failure detection with copyable fixes.
13. Wizard defaults (#673).
14. Playwright e2e per the `CLAUDE.md` tagging rules, plus a `build/suite-router.sh` mapping entry.

Steps 1-7 gate 8 onwards. Step 1 stands alone.

## References

- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26)
- [RFC 9728: OAuth 2.0 Protected Resource Metadata](https://www.rfc-editor.org/rfc/rfc9728)
- [Gateway API with OpenShift Ingress Operator](https://github.com/openshift/enhancements/blob/master/enhancements/ingress/gateway-api-with-cluster-ingress-operator.md)
- [OpenShift dynamic plugins: ConsolePlugin CSP](https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html/web_console/dynamic-plugins)
