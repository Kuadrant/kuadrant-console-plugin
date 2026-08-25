# Kuadrant OpenShift Console Plugin

The Kuadrant OpenShift Console Plugin extends the OpenShift web console with UI for managing Kuadrant resources. It is deployed automatically as part of the [Kuadrant Operator installation](https://docs.kuadrant.io/1.2.x/install-olm/).

## What the plugin provides

The plugin adds three main sections to the OpenShift console:

### Kuadrant section

The **Kuadrant** section provides gateway and policy management with the following pages:

- **Overview** - dashboard showing gateway health, policy counts, and HTTPRoute summary across the cluster
- **Policies** - tabbed list of all Kuadrant policy types (AuthPolicy, RateLimitPolicy, DNSPolicy, TLSPolicy, and extension policies). Supports create, edit, and delete with RBAC-aware UI controls.
- **API Products** - manage published API products that can be consumed through the API Catalog
- **Policy Topology** - visual graph of the relationships between Gateways, HTTPRoutes, and the Kuadrant policies attached to them
- **Policy creation forms** - guided forms for creating AuthPolicy, RateLimitPolicy, DNSPolicy, and TLSPolicy resources, with a toggle to switch between form and YAML views

### MCP management section

The **MCP management** section provides setup and management for MCP (Model Context Protocol) gateway infrastructure:

- **Overview** - when no MCPGatewayExtensions exist, shows a guided setup wizard for creating MCP infrastructure. Once extensions are created, shows a dashboard with summary cards for MCP Gateways (Total, Healthy, Unhealthy) and MCP Servers (Types, Total, Online, Offline). Includes tables for MCP Gateway Extensions, MCP Servers, Reference Grants, and Policies attached to MCP gateways or servers. Each table has toolbar filters and RBAC-aware create actions.
- **MCP Gateway Setup Wizard** - 4-step wizard that walks through selecting or creating a Gateway, HTTPRoute, and MCPGatewayExtension resource. Supports both existing resource selection and inline creation of new resources. Resources are created sequentially in the final verification step, with live status watching for the MCPGatewayExtension Ready condition.
- **MCP Inspector** - connects to a Ready MCPGatewayExtension through the Console plugin backend, lists and refreshes tools, creates inputs from each tool's JSON schema, and displays tool results with JSON-RPC request telemetry. See the [MCP Inspector guide](mcp-inspector.md).

Key resources managed on this page:

| Resource                | API Group                           | Purpose                                                                     |
| ----------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| `MCPGatewayExtension`   | `mcp.kuadrant.io/v1`                | Extends a Gateway with MCP capabilities (public host, OAuth, session store) |
| `MCPServerRegistration` | `mcp.kuadrant.io/v1`                | Registers an MCP server behind an HTTPRoute with prefix routing             |
| `ReferenceGrant`        | `gateway.networking.k8s.io/v1beta1` | Allows cross-namespace references between MCPGatewayExtensions and Gateways |

MCP Gateways are identified by finding Gateway resources that have an MCPGatewayExtension targeting them via `spec.targetRef`. The summary cards compute health based on the Gateway's `Accepted` and `Programmed` conditions, and server readiness based on the `Ready` condition.

### Kuadrant API Catalog section

The **Kuadrant API Catalog** section provides developer portal functionality for API management:

- **API Key Approvals** - manage and approve API key requests for accessing published API products
- **My API Keys** - view and manage your API keys for accessing published APIs

All pages respect Kubernetes RBAC. UI elements (tabs, buttons, kebab menu actions) are shown, hidden, or disabled based on the impersonated user's permissions.

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
