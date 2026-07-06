# API Management RBAC

This document describes the ClusterRoles for API Management personas, their permissions, and binding requirements.

## Overview

API Management RBAC is designed around three personas with distinct responsibilities:

- **API Consumer**: Developers who discover APIs and request access
- **API Owner**: Teams who publish and manage APIs
- **API Admin**: Platform operators with cluster-wide access

**Key architectural principle**: Catalog discovery is cluster-wide, but resource management is namespace-scoped with strong isolation between consumer and owner namespaces.

## Personas

### API Consumer

**Role**: Developers who browse the API catalog, request API keys, and integrate APIs into applications.

**Capabilities**:

- Discover published APIs across the cluster
- Request API keys for API products
- Manage their own API keys and secrets (namespace-scoped)
- View API documentation and usage examples

**Binding requirements**: TWO bindings (see [Binding Requirements](#binding-requirements))

### API Owner

**Role**: Teams who publish APIs, define products, and approve consumer access requests.

**Capabilities**:

- Publish API products in their namespace
- Manage product definitions, documentation, and lifecycle
- Approve/reject API key requests for their products
- View access requests (APIKeyRequest shadow resources)
- Browse the cluster catalog for discovery

**Binding requirements**: ONE RoleBinding (see [Binding Requirements](#binding-requirements))

**Security boundary**: Owners NEVER have access to consumer APIKeys or Secrets. They see APIKeyRequest resources which do NOT contain API key values.

### API Admin

**Role**: Platform operators who manage the API Management platform and troubleshoot issues.

**Capabilities**:

- All owner capabilities, cluster-wide
- View and manage APIKeys for troubleshooting
- View all APIKeyRequests across namespaces
- Approve/reject on behalf of owners

**Binding requirements**: ONE ClusterRoleBinding (see [Binding Requirements](#binding-requirements))

**Security boundary**: Even admins do NOT have Secret read permissions in consumer namespaces. Consumer API key values remain isolated.

## ClusterRoles

### 0. api-catalog-browser

**File**: `config/rbac/api-management/api-catalog-browser-clusterrole.yaml`

**Purpose**: Provides cluster-wide read access to API catalog resources for discovery.

**Permissions**:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: api-catalog-browser
rules:
  - apiGroups: ["devportal.kuadrant.io"]
    resources: ["apiproducts"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["extensions.kuadrant.io"]
    resources: ["planpolicies"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["kuadrant.io"]
    resources: ["authpolicies", "ratelimitpolicies"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["gateway.networking.k8s.io"]
    resources: ["httproutes", "gateways"]
    verbs: ["get", "list", "watch"]
```

**Used by**: API Consumers (required), API Owners (included in owner role), API Admins (included in admin role)

### 1. api-consumer

**File**: `config/rbac/api-management/api-consumer-clusterrole.yaml`

**Purpose**: Enables consumers to create and manage API keys in assigned namespaces.

**Permissions**:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: api-consumer
rules:
  - apiGroups: ["devportal.kuadrant.io"]
    resources: ["apikeys"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["get", "list", "watch", "create", "update", "delete"]
```

**Used by**: API Consumers

**Binding**: RoleBinding in consumer namespace(s)

### 2. api-owner

**File**: `config/rbac/api-management/api-owner-clusterrole.yaml`

**Purpose**: Allows teams to publish APIs and manage consumer access requests.

**Permissions**:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: api-owner
rules:
  # Namespace-scoped (via RoleBinding)
  - apiGroups: ["devportal.kuadrant.io"]
    resources: ["apiproducts"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["devportal.kuadrant.io"]
    resources: ["apikeyapprovals"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["devportal.kuadrant.io"]
    resources: ["apikeyrequests"]
    verbs: ["get", "list", "watch"]

  # Cluster-wide read (for discovery)
  - apiGroups: ["extensions.kuadrant.io"]
    resources: ["planpolicies"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["kuadrant.io"]
    resources: ["authpolicies", "ratelimitpolicies"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["gateway.networking.k8s.io"]
    resources: ["httproutes", "gateways"]
    verbs: ["get", "list", "watch"]
```

**Used by**: API Owners

**Binding**: RoleBinding in owner namespace(s)

**Key characteristics**:

- Includes cluster-wide read for catalog browsing
- Namespace-scoped write for APIProducts and APIKeyApprovals
- Owners see APIKeyRequest resources, NOT consumer APIKeys or Secrets

### 3. api-admin

**File**: `config/rbac/api-management/api-admin-clusterrole.yaml`

**Purpose**: Provides platform operators cluster-wide access for management and troubleshooting.

**Permissions**:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: api-admin
rules:
  # All api-owner permissions, cluster-wide
  - apiGroups: ["devportal.kuadrant.io"]
    resources: ["apiproducts"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["devportal.kuadrant.io"]
    resources: ["apikeyapprovals"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["devportal.kuadrant.io"]
    resources: ["apikeyrequests"]
    verbs: ["get", "list", "watch"]

  # Additional troubleshooting: Full APIKey access
  - apiGroups: ["devportal.kuadrant.io"]
    resources: ["apikeys"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]

  # Catalog resources
  - apiGroups: ["extensions.kuadrant.io"]
    resources: ["planpolicies"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["kuadrant.io"]
    resources: ["authpolicies", "ratelimitpolicies"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["gateway.networking.k8s.io"]
    resources: ["httproutes", "gateways"]
    verbs: ["get", "list", "watch"]
```

**Used by**: API Admins

**Binding**: ClusterRoleBinding (cluster-wide scope)

**Key characteristics**:

- Same core permissions as `api-owner` but cluster-wide
- Additional APIKey write access for troubleshooting
- Intentional limitation: No Secret read permissions in consumer namespaces

## Binding Requirements

### API Consumer

Consumers require **TWO bindings**:

1. **ClusterRoleBinding** for `api-catalog-browser` (cluster-wide catalog discovery)
2. **RoleBinding** for `api-consumer` in their namespace (APIKey/Secret management)

**Why two bindings?**

- Catalog browsing is cluster-wide (discover all published APIs)
- APIKey/Secret management is namespace-scoped (team isolation)

**Example**:

```yaml
# Cluster-wide catalog browsing
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: api-catalog-browser-mobile-devs
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: api-catalog-browser
subjects:
- kind: Group
  name: mobile-app-developers
  apiGroup: rbac.authorization.k8s.io

---
# Namespace-scoped APIKey management
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: api-consumer-mobile-devs
  namespace: consumer-team-mobile
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: api-consumer
subjects:
- kind: Group
  name: mobile-app-developers
  apiGroup: rbac.authorization.k8s.io
```

**Notes**:

- Bind `api-catalog-browser` to groups/users who need to discover APIs
- Bind `api-consumer` per consumer namespace via RoleBinding
- Supports User, Group, or ServiceAccount subjects

### API Owner

Owners require **ONE binding**:

**RoleBinding** for `api-owner` in their team's namespace

**Why one binding?**

- The `api-owner` ClusterRole includes both namespace-scoped management AND cluster-wide catalog read
- When bound via RoleBinding, write operations are namespace-scoped, read operations are cluster-wide

**Example**:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: api-owner-payments-team
  namespace: api-team-payments
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: api-owner
subjects:
- kind: Group
  name: team-payments
  apiGroup: rbac.authorization.k8s.io
```

**Notes**:

- Bind per owner namespace via RoleBinding
- Owners can publish APIs in their namespace and browse the catalog cluster-wide
- Supports User, Group, or ServiceAccount subjects

### API Admin

Admins require **ONE binding**:

**ClusterRoleBinding** for `api-admin`

**Example**:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: api-admin-platform-team
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: api-admin
subjects:
- kind: Group
  name: platform-team
  apiGroup: rbac.authorization.k8s.io
```

**Notes**:

- Bind cluster-wide via ClusterRoleBinding
- Supports User, Group, or ServiceAccount subjects
- Typically bound to platform/SRE teams

## Installation

### Apply ClusterRoles

```bash
kubectl apply -f config/rbac/api-management/api-catalog-browser-clusterrole.yaml
kubectl apply -f config/rbac/api-management/api-consumer-clusterrole.yaml
kubectl apply -f config/rbac/api-management/api-owner-clusterrole.yaml
kubectl apply -f config/rbac/api-management/api-admin-clusterrole.yaml
```

### Create Bindings

Bindings are **not** included in this repository as they depend on your organization's users, groups, and namespaces. Create bindings according to the [Binding Requirements](#binding-requirements) section above.

## Security Model

### Namespace Isolation

API Management enforces strict namespace boundaries:

- **Consumer namespaces**: Consumers manage APIKeys and Secrets in their assigned namespace(s) only
- **Owner namespaces**: Owners manage APIProducts and APIKeyApprovals in their team namespace(s)
- **Cross-namespace references**: APIKey resources can reference APIProducts in other namespaces, but consumers can only create APIKeys in namespaces where they have RoleBindings

### APIKey Value Isolation

API key values are protected through architectural isolation:

1. **Consumer creates APIKey**: Consumer creates a Secret containing the API key value, then creates an APIKey resource referencing that Secret (`spec.secretRef`)
2. **Controller creates APIKeyRequest**: The developer-portal-controller creates an APIKeyRequest shadow resource in the owner's namespace (does NOT contain API key value)
3. **Owner approves**: Owner creates an APIKeyApproval resource in their namespace
4. **Controller enforces**: Controller creates enforcement Secret in Kuadrant namespace (consumer cannot access)

**Result**: Owners NEVER see consumer API key values. Even admins do not have Secret read permissions in consumer namespaces.

## Testing Permissions

Use `kubectl auth can-i` to verify RBAC without making actual requests:

```bash
# Test consumer catalog browsing (should be yes)
kubectl auth can-i list apiproducts \
  --as-group=mobile-app-developers \
  --all-namespaces

# Test consumer APIKey management in their namespace (should be yes)
kubectl auth can-i create apikeys \
  --as-group=mobile-app-developers \
  -n consumer-team-mobile

# Test consumer cannot create APIKeys in other namespaces (should be no)
kubectl auth can-i create apikeys \
  --as-group=mobile-app-developers \
  -n consumer-team-backend

# Test owner can create APIProducts in their namespace (should be yes)
kubectl auth can-i create apiproducts \
  --as-group=team-payments \
  -n api-team-payments

# Test owner cannot access consumer APIKeys (should be no)
kubectl auth can-i get apikeys \
  --as-group=team-payments \
  -n consumer-team-mobile

# Test admin has cluster-wide access (should be yes)
kubectl auth can-i list apikeys \
  --as-group=platform-team \
  --all-namespaces
```

Replace `--as-group` with `--as=<username>` or `--as=system:serviceaccount:<namespace>:<name>` as needed.

## Known Limitations

| Area | Limitation |
|-|-|
| Catalog browsing scope | The `api-catalog-browser` ClusterRole grants cluster-wide read. There is no way to limit catalog browsing to specific namespaces. All catalog browsers see all published products. |
| Admin Secret access | Even admins do NOT have `secrets` read permissions in consumer namespaces. Consumer API key values remain isolated. Admins can view APIKey resources but cannot access the secret values. |

## References

- [Developer Portal Controller](https://github.com/Kuadrant/developer-portal-controller)
