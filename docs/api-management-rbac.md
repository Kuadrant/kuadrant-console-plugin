# API Management RBAC Design

## Overview

This document describes the RBAC system for developer portal capabilities in the Kuadrant Console Plugin. Unlike the Backstage plugin which uses ownership-based permissions (`backstage.io/owner` annotations), the console plugin uses **OpenShift's namespace-based RBAC**.

## Design Principles

1. **Namespace-scoped permissions**: API Owners manage APIs within their assigned namespaces
2. **Standard Kubernetes RBAC**: Uses Roles, ClusterRoles, RoleBindings, and ClusterRoleBindings
3. **Explicit permissions**: Each capability maps to specific Kubernetes verbs (get, list, create, update, delete)
4. **Progressive disclosure**: UI elements are hidden/disabled based on permission checks via `SelfSubjectAccessReview`
5. **Backend enforcement**: RBAC is enforced by Kubernetes API server, not just UI hints

## Key Differences from Backstage Plugin

| Aspect | Backstage Plugin | Console Plugin |
|--------|------------------|----------------|
| **Authorization model** | Ownership annotations (`backstage.io/owner`) | Namespace-based RBAC |
| **Permission granularity** | `.own` vs `.all` scopes | Namespace scope vs cluster scope |
| **Ownership transfer** | Immutable at creation | N/A (controlled by namespace access) |
| **Multi-tenancy** | Single catalog with ownership filtering | Namespace isolation |
| **Permission system** | Custom Backstage permissions | Kubernetes RBAC verbs |

## API Management Resources

The following CRDs are used for developer portal capabilities:

1. **APIProduct** (`extensions.kuadrant.io/v1alpha1`)
   - Published API catalog entries
   - References HTTPRoute via `targetRef`
   - Contains metadata: displayName, description, version, tags, documentation
   - Supports approval modes: `manual`, `automatic`

2. **APIKeyRequest** (`extensions.kuadrant.io/v1alpha1`)
   - Consumer requests for API access
   - References APIProduct
   - Contains approval status and API key credentials

3. **PlanPolicy** (`extensions.kuadrant.io/v1alpha1`)
   - Rate limiting plans with tiers (e.g., free, basic, premium)
   - Platform-managed resource (typically cluster-scoped or system namespace)

## Three Core Personas

### 1. API Consumer

**Role**: Developers who discover and consume APIs

**Capabilities**:
- Browse and read all published API products (cluster-wide)
- Request API access by creating APIKeyRequest resources (in their namespace)
- View and manage their own API key requests (namespace-scoped)
- View rate limiting plans (read-only reference)

**Cannot**:
- Create or modify API products
- Approve/reject API access requests
- View other consumers' API keys

**Typical use case**: External developer wants to use an internal API, browses catalog, requests access with justification, receives API key when approved.

### 2. API Owner

**Role**: Teams that publish and manage APIs

**Capabilities**:
- All consumer permissions, plus:
- Create API products in assigned namespaces
- Update and delete API products they own (namespace-scoped)
- Read all API products in the catalog (cluster-wide for discovery)
- Approve/reject API key requests for their API products (namespace-scoped)
- View and manage API key requests in their namespaces
- View HTTPRoutes and Gateways (to reference in APIProducts)

**Cannot**:
- Manage API products in other namespaces
- Create or modify PlanPolicies (platform-managed)
- Delete other teams' API key requests

**Typical use case**: Payment service team publishes "Payment API v2" in `payment-services` namespace, reviews incoming access requests, approves legitimate requests.

### 3. API Admin

**Role**: Platform team managing the API catalog and access control

**Capabilities**:
- All owner permissions across all namespaces (cluster-wide)
- Create, read, update, delete any API product (cluster-scoped)
- Approve/reject any API key request (cluster-scoped)
- Manage all API keys across the platform
- Troubleshoot on behalf of API owners
- View and manage PlanPolicies (platform-level rate limiting)

**Cannot** (optional restrictions):
- Typically has full access but may be restricted from:
  - Modifying infrastructure Gateways/HTTPRoutes (platform engineer role)
  - Deleting PlanPolicies without approval

**Typical use case**: Platform team member investigates why a consumer's API key isn't working, can view all requests across namespaces, can force-approve urgent requests.

## Permission Mapping

### APIProduct Permissions

| Kubernetes Verb | API Consumer | API Owner (namespace) | API Admin (cluster) |
|-----------------|--------------|----------------------|---------------------|
| `list` | ✅ Cluster-wide | ✅ Cluster-wide | ✅ Cluster-wide |
| `get` | ✅ Cluster-wide | ✅ Cluster-wide | ✅ Cluster-wide |
| `create` | ❌ | ✅ Namespace-scoped | ✅ Cluster-wide |
| `update` | ❌ | ✅ Namespace-scoped | ✅ Cluster-wide |
| `patch` | ❌ | ✅ Namespace-scoped | ✅ Cluster-wide |
| `delete` | ❌ | ✅ Namespace-scoped | ✅ Cluster-wide |

**Note**: `list` and `get` are cluster-wide for all personas to enable API discovery. Namespace isolation is enforced on write operations.

### APIKeyRequest Permissions

| Kubernetes Verb | API Consumer | API Owner (namespace) | API Admin (cluster) |
|-----------------|--------------|----------------------|---------------------|
| `list` | ✅ Namespace-scoped | ✅ Namespace-scoped | ✅ Cluster-wide |
| `get` | ✅ Namespace-scoped | ✅ Namespace-scoped | ✅ Cluster-wide |
| `create` | ✅ Namespace-scoped | ✅ Namespace-scoped | ✅ Cluster-wide |
| `update` | ✅ Namespace-scoped (own) | ✅ Namespace-scoped | ✅ Cluster-wide |
| `patch` | ✅ Namespace-scoped (own) | ✅ Namespace-scoped | ✅ Cluster-wide |
| `delete` | ✅ Namespace-scoped (own) | ✅ Namespace-scoped | ✅ Cluster-wide |

**Note**: Consumers create requests in their own namespace. Owners approve requests in their namespace (where the APIProduct lives). The UI will filter requests based on ownership context.

### PlanPolicy Permissions

| Kubernetes Verb | API Consumer | API Owner | API Admin |
|-----------------|--------------|-----------|-----------|
| `list` | ✅ Read-only | ✅ Read-only | ✅ Full access |
| `get` | ✅ Read-only | ✅ Read-only | ✅ Full access |
| `create` | ❌ | ❌ | ✅ (Platform team) |
| `update` | ❌ | ❌ | ✅ (Platform team) |
| `delete` | ❌ | ❌ | ✅ (Platform team) |

## RBAC Role Definitions

See the following files for concrete implementations:

- `config/rbac/api-consumer-role.yaml` - API Consumer role
- `config/rbac/api-owner-role.yaml` - API Owner role
- `config/rbac/api-admin-clusterrole.yaml` - API Admin cluster role
- `e2e/manifests/api-management-rbac.yaml` - Test personas for E2E validation

## UI Permission Checks

The console plugin uses `SelfSubjectAccessReview` to check permissions and conditionally render UI elements:

### API Products Page

| UI Element | Permission Check |
|------------|------------------|
| Product list | `list` on `apiproducts.extensions.kuadrant.io` |
| "Create Product" button | `create` on `apiproducts.extensions.kuadrant.io` in active namespace |
| "Edit" kebab action | `update` on specific APIProduct |
| "Delete" kebab action | `delete` on specific APIProduct |

### API Access Requests Page

| UI Element | Permission Check |
|------------|------------------|
| Request list | `list` on `apikeyrequests.extensions.kuadrant.io` |
| "Request Access" button | `create` on `apikeyrequests.extensions.kuadrant.io` in active namespace |
| "Approve/Reject" actions | `update` on specific APIKeyRequest |
| "Delete" kebab action | `delete` on specific APIKeyRequest |

### Plans Page

| UI Element | Permission Check |
|------------|------------------|
| Plan list | `list` on `planpolicies.extensions.kuadrant.io` |
| Plan details | `get` on specific PlanPolicy |
| "Create Plan" button | `create` on `planpolicies.extensions.kuadrant.io` |

## Validation Strategy

### Manual Testing

Test each persona using `kubectl` impersonation:

```bash
# Test as API Consumer
kubectl get apiproducts --all-namespaces --as=api-consumer
kubectl create apiproduct my-request --as=api-consumer -n consumer-namespace

# Test as API Owner
kubectl get apiproducts --all-namespaces --as=api-owner-team-a
kubectl create apiproduct payment-api --as=api-owner-team-a -n team-a-namespace
kubectl create apiproduct payment-api --as=api-owner-team-a -n team-b-namespace  # Should fail

# Test as API Admin
kubectl get apiproducts --all-namespaces --as=api-admin
kubectl delete apiproduct any-product --as=api-admin -n any-namespace
```

### E2E Testing

Create test scenarios in `e2e/tests/api-management-rbac.spec.ts`:

1. **Consumer scenario**: Browse catalog, request access, view own keys
2. **Owner scenario**: Create product, approve request, manage namespace resources
3. **Admin scenario**: View all resources, cross-namespace operations
4. **Negative tests**: Verify denials (consumer can't approve, owner can't access other namespaces)

## Implementation Roadmap

1. **Phase 1**: Create RBAC role definitions (this document)
2. **Phase 2**: Implement UI permission checks in API management components
3. **Phase 3**: Create E2E test suite for RBAC validation
4. **Phase 4**: Document deployment patterns (namespace-per-team, shared namespaces)
5. **Phase 5**: Create admin guide for setting up developer portal RBAC

## Known Limitations

1. **Cross-namespace request approval**: If a consumer in `namespace-a` requests access to an API in `namespace-b`, the owner in `namespace-b` must have RBAC to view APIKeyRequests in both namespaces. Solution: Standardize on having consumers create requests in the API owner's namespace, or use a shared "requests" namespace.

2. **Global discovery vs namespace isolation**: All personas can `list` and `get` APIProducts cluster-wide for discovery. This means API products are effectively public within the cluster. Use `publishStatus: Draft` to hide products that aren't ready.

3. **No ownership immutability**: Unlike Backstage, Kubernetes doesn't prevent changing resource ownership. However, namespace isolation provides strong boundaries.

4. **APIKeyRequest status updates**: Approving a request requires `update` permission on the APIKeyRequest. The controller that processes approvals must have appropriate RBAC.

## Future Enhancements

1. **Validating webhook**: Enforce that APIProducts can only reference HTTPRoutes in the same namespace
2. **Admission controller**: Automatically set labels/annotations based on namespace for tracking
3. **Namespace templates**: Auto-provision RBAC when creating new team namespaces
4. **Service accounts**: Define service account permissions for automation/CI workflows
5. **Audit logging**: Track who approved/rejected API access requests
