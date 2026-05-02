# Kuadrant OpenShift Console Plugin

The Kuadrant OpenShift Console Plugin extends the OpenShift web console with UI for managing Kuadrant resources. It is deployed automatically as part of the [Kuadrant Operator installation](https://docs.kuadrant.io/1.2.x/install-olm/).

## What the plugin provides

The plugin adds a **Kuadrant** section to the OpenShift console with the following pages:

- **Overview** - dashboard showing gateway health, policy counts, and HTTPRoute summary across the cluster
- **Policies** - tabbed list of all Kuadrant policy types (AuthPolicy, RateLimitPolicy, DNSPolicy, TLSPolicy, and extension policies). Supports create, edit, and delete with RBAC-aware UI controls.
- **Policy Topology** - visual graph of the relationships between Gateways, HTTPRoutes, and the Kuadrant policies attached to them
- **Policy creation forms** - guided forms for creating AuthPolicy, RateLimitPolicy, DNSPolicy, and TLSPolicy resources, with a toggle to switch between form and YAML views

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
