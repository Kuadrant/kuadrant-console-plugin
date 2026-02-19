# Console Plugin RBAC

## Overview page

Requires `list` on each resource type to display the corresponding card. Checks are namespace-scoped against the active namespace (or `default` when all-namespaces is selected). Sections show an "Access Denied" empty state when the check fails.

| Resource | Group | Needed for |
|---|---|---|
| `authpolicies` | `kuadrant.io` | Policies card |
| `ratelimitpolicies` | `kuadrant.io` | Policies card |
| `dnspolicies` | `kuadrant.io` | Policies card |
| `tlspolicies` | `kuadrant.io` | Policies card |
| `gateways` | `gateway.networking.k8s.io` | Gateway health card |
| `httproutes` | `gateway.networking.k8s.io` | HTTPRoute card |

`create` on a resource enables the corresponding creation button in the UI.

**Known limitation:** the Overview page has no namespace picker. The gateway health card watches gateways cluster-wide, so namespace-scoped users will not see gateway counts regardless of namespace-level permissions.

## Policies page

Requires `list` on a policy type to show its tab. Tabs for resource types the user cannot list are hidden silently.

`create` on a policy type enables the Create button for that type.

DNS and TLS policy tabs are not shown in the developer perspective regardless of permissions.

## Policy Topology page

Requires `get` on the `topology` ConfigMap in the namespace where the `Kuadrant` resource is created (often `kuadrant-system`).

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: kuadrant-topology-viewer
  namespace: <kuadrant-operator-namespace>
rules:
- apiGroups: [""]
  resources: ["configmaps"]
  resourceNames: ["topology"]
  verbs: ["get"]
```

**Known limitation:** the topology represents the full cluster graph. There is currently no per-namespace filtering of the topology view.

## Gateway / HTTPRoute detail tabs

The Policies tab on a Gateway or HTTPRoute detail page requires `get` on that specific resource. Access is enforced by the OpenShift console SDK.

## Policy creation pages

All creation pages require `create` on the relevant policy type. Edit mode additionally requires `get` and `update`.

The DNS and TLS creation forms list Gateways for selection, so `list` on `gateways.gateway.networking.k8s.io` is also needed.

The TLS creation form lists ClusterIssuers, which requires a ClusterRole:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kuadrant-clusterissuer-viewer
rules:
- apiGroups: ["cert-manager.io"]
  resources: ["clusterissuers"]
  verbs: ["list", "get"]
```

## Suggested roles

### App team (namespace-scoped: HTTPRoutes + route-level policies)

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: kuadrant-app-team
  namespace: <namespace>
rules:
- apiGroups: ["kuadrant.io"]
  resources: ["authpolicies", "ratelimitpolicies"]
  verbs: ["get", "list", "create", "update", "patch", "delete"]
- apiGroups: ["gateway.networking.k8s.io"]
  resources: ["httproutes"]
  verbs: ["get", "list", "create", "update", "patch", "delete"]
- apiGroups: ["gateway.networking.k8s.io"]
  resources: ["gateways"]
  verbs: ["get", "list"]
```

### Platform engineer (full access across cluster)

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kuadrant-platform-engineer
rules:
- apiGroups: ["kuadrant.io"]
  resources: ["authpolicies", "ratelimitpolicies", "dnspolicies", "tlspolicies"]
  verbs: ["get", "list", "create", "update", "patch", "delete"]
- apiGroups: ["gateway.networking.k8s.io"]
  resources: ["gateways", "httproutes"]
  verbs: ["get", "list", "create", "update", "patch", "delete"]
- apiGroups: ["cert-manager.io"]
  resources: ["clusterissuers", "issuers"]
  verbs: ["get", "list"]
```

To grant topology access, add a RoleBinding in the Kuadrant operator namespace:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: kuadrant-topology-viewer
  namespace: <kuadrant-operator-namespace>
rules:
- apiGroups: [""]
  resources: ["configmaps"]
  resourceNames: ["topology"]
  verbs: ["get"]
```

> The topology ConfigMap role cannot be collapsed into the ClusterRole above via a ClusterRoleBinding - named resource restrictions only work with RoleBindings.

## Known limitations

| Area | Limitation |
|---|---|
| Overview - gateway card | Watches gateways cluster-wide; namespace-scoped users will not see gateway counts. |
| Policy Topology | The topology graph represents the full cluster. Namespace-scoped users can view it if granted `get` on the topology ConfigMap, but cannot filter it to their namespace. |
