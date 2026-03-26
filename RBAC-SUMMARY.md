# API Management RBAC Implementation Summary

This document provides an overview of the RBAC system designed for Kuadrant Console Plugin's developer portal capabilities.

## What Was Created

### 1. Design Documentation

- **[docs/designs/2026-03-26-api-management-rbac-design.md](docs/designs/2026-03-26-api-management-rbac-design.md)**
  - Complete RBAC design and architecture
  - Key differences from Backstage plugin approach
  - Permission mappings for all three personas
  - UI permission checks and implementation roadmap
  - Full CRD schemas with examples
  - Security considerations and open questions

- **[docs/api-management-rbac-validation.md](docs/api-management-rbac-validation.md)**
  - Step-by-step manual validation procedures
  - kubectl impersonation test scenarios
  - Permission matrix for systematic verification
  - Automated validation script
  - Troubleshooting guide

### 2. RBAC Role Definitions

Located in `config/rbac/`:

- **[api-consumer-role.yaml](config/rbac/api-consumer-role.yaml)**
  - Role: Browse catalog, request API access
  - Scope: Namespace-scoped for creating requests, cluster-wide read for catalog

- **[api-owner-role.yaml](config/rbac/api-owner-role.yaml)**
  - Role: Publish and manage APIs, approve access requests
  - Scope: Namespace-scoped for management, cluster-wide read for discovery

- **[api-admin-clusterrole.yaml](config/rbac/api-admin-clusterrole.yaml)**
  - Role: Platform team managing all APIs and access control
  - Scope: Cluster-wide full access to API management resources

- **[README.md](config/rbac/README.md)**
  - Deployment instructions for each role
  - Common deployment patterns
  - Integration with OpenShift groups
  - Security considerations and troubleshooting

### 3. E2E Test Configuration

- **[e2e/manifests/api-management-rbac.yaml](e2e/manifests/api-management-rbac.yaml)**
  - Test personas for automated E2E validation
  - Uses kubectl impersonation (no real users required)
  - Includes three test namespaces: `api-team-a`, `api-team-b`, `api-consumers`
  - Four test users: `test-api-consumer`, `test-api-owner-team-a`, `test-api-owner-team-b`, `test-api-admin`

## Three Personas

### 🟦 API Consumer

```
Browse Catalog → Request Access → View Secret → Use API
```

- **Can**: Browse all APIs and policies (cluster-wide), create/update/delete own API keys, read secrets after approval
- **Cannot**: Create APIs, approve requests (set status.phase), view other consumers' API keys
- **Scope**: Cluster-wide read for catalog/policies, namespace-scoped write for APIKeys
- **Key permissions**: `create/update/delete apikeys`, `update apikeys/status` (canReadSecret only), `get secrets`

### 🟨 API Owner

```
Create API → Publish → Review Requests → Approve/Reject
```

- **Can**: Manage APIs in own namespace(s), approve/reject API keys (update status.phase), browse catalog cluster-wide
- **Cannot**: Manage resources in other teams' namespaces, create PlanPolicies
- **Scope**: Namespace-scoped write operations, cluster-wide read for discovery
- **Key permissions**: `create/update/delete apiproducts`, `update apikeys/status` (approve/reject), `get httproutes/gateways`

### 🟥 API Admin

```
Manage Everything → Troubleshoot → Override Decisions
```

- **Can**: Full CRUD on all API Management resources cluster-wide, create/manage PlanPolicies, troubleshoot on behalf of owners
- **Cannot**: (Optional restrictions on infrastructure Gateways/HTTPRoutes - platform engineer role)
- **Scope**: Cluster-wide full access
- **Key permissions**: All verbs on `apiproducts`, `apikeys`, `apikeys/status`, `planpolicies`, plus `get/list secrets`

## Key Design Decisions

### 1. Namespace-Based Isolation vs Ownership Annotations

| Backstage Plugin | Console Plugin |
|------------------|----------------|
| Uses `backstage.io/owner` annotation | Uses namespace-based RBAC |
| `.own` vs `.all` permission scopes | Namespace vs cluster scopes |
| Ownership immutable at creation | Ownership = namespace access |

**Why**: OpenShift/Kubernetes has native namespace isolation, which provides stronger boundaries than annotations.

### 2. Cluster-Wide Read for Discovery

All personas can `list` and `get` APIProducts cluster-wide to enable API discovery.

**Why**: Developer portal needs a browsable catalog. Write operations are namespace-scoped for security.

### 3. Separate Roles for Namespace and Cluster Access

Each persona has TWO bindings:

- **Role + RoleBinding**: Namespace-scoped write operations
- **ClusterRole + ClusterRoleBinding**: Cluster-wide read operations

**Why**: Enables discovery while maintaining namespace isolation for mutations.

### 4. APIKey Namespace Placement

**Design decision**: APIKeys must be created in the **same namespace as the APIProduct** they reference.

**Why**:
- APIKey has a local reference to APIProduct (no namespace field in `spec.apiProductRef`)
- Simplifies approval workflow (owners manage APIKeys in their own namespace)
- Secrets are created in same namespace as APIKey by Developer Portal Controller

**Implications**:
- Consumers need permissions in API owner namespaces to create APIKeys
- UI filters APIKey lists by `spec.requestedBy.userId` so consumers see only their own
- Secrets remain in owner namespace (consumer reads cross-namespace or copies manually)

## Quick Start

### 1. Deploy Test Environment

```bash
# Apply test RBAC personas
kubectl apply -f e2e/manifests/api-management-rbac.yaml

# Verify namespaces
kubectl get namespaces | grep api-
# Expected: api-team-a, api-team-b, api-consumers
```

### 2. Test Consumer Permissions

```bash
# Consumer can list all API products
kubectl get apiproducts --all-namespaces --as=test-api-consumer

# Consumer CANNOT create API products
kubectl auth can-i create apiproducts --as=test-api-consumer -n api-consumers
# Expected: no
```

### 3. Test Owner Permissions

```bash
# Owner can create in own namespace
kubectl auth can-i create apiproducts --as=test-api-owner-team-a -n api-team-a
# Expected: yes

# Owner CANNOT create in other namespace
kubectl auth can-i create apiproducts --as=test-api-owner-team-a -n api-team-b
# Expected: no
```

### 4. Test Admin Permissions

```bash
# Admin can create anywhere
kubectl auth can-i create apiproducts --as=test-api-admin -n api-team-a
# Expected: yes

# Admin can create PlanPolicies
kubectl auth can-i create planpolicies --as=test-api-admin -n kuadrant-system
# Expected: yes
```

## Permission Matrix

### Core API Management Resources

| Resource | Action | Consumer | Owner (own NS) | Owner (other NS) | Admin |
|----------|--------|:--------:|:--------------:|:----------------:|:-----:|
| **APIProduct** | get/list | ✅ Cluster-wide | ✅ Cluster-wide | ✅ Cluster-wide | ✅ Cluster-wide |
| APIProduct | create | ❌ | ✅ | ❌ | ✅ |
| APIProduct | update | ❌ | ✅ | ❌ | ✅ |
| APIProduct | delete | ❌ | ✅ | ❌ | ✅ |
| **APIKey (spec)** | get/list | ✅ | ✅ | ❌ | ✅ Cluster-wide |
| APIKey | create | ✅ | ✅ | ❌ | ✅ |
| APIKey | update | ✅ | ✅ | ❌ | ✅ |
| APIKey | delete | ✅ | ✅ | ❌ | ✅ |
| **APIKey (status)** | get | ✅ | ✅ | ❌ | ✅ |
| APIKey (status) | update | ✅ (canReadSecret) | ✅ (approve/reject) | ❌ | ✅ |

### Supporting Policies and Routes (Read-Only)

| Resource | Action | Consumer | Owner | Admin |
|----------|--------|:--------:|:-----:|:-----:|
| PlanPolicy | get/list | ✅ Cluster-wide | ✅ Cluster-wide | ✅ Cluster-wide |
| PlanPolicy | create/update/delete | ❌ | ❌ | ✅ |
| AuthPolicy | get/list | ✅ Cluster-wide | ✅ Cluster-wide | ✅ Cluster-wide |
| RateLimitPolicy | get/list | ✅ Cluster-wide | ✅ Cluster-wide | ✅ Cluster-wide |
| HTTPRoute | get/list | ✅ Cluster-wide | ✅ Cluster-wide | ✅ Cluster-wide |
| Gateway | get/list | ❌ | ✅ Cluster-wide | ✅ Cluster-wide |
| Secret | get | ✅ | ✅ | ✅ |
| Secret | list | ❌ | ❌ | ✅ |

**Notes**:
- **APIKey (spec)**: Consumer can update/delete their own APIKeys (UI filters by `spec.requestedBy.userId`)
- **APIKey (status)**: Consumer updates `canReadSecret` (one-time viewing), Owner updates `phase` (approval/rejection)
- **Policies/Routes**: Read-only for API Management role. Owners may have write access via separate policy management roles in their namespaces.
- **Cluster-wide**: Permission applies across all namespaces (for discovery/catalog browsing)

## Deployment Patterns

### Pattern 1: Namespace Per Team

```bash
# Each team gets a namespace
kubectl create namespace team-payment
kubectl create namespace team-shipping

# Teams manage APIs in their namespace
kubectl create rolebinding api-owner \
  --role=api-owner \
  --group=team-payment \
  -n team-payment
```

### Pattern 2: Dedicated Consumer Namespaces

```bash
# External consumers get their own namespace for requests
kubectl create namespace consumer-mobile-app
kubectl create rolebinding api-consumer \
  --role=api-consumer \
  --group=mobile-app-devs \
  -n consumer-mobile-app
```

### Pattern 3: Shared Request Namespace

```bash
# All API key requests go to a shared namespace
kubectl create namespace api-requests

# All owners can approve requests there
for team in team-a team-b; do
  kubectl create rolebinding api-owner-$team \
    --role=api-owner \
    --group=$team \
    -n api-requests
done
```

## Next Steps

### Phase 1: RBAC Foundation (✅ Complete)

- ✅ Design document
- ✅ Role definitions
- ✅ Test personas
- ✅ Validation guide

### Phase 2: UI Implementation (TODO)

- [ ] Add permission checks to API Management components
- [ ] Hide/disable UI elements based on RBAC
- [ ] Implement `SelfSubjectAccessReview` checks
- [ ] Update console-extensions.json if needed

### Phase 3: E2E Testing (TODO)

- [ ] Create `e2e/tests/api-management-rbac.spec.ts`
- [ ] Test consumer scenario: browse + request access
- [ ] Test owner scenario: create product + approve requests
- [ ] Test admin scenario: manage everything
- [ ] Test negative scenarios: verify denials

### Phase 4: Documentation (TODO)

- [ ] Update main RBAC docs (docs/rbac.md)
- [ ] Add API management section to README
- [ ] Create admin deployment guide
- [ ] Add examples to kuadrant-dev-setup

### Phase 5: Kuadrant Operator Integration (Future)

- [ ] Include API Management ClusterRoles in Kuadrant Operator deployment
- [ ] Auto-create RBAC roles when Kuadrant is installed
- [ ] Document RoleBinding creation for users/groups
- [ ] Namespace templates for team onboarding

**Note**: APIKey approval controller and secret generation are handled by the [Developer Portal Controller](https://github.com/Kuadrant/developer-portal-controller), not the console plugin.

## Validation Checklist

Use this checklist when testing the RBAC implementation:

### Consumer Testing

- [ ] Can list all APIProducts cluster-wide
- [ ] Can get specific APIProduct details
- [ ] Can view PlanPolicies, AuthPolicies, RateLimitPolicies, HTTPRoutes (read-only)
- [ ] Can create APIKey in API owner's namespace
- [ ] Can update own APIKey (UI filters by `requestedBy.userId`)
- [ ] Can delete own APIKey
- [ ] Can update APIKey status (`canReadSecret` flag only)
- [ ] Can read Secret (after APIKey is approved)
- [ ] Cannot create APIProducts
- [ ] Cannot approve APIKeys (cannot set `status.phase`)
- [ ] Cannot create PlanPolicies

### Owner Testing

- [ ] Can list all APIProducts cluster-wide
- [ ] Can create APIProduct in own namespace
- [ ] Can update/delete APIProduct in own namespace
- [ ] Cannot create APIProduct in other namespace
- [ ] Cannot delete APIProduct in other namespace
- [ ] Can list APIKeys in own namespace
- [ ] Can update APIKey status (`status.phase`, `reviewedBy`, `reviewedAt`) to approve/reject
- [ ] Can delete APIKeys in own namespace
- [ ] Can read Secrets in own namespace (for troubleshooting)
- [ ] Can view HTTPRoutes and Gateways cluster-wide
- [ ] Cannot create PlanPolicies

### Admin Testing

- [ ] Can list APIProducts cluster-wide
- [ ] Can create APIProduct in any namespace
- [ ] Can update/delete APIProduct in any namespace
- [ ] Can list APIKeys cluster-wide
- [ ] Can update APIKey status in any namespace (approve/reject on behalf of owners)
- [ ] Can delete APIKeys in any namespace
- [ ] Can create/update/delete PlanPolicies
- [ ] Can list Secrets cluster-wide (for troubleshooting)
- [ ] Can view all Kuadrant policies (AuthPolicy, RateLimitPolicy, etc.)
- [ ] Can access topology ConfigMap

## Files Reference

```
kuadrant-console-plugin/
├── config/rbac/                          # RBAC role definitions
│   ├── README.md                         # Deployment guide
│   ├── api-consumer-role.yaml            # Consumer role
│   ├── api-owner-role.yaml               # Owner role
│   └── api-admin-clusterrole.yaml        # Admin cluster role
├── docs/
│   ├── designs/
│   │   └── 2026-03-26-api-management-rbac-design.md  # Design document
│   └── api-management-rbac-validation.md # Validation guide
├── e2e/manifests/
│   └── api-management-rbac.yaml          # Test personas
└── RBAC-SUMMARY.md                       # This file
```

## Resources

- [Kuadrant Backstage Plugin RBAC](https://github.com/Kuadrant/kuadrant-backstage-plugin/blob/main/docs/rbac-permissions.md) - Original permissions design
- [Kubernetes RBAC Documentation](https://kubernetes.io/docs/reference/access-authn-authz/rbac/) - K8s RBAC reference
- [OpenShift Authorization](https://docs.openshift.com/container-platform/latest/authentication/using-rbac.html) - OpenShift RBAC guide

## Questions & Feedback

For questions or feedback on this RBAC design:

1. Check the troubleshooting sections in:
   - `config/rbac/README.md`
   - `docs/api-management-rbac-validation.md`

2. Review the design decisions in:
   - `docs/designs/2026-03-26-api-management-rbac-design.md`

3. Test using the validation guide:
   - `docs/api-management-rbac-validation.md`

4. Open an issue: <https://github.com/Kuadrant/kuadrant-console-plugin/issues>
