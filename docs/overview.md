# Kuadrant OpenShift Console Plugin

The Kuadrant OpenShift Console Plugin extends the OpenShift web console with UI for managing Kuadrant resources. It is deployed automatically as part of the [Kuadrant Operator installation](https://docs.kuadrant.io/1.2.x/install-olm/).

## What the plugin provides

The plugin adds three main sections to the OpenShift console:

### Kuadrant section

The **Kuadrant** section provides gateway and policy management with the following pages:

- **Overview** - dashboard showing Gateway health, policy counts, and HTTPRoutes in the selected namespace or across the cluster
- **Gateway and HTTPRoute management** - create and edit routing resources using forms or YAML. Gateway forms cover GatewayClass, listeners, hostnames, TLS, and allowed routes. HTTPRoute forms cover parent Gateways, hostnames, request matching, filters, and backend services.
- **Attached resources** - Gateway and HTTPRoute detail pages show related routing resources and attached Kuadrant policies, helping you understand which policies apply to traffic
- **Policies** - tabbed list of all Kuadrant policy types (AuthPolicy, RateLimitPolicy, DNSPolicy, TLSPolicy, and extension policies). Supports create, edit, and delete with RBAC-aware UI controls.
- **API Products** - manage published API products that can be consumed through the API Catalog
- **Policy Topology** - visual graph of the relationships between Gateways, HTTPRoutes, and the Kuadrant policies attached to them
- **Policy creation forms** - guided forms for creating AuthPolicy, RateLimitPolicy, DNSPolicy, and TLSPolicy resources, with a toggle to switch between form and YAML views

### MCP management section

The **MCP management** section provides setup, monitoring, and testing for MCP (Model Context Protocol) gateway infrastructure. It brings the Gateway, its routing configuration, and registered MCP servers into one view:

- **Overview** - summary cards show MCP Gateway health and server readiness. Filterable tables show Gateways, gateway extensions, registered servers, attached HTTPRoutes, ReferenceGrants, and associated Kuadrant policies in the selected namespace or across the cluster.
- **Gateway setup** - assemble MCP infrastructure using existing or newly created Gateway, HTTPRoute, and MCPGatewayExtension resources. Setup verifies resource creation and reports extension readiness.
- **Server registration** - register an MCP server against an existing or newly created HTTPRoute, with a tool prefix and optional credentials. External server registration also configures Istio ServiceEntry and DestinationRule resources and a credential Secret for connecting to servers outside the cluster.
- **Policy management** - create authentication, rate limiting, DNS, and TLS policies for MCP Gateways and server routes
- **MCP Inspector** - discover and search tools and prompts exposed by a Ready MCPGatewayExtension. Tool inputs are generated from JSON schemas and can be validated before execution. You can run tools, generate prompts, and inspect results alongside the JSON-RPC request and response. The Inspector supports automatic protocol discovery, explicit protocol selection, and bearer tokens for gateways that require authentication. See the [MCP Inspector guide](mcp-inspector.md).

The Inspector relays requests through the Console plugin backend to the selected gateway. The backend uses your OpenShift credentials to discover the Gateway and extension; gateway bearer tokens are separate and remain in browser memory along with MCP session IDs.

Key resources managed on this page:

| Resource                | API Group                           | Purpose                                                                     |
| ----------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| `Gateway`               | `gateway.networking.k8s.io/v1`      | Defines the listeners and entry point for MCP traffic                       |
| `HTTPRoute`             | `gateway.networking.k8s.io/v1`      | Routes requests through the Gateway to MCP server backends                  |
| `MCPGatewayExtension`   | `mcp.kuadrant.io/v1`                | Extends a Gateway with MCP capabilities (public host, OAuth, session store) |
| `MCPServerRegistration` | `mcp.kuadrant.io/v1`                | Registers an MCP server behind an HTTPRoute with prefix routing             |
| `ReferenceGrant`        | `gateway.networking.k8s.io/v1beta1` | Allows cross-namespace references between MCPGatewayExtensions and Gateways |

MCP Gateways are identified by finding Gateway resources that have an MCPGatewayExtension targeting them via `spec.targetRef`. The summary cards compute health based on the Gateway's `Accepted` and `Programmed` conditions, and server readiness based on the `Ready` condition.

### Kuadrant API Catalog section

The **Kuadrant API Catalog** section provides developer portal functionality for API management:

- **API Key Approvals** - manage and approve API key requests for accessing published API products
- **My API Keys** - view and manage your API keys for accessing published APIs

All pages respect Kubernetes RBAC. UI elements (tabs, buttons, kebab menu actions) are shown, hidden, or disabled based on your Kubernetes permissions.

## Installation

The console plugin is installed automatically when you install the Kuadrant Operator on OpenShift via OLM. No separate installation step is needed.

After installing the operator, verify the plugin deployment is running:

```bash
kubectl get deployment kuadrant-console-plugin -n kuadrant-system
```

The plugin registers itself with the OpenShift console via a `ConsolePlugin` resource. The console will prompt you to enable it, or you can enable it directly:

```bash
kubectl patch consoles.operator.openshift.io cluster --type=merge \
  --patch '{"spec":{"plugins":["kuadrant-console-plugin"]}}'
```

Refresh the console and the **Kuadrant** section should appear in the navigation.

## Post-install: RBAC

The plugin's UI is fully RBAC-aware. Out of the box, cluster admins will see everything. For non-admin users, you will need to configure appropriate Roles and ClusterRoles.

See the [RBAC guide](rbac.md) for a full reference of every permission check the plugin performs, along with example roles and test coverage.
