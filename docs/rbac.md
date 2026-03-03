# Console Plugin RBAC

Every permission check in the plugin UI is listed below. All checks use the Kubernetes `SelfSubjectAccessReview` API via the console SDK.

## Overview page

Checks `list` and `create` on each resource type. Checks run against the active namespace, or `default` when all-namespaces is selected.

| Resource | Group | Verb | UI effect |
|-|-|-|-|
| `gateways` | `gateway.networking.k8s.io` | `list` | Shows Gateway traffic card. "Access Denied" if denied. |
| `gateways` | `gateway.networking.k8s.io` | `create` | Enables "Create Gateway" button. Disabled with tooltip if denied. |
| `httproutes` | `gateway.networking.k8s.io` | `list` | Shows HTTPRoutes card. "Access Denied" if denied. |
| `httproutes` | `gateway.networking.k8s.io` | `create` | Enables "Create HTTPRoute" button. Disabled with tooltip if denied. |
| `authpolicies` | `kuadrant.io` | `list` | Shows Policies card (needs at least one policy type). "Access Denied" if all denied. |
| `ratelimitpolicies` | `kuadrant.io` | `list` | Same as above. |
| `dnspolicies` | `kuadrant.io` | `list` | Same as above. |
| `tlspolicies` | `kuadrant.io` | `list` | Same as above. |
| `tokenratelimitpolicies` | `kuadrant.io` | `list` | Same as above. |
| `oidcpolicies` | `extensions.kuadrant.io` | `list` | Same as above. |
| `planpolicies` | `extensions.kuadrant.io` | `list` | Same as above. |
| Each policy type | respective group | `create` | Enables that policy in the "Create Policy" dropdown. Disabled with tooltip if denied. |

**Known limitation:** the overview page resolves `#ALL_NS#` to `default` for RBAC checks. Namespace-scoped users (with Roles, not ClusterRoles) will see "Access Denied" on all overview cards even if they have full permissions in their own namespace. Only users with ClusterRoles see the overview cards.

## Policies page

| Resource | Group | Verb | UI effect |
|-|-|-|-|
| Each policy type | respective group | `list` | "All Policies" tab filters the resource out. Individual policy tabs are always visible in admin perspective; tab content shows "You do not have permission to view this resource" if denied. If all denied, shows "You do not have permission to view Policies". |
| Each policy type | respective group | `create` | Enables that policy in the "Create Policy" dropdown. Disabled with tooltip if denied. If no create on any type, the entire dropdown is disabled. |

DNS and TLS policy tabs are hidden in the developer perspective regardless of permissions. In admin perspective, tabs are always visible but content is RBAC-gated.

## Resource list (kebab menu)

The kebab menu on each resource row checks `update` and `delete`:

| Resource | Verb | UI effect |
|-|-|-|
| The resource's own type | `update` | Enables "Edit" action. Disabled with tooltip if denied. |
| The resource's own type | `delete` | Enables "Delete" action. Disabled with tooltip if denied. |

## Policy Topology page

| Resource | Group | Verb | UI effect |
|-|-|-|-|
| `configmaps` (name: `topology`) | core (`""`) | `get` | Shows topology view. "You do not have permission to view Policy Topology" if denied. |

The ConfigMap is in the namespace where the Kuadrant resource is created (typically `kuadrant-system`).

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

Note: this role grants access on the Policies page but **not** the Overview page (see known limitations).

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

> [!IMPORTANT]
> The topology ConfigMap role cannot be collapsed into the ClusterRole above via a ClusterRoleBinding. Kubernetes ignores `resourceNames` restrictions when used with ClusterRoleBindings - they only take effect with namespace-scoped RoleBindings.

## E2E test coverage

Tests in `e2e/tests/rbac.spec.ts` verify every permission check above using four personas:

| Persona | Type | Permissions | Tests |
|-|-|-|-|
| `test-dev` | Role (kuadrant-test) | httproutes CRUD, gateways read | No policy access; overview Access Denied (namespace-scoped); topology denied |
| `test-viewer` | Role (kuadrant-test) | authpolicies + ratelimitpolicies read-only, gateways + httproutes read-only | Tabs visible but create disabled; DNS/TLS tabs visible but content permission-gated; overview Access Denied (namespace-scoped) |
| `test-devops` | Role (kuadrant-test) | authpolicies + ratelimitpolicies CRUD, gateways + httproutes read | Auth/RateLimit tabs + create enabled; DNS/TLS tabs visible but content permission-gated; overview Access Denied (namespace-scoped) |
| `test-admin` | ClusterRole | All kuadrant + gateway resources CRUD, configmaps read | All tabs visible; all create enabled; overview cards visible; topology accessible |

## Known limitations

| Area | Limitation |
|-|-|
| Overview page | RBAC checks resolve `#ALL_NS#` to `default` namespace. Namespace-scoped users see "Access Denied" on all cards even if they have permissions in their own namespace. Only ClusterRole users see overview content. |
| Overview - gateway health | The gateway health summary card watches gateways cluster-wide and is not gated by RBAC. It always shows 0/0/0 for users without cluster-wide gateway list. |
| Policies page - tabs | Individual policy tabs (DNS, TLS, Auth, etc.) are always visible in admin perspective. Users without `list` permission see a "no permission" message inside the tab, but the tab itself is not hidden. Only the "All Policies" view filters by RBAC. |
| Policy Topology | The topology graph represents the full cluster. Namespace-scoped users can view it if granted `get` on the topology ConfigMap, but cannot filter it to their namespace. |
