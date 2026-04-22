# API Management RBAC

This directory contains the ClusterRole manifests for API Management personas in the Kuadrant Console Plugin.

## Overview

Three core personas with distinct permissions:

- **API Consumer**: Request and manage API access, browse catalog (cluster-wide)
- **API Owner**: Publish APIs, approve access requests (namespace-scoped catalog browsing)
- **API Admin**: Platform operator with cluster-wide permissions

**Binding Requirements**:

- **Consumers**: TWO bindings required
  1. `api-catalog-browser` ClusterRoleBinding (cluster-wide catalog discovery)
  2. `api-consumer` RoleBinding (namespace-scoped APIKey/Secret management)
- **Owners**: ONE binding required
  - `api-owner` RoleBinding (namespace-scoped, includes catalog browsing in their namespace)
- **Admins**: ONE binding required
  - `api-admin` ClusterRoleBinding (cluster-wide, includes catalog browsing)

## ClusterRoles

### 0. api-catalog-browser

**File**: `api-catalog-browser-clusterrole.yaml`

**Purpose**: Provides cluster-wide read access to API catalog resources for discovery

**Permissions** (cluster-wide read-only):

- APIProducts, PlanPolicies, AuthPolicies, RateLimitPolicies
- HTTPRoutes, Gateways

**Used by**: API Consumers (required)

**Binding Example**:

```bash
# Bind to consumer groups (REQUIRED for consumers)
kubectl create clusterrolebinding api-catalog-browser-consumers \
  --clusterrole=api-catalog-browser \
  --group=mobile-app-developers
```

### 1. api-consumer

**File**: `api-consumer-clusterrole.yaml`

**Permissions**:

- **Namespace-scoped** (via RoleBinding):
  - Create/manage APIKeys in assigned namespace(s)
  - Create/manage Secrets in assigned namespace(s)

**Binding Example**:

```bash
# 1. Bind consumer permissions (namespace-scoped)
kubectl create rolebinding api-consumer-alice \
  --clusterrole=api-consumer \
  --user=alice \
  -n consumer-team-mobile
```

### 2. api-owner

**File**: `api-owner-clusterrole.yaml`

**Permissions**:

- **Namespace-scoped** (via RoleBinding):
  - Create/manage APIProducts
  - Create/manage APIKeyApprovals
  - Read APIKeyRequests
  - Read catalog resources (APIProducts, PlanPolicies, Policies, HTTPRoutes, Gateways) in their namespace

**Binding Example**:

```bash
# Bind owner permissions
kubectl create rolebinding api-owner-charlie \
  --clusterrole=api-owner \
  --user=charlie \
  -n api-team-payments
```

### 3. api-admin

**File**: `api-admin-clusterrole.yaml`

**Permissions**:

- All api-management permissions **cluster-wide** (via ClusterRoleBinding)
- Additional: Create/update/delete APIKeys for troubleshooting

**Binding Example**:

```bash
# Bind admin permissions (cluster-wide, includes catalog browsing)
kubectl create clusterrolebinding api-admin-eve \
  --clusterrole=api-admin \
  --user=eve

# Or bind to group:
kubectl create clusterrolebinding api-admin-platform-team \
  --clusterrole=api-admin \
  --group=platform-team
```

## Installation

### Apply ClusterRoles

```bash
kubectl apply -f api-catalog-browser-clusterrole.yaml
kubectl apply -f api-consumer-clusterrole.yaml
kubectl apply -f api-owner-clusterrole.yaml
kubectl apply -f api-admin-clusterrole.yaml
```

### Demo Setup

The demo setup creates 5 OpenShift Groups with ServiceAccount members and appropriate namespaces and bindings:

```bash
cd ../../kuadrant-dev-setup
make demo-install
```

**Demo Groups** (production-oriented approach):

- `mobile-app-developers` - Consumer group (alice in `consumer-team-mobile`)
- `backend-developers` - Consumer group (bob in `consumer-team-backend`)
- `team-payments` - Owner group (charlie in `api-team-payments`)
- `team-shipping` - Owner group (diana in `api-team-shipping`)
- `platform-team` - Admin group (eve in `kuadrant-system`, cluster-wide permissions)

**Why Groups?**

- ✅ **Production-ready**: Matches how real organizations assign permissions
- ✅ **Scalable**: Add/remove users by modifying group membership
- ✅ **Maintainable**: Update group permissions once, affects all members
- ✅ **Testable**: Can still use `--as=system:serviceaccount:...` for ServiceAccount testing

## Testing

### Test Consumer Permissions

**With Group (production approach)**:

```bash
# Mobile developers can browse catalog (cluster-wide)
kubectl auth can-i list apiproducts --as-group=mobile-app-developers --all-namespaces
# Expected: yes

# Mobile developers can manage APIKeys in their namespace
kubectl auth can-i create apikeys --as-group=mobile-app-developers -n consumer-team-mobile
# Expected: yes

# Mobile developers CANNOT create APIKeys in backend namespace (isolation)
kubectl auth can-i create apikeys --as-group=mobile-app-developers -n consumer-team-backend
# Expected: no

# Mobile developers CANNOT read backend secrets (isolation)
kubectl auth can-i get secrets --as-group=mobile-app-developers -n consumer-team-backend
# Expected: no
```

**With ServiceAccount (testing)**:

```bash
# Alice can browse catalog (cluster-wide)
kubectl get apiproducts --all-namespaces --as=system:serviceaccount:consumer-team-mobile:alice

# Alice can manage APIKeys in her namespace
kubectl get apikeys -n consumer-team-mobile --as=system:serviceaccount:consumer-team-mobile:alice

# Alice CANNOT create APIKeys in Bob's namespace (isolation)
kubectl create -f apikey.yaml -n consumer-team-backend --as=system:serviceaccount:consumer-team-mobile:alice
# Expected: Error from server (Forbidden)

# Alice CANNOT read Bob's secrets (isolation)
kubectl get secrets -n consumer-team-backend --as=system:serviceaccount:consumer-team-mobile:alice
# Expected: Error from server (Forbidden)
```

### Test Owner Permissions

**With Group (production approach)**:

```bash
# Payments team can manage APIProducts in their namespace
kubectl auth can-i create apiproducts --as-group=team-payments -n api-team-payments
# Expected: yes

# Payments team can view APIKeyRequests in their namespace
kubectl auth can-i list apikeyrequests --as-group=team-payments -n api-team-payments
# Expected: yes

# Payments team CANNOT manage APIProducts in shipping namespace
kubectl auth can-i create apiproducts --as-group=team-payments -n api-team-shipping
# Expected: no

# Payments team CANNOT read consumer APIKeys (security isolation)
kubectl auth can-i get apikeys --as-group=team-payments -n consumer-team-mobile
# Expected: no
```

**With ServiceAccount (testing)**:

```bash
# Charlie can manage APIProducts in his namespace
kubectl get apiproducts -n api-team-payments --as=system:serviceaccount:api-team-payments:charlie

# Charlie can view APIKeyRequests in his namespace
kubectl get apikeyrequests -n api-team-payments --as=system:serviceaccount:api-team-payments:charlie

# Charlie CANNOT manage APIProducts in Diana's namespace
kubectl create -f apiproduct.yaml -n api-team-shipping --as=system:serviceaccount:api-team-payments:charlie
# Expected: Error from server (Forbidden)

# Charlie CANNOT read consumer APIKeys (security isolation)
kubectl get apikeys -n consumer-team-mobile --as=system:serviceaccount:api-team-payments:charlie
# Expected: Error from server (Forbidden)
```

### Test Admin Permissions

**With Group (production approach)**:

```bash
# Platform team can view all APIProducts cluster-wide
kubectl auth can-i list apiproducts --as-group=platform-team --all-namespaces
# Expected: yes

# Platform team can view all APIKeys cluster-wide (troubleshooting)
kubectl auth can-i list apikeys --as-group=platform-team --all-namespaces
# Expected: yes

# Platform team can create APIProducts in any namespace
kubectl auth can-i create apiproducts --as-group=platform-team -n api-team-payments
# Expected: yes
```

**With ServiceAccount (testing)**:

```bash
# Eve can view all APIProducts cluster-wide
kubectl get apiproducts --all-namespaces --as=system:serviceaccount:kuadrant-system:eve

# Eve can view all APIKeys cluster-wide (troubleshooting)
kubectl get apikeys --all-namespaces --as=system:serviceaccount:kuadrant-system:eve

# Eve can create APIProducts in any namespace
kubectl create -f apiproduct.yaml -n api-team-payments --as=system:serviceaccount:kuadrant-system:eve
```

### Alternative: Test with Token Authentication

```bash
# Get token for Alice
TOKEN=$(kubectl create token alice -n consumer-team-mobile)

# Test with token (no impersonation needed)
kubectl get apiproducts --all-namespaces --token=$TOKEN
kubectl get apikeys -n consumer-team-mobile --token=$TOKEN
```

### Test RBAC Can-I

Use `kubectl auth can-i` to verify permissions without making actual requests:

**With Groups (recommended)**:

```bash
# Consumer tests
kubectl auth can-i create apikeys --as-group=mobile-app-developers -n consumer-team-mobile  # Should be yes
kubectl auth can-i create apikeys --as-group=mobile-app-developers -n consumer-team-backend  # Should be no
kubectl auth can-i list apiproducts --as-group=mobile-app-developers --all-namespaces  # Should be yes

# Owner tests
kubectl auth can-i create apiproducts --as-group=team-payments -n api-team-payments  # Should be yes
kubectl auth can-i create apiproducts --as-group=team-payments -n api-team-shipping  # Should be no
kubectl auth can-i list apikeyrequests --as-group=team-payments -n api-team-payments  # Should be yes
kubectl auth can-i get apikeys --as-group=team-payments -n consumer-team-mobile  # Should be no

# Admin tests
kubectl auth can-i create apiproducts --as-group=platform-team --all-namespaces  # Should be yes
kubectl auth can-i get apikeys --as-group=platform-team --all-namespaces  # Should be yes
```

**With ServiceAccounts (for testing)**:

```bash
# Consumer tests
kubectl auth can-i create apikeys --as=system:serviceaccount:consumer-team-mobile:alice -n consumer-team-mobile  # Should be yes
kubectl auth can-i create apikeys --as=system:serviceaccount:consumer-team-mobile:alice -n consumer-team-backend  # Should be no
kubectl auth can-i list apiproducts --as=system:serviceaccount:consumer-team-mobile:alice --all-namespaces  # Should be yes

# Owner tests
kubectl auth can-i create apiproducts --as=system:serviceaccount:api-team-payments:charlie -n api-team-payments  # Should be yes
kubectl auth can-i create apiproducts --as=system:serviceaccount:api-team-payments:charlie -n api-team-shipping  # Should be no
kubectl auth can-i list apikeyrequests --as=system:serviceaccount:api-team-payments:charlie -n api-team-payments  # Should be yes
kubectl auth can-i get apikeys --as=system:serviceaccount:api-team-payments:charlie -n consumer-team-mobile  # Should be no

# Admin tests
kubectl auth can-i create apiproducts --as=system:serviceaccount:kuadrant-system:eve --all-namespaces  # Should be yes
kubectl auth can-i get apikeys --as=system:serviceaccount:kuadrant-system:eve --all-namespaces  # Should be yes
```

## References

- [RBAC Design Document](../../../docs/designs/2026-03-26-api-management-rbac-design.md)
- [Kubernetes RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
- [Developer Portal Controller](https://github.com/Kuadrant/developer-portal-controller)
