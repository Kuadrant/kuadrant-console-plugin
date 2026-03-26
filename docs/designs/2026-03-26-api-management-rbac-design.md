# Feature: API Management RBAC

## Summary

This design defines the RBAC system for developer portal capabilities in the Kuadrant Console Plugin. Unlike the Backstage plugin which uses ownership-based permissions (`backstage.io/owner` annotations), the console plugin uses **OpenShift's namespace-based RBAC** to control access to API products, API keys, and rate limiting plans.

The design introduces three personas (API Consumer, API Owner, API Admin) with distinct permissions, leveraging Kubernetes native RBAC (Roles, ClusterRoles, RoleBindings, ClusterRoleBindings) to enforce access control. All operations are performed as the logged-in user via the OpenShift Console's authentication system.

## Goals

- Define RBAC roles for three core personas: API Consumer, API Owner, and API Admin
- Enable namespace-based isolation for API product management
- Support cluster-wide API discovery while maintaining write operation security
- Provide clear permission boundaries using standard Kubernetes RBAC mechanisms
- Document deployment patterns for different organizational structures
- Create validation procedures to test RBAC implementation
- Ensure console plugin UI respects RBAC via `SelfSubjectAccessReview` checks

## Non-Goals

- Custom authorization logic beyond Kubernetes RBAC
- Ownership annotations (using namespace isolation instead)
- Backend service accounts (all operations use logged-in user's permissions)
- Cross-namespace secret synchronization (consumer reads secrets from owner namespace)
- Automated RBAC provisioning (covered by Kuadrant Operator in future enhancement)
- Developer Portal Controller RBAC (separate concern, controller has its own service account)

## Design

### Backwards Compatibility

**No breaking changes.** This is a new feature adding RBAC definitions for API Management resources that didn't previously have defined roles in the console plugin.

The new roles are additive and focus on API Management resources:
- `APIProduct` (`devportal.kuadrant.io/v1alpha1`) - API catalog entries
- `APIKey` (`devportal.kuadrant.io/v1alpha1`) - Consumer API access requests

**API Consumer read permissions** include policies and routes:
- `PlanPolicy` (`extensions.kuadrant.io/v1alpha1`) - Rate limiting plan templates
- `AuthPolicy` (`kuadrant.io/v1`) - Authentication and authorization requirements
- `RateLimitPolicy` (`kuadrant.io/v1`) - Rate limiting configurations
- `HTTPRoute` (`gateway.networking.k8s.io/v1`) - API endpoints and routing rules

All policies (PlanPolicy, AuthPolicy, RateLimitPolicy) are treated uniformly with read-only access for consumers.

Existing RBAC for other policies (DNSPolicy, TLSPolicy) remains unchanged.

### Architecture Changes

#### Component Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│ OpenShift Console                                               │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Kuadrant Console Plugin (Dynamic Plugin)                 │  │
│  │                                                           │  │
│  │ • UI Components (API Catalog, API Keys, Plans)           │  │
│  │ • RBAC Checks (useAccessReviews, checkAccess)            │  │
│  │ • API Calls (k8sCreate, k8sUpdate, k8sPatch, k8sGet)     │  │
│  │                                                           │  │
│  │ Runs as: Logged-in user (OAuth token)                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                         ↓ (as user)                             │
└─────────────────────────┼───────────────────────────────────────┘
                          ↓
         ┌────────────────────────────────────┐
         │ Kubernetes API Server              │
         │                                    │
         │ • RBAC Enforcement                 │
         │ • SelfSubjectAccessReview          │
         │ • Resource CRUD operations         │
         └────────────────┬───────────────────┘
                          ↓
         ┌────────────────────────────────────┐
         │ Developer Portal Controller        │
         │ (github.com/Kuadrant/              │
         │  developer-portal-controller)      │
         │                                    │
         │ • Watches APIKey resources         │
         │ • Creates Secrets with API keys    │
         │ • Updates APIKey status            │
         │ • Enforces approval workflow       │
         │                                    │
         │ Runs as: Service account           │
         └────────────────────────────────────┘
```

**Key architectural principles:**
1. **Console plugin has NO backend** - all operations via OpenShift Console's Kubernetes API proxy
2. **User identity is preserved** - all API calls made with logged-in user's OAuth token
3. **RBAC enforced by Kubernetes** - not just UI hints
4. **Progressive disclosure** - UI elements hidden/disabled based on permission checks

#### Authentication Flow

```
User logs in → OpenShift OAuth → Token issued
                                       ↓
Console plugin loads → checkAccess() → SelfSubjectAccessReview
                                       ↓
                              Show/Hide UI elements
                                       ↓
User clicks "Create APIKey" → k8sCreate() → POST /apis/devportal.kuadrant.io/v1alpha1/...
                                                    (Authorization: Bearer <user-token>)
                                       ↓
                              Kubernetes RBAC check
                                       ↓
                              Allow/Deny based on RoleBindings
```

### API Changes

**No API changes.** This design does not introduce new CRDs or modify existing API schemas. All resources (APIProduct, APIKey, PlanPolicy, AuthPolicy, RateLimitPolicy, HTTPRoute) already exist and are managed by their respective controllers:

- **APIProduct** and **APIKey**: Defined and managed by the [Developer Portal Controller](https://github.com/Kuadrant/developer-portal-controller)
- **PlanPolicy**, **AuthPolicy**, and **RateLimitPolicy**: Defined and managed by [Kuadrant Operator](https://github.com/Kuadrant/kuadrant-operator)
- **HTTPRoute**: Part of Kubernetes Gateway API

This design focuses exclusively on defining RBAC roles for console plugin users to interact with these existing resources.

### API Management Resources

This section describes the key resources managed by the RBAC roles and their implications for permission design.

#### APIKey Resource (devportal.kuadrant.io/v1alpha1)

The `APIKey` resource is the core of the consumer access request workflow. Consumers create APIKeys to request access to published APIs.

```yaml
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: mobile-app-payment-key
  namespace: payment-services  # Must match APIProduct namespace
spec:
  # Local reference to APIProduct (no namespace field)
  apiProductRef:
    name: payment-api-v1

  # Rate limiting plan tier
  planTier: "basic"  # e.g., "free", "basic", "premium", "enterprise"

  # Who requested this API key
  requestedBy:
    userId: "alice"
    email: "alice@mobile-team.example.com"

  # Use case justification
  useCase: "Mobile app integration for payment processing in our iOS/Android apps"

status:
  # Approval workflow (set by API Owner)
  phase: "Pending"  # "Pending" | "Approved" | "Rejected"
  reviewedBy: "bob@payment-team.com"
  reviewedAt: "2026-03-26T14:00:00Z"

  # Reference to generated secret (set by Developer Portal Controller)
  secretRef:
    name: "mobile-app-payment-key-secret"
    key: "api-key"

  # One-time secret viewing flag (UI feature)
  canReadSecret: true  # Set to false after first view

  # Rate limits from selected plan
  limits:
    daily: 10000
    monthly: 300000
    custom:
      - limit: 100
        window: 1m

  # Authentication scheme
  authScheme:
    credentials:
      authorizationHeader:
        prefix: "Bearer"
    authenticationSpec:
      selector:
        matchLabels:
          kuadrant.io/apikey: mobile-app-payment-key

  # API hostname from HTTPRoute
  apiHostname: "api.payment.example.com"

  # Status conditions
  conditions:
    - type: Ready
      status: "True"
      reason: SecretCreated
      message: "API key secret created successfully"
```

**RBAC implications:**
- **Namespace placement**: APIKey must be created in the same namespace as the referenced APIProduct
- **Consumer filtering**: `spec.requestedBy.userId` used by UI to filter list results (consumers see only their own APIKeys)
- **Approval workflow**:
  - API Owners update `status.phase` to "Approved" or "Rejected"
  - Requires `update apikeys/status` permission
  - Based on `APIProduct.spec.approvalMode` (automatic vs manual)
- **One-time secret viewing**:
  - `status.canReadSecret` flag prevents repeated viewing of API key secret
  - Consumer needs `update apikeys/status` permission to mark secret as viewed
  - UI enforcement only (not security boundary)
- **Secret access**:
  - Developer Portal Controller creates Secret in same namespace as APIKey
  - Consumer needs `get secrets` permission in API owner's namespace
  - `status.secretRef` points to the generated secret

#### APIProduct Resource (devportal.kuadrant.io/v1alpha1)

API Owners publish APIProducts to make their APIs discoverable in the developer portal catalog.

```yaml
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIProduct
metadata:
  name: payment-api-v1
  namespace: payment-services
spec:
  displayName: "Payment API v1"
  description: "Process payments and manage transactions"
  version: "v1"

  # Approval mode (determines if manual approval needed)
  approvalMode: manual  # "manual" | "automatic"

  # Visibility in catalog
  publishStatus: Published  # "Draft" | "Published"

  tags:
    - payments
    - fintech

  # Reference to HTTPRoute
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: payment-api-route

  documentation:
    url: "https://docs.example.com/payment-api"
```

**RBAC implications:**
- **Namespace ownership**: API Owners can only create/update/delete APIProducts in their assigned namespaces
- **Catalog visibility**: All personas have cluster-wide read access to enable API discovery
- **Approval workflow**:
  - `approvalMode: automatic` → APIKeys approved immediately by Developer Portal Controller (no owner intervention)
  - `approvalMode: manual` → Owner must review and update `APIKey.status.phase` to approve/reject
- **Draft products**: `publishStatus: Draft` can be used to hide products from catalog while in development (UI can filter by this field)
- **HTTPRoute reference**: `spec.targetRef` must reference an HTTPRoute in the same namespace (namespace-local reference)
- **Owner permissions**: Requires `create apiproducts` permission in namespace, plus `get httproutes` to select valid routes

#### Policy and Route Resources

In addition to APIProduct and APIKey, API consumers need read-only access to policies and routes to understand API requirements, endpoints, and rate limits.

**Policies** (all read-only for consumers and owners)

1. **PlanPolicy** (`extensions.kuadrant.io/v1alpha1`)
   - Platform-managed rate limiting plan templates
   - Defines tiers (e.g., free, basic, premium, enterprise)
   - Typically in system namespace (e.g., `kuadrant-system`)

2. **AuthPolicy** (`kuadrant.io/v1`)
   - Authentication and authorization requirements
   - Shows what credentials are needed (API key, OAuth, JWT, etc.)
   - Applied to HTTPRoutes or Gateways

3. **RateLimitPolicy** (`kuadrant.io/v1`)
   - Route-specific rate limiting configurations
   - May differ from PlanPolicy defaults
   - Shows actual limits applied to specific APIs

**Routes**

4. **HTTPRoute** (`gateway.networking.k8s.io/v1`)
   - API endpoints, paths, and HTTP methods
   - Hostname and path prefixes
   - Backend service references
   - Referenced by APIProduct via `spec.targetRef`

**RBAC implications:**
- All policies and routes: consumers and owners have cluster-wide read-only access
- Owners may have write access to these resources in their own namespaces (separate policy management roles)
- Admins have full access to all policies and routes

### RBAC Enforcement

#### Console Plugin Permission Checks

The OpenShift Console plugin enforces RBAC using `SelfSubjectAccessReview` API calls. All operations are performed as the logged-in user via OAuth token - there is no backend service account.

**Enforcement mechanism:**
1. **Progressive disclosure**: UI checks permissions before rendering action buttons/menu items
2. **Backend enforcement**: Kubernetes API server enforces RBAC on all resource operations
3. **User identity preservation**: All API calls use the logged-in user's credentials

**Key principle**: RBAC is enforced by Kubernetes, not just UI hints. Even if UI is bypassed (e.g., via kubectl), Kubernetes API server will deny unauthorized operations.

#### Developer Portal Controller

The Developer Portal Controller (separate repository) handles:
1. Watching `APIKey` resources
2. Creating `Secret` resources with generated API key values
3. Updating `APIKey` status with secret reference
4. Enforcing approval workflow based on `APIProduct.spec.approvalMode`

**Controller RBAC** (not part of this design, but documented for completeness):
```yaml
# Controller service account needs:
- apiGroups: ["devportal.kuadrant.io"]
  resources: ["apikeys"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["devportal.kuadrant.io"]
  resources: ["apikeys/status"]
  verbs: ["update", "patch"]
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["create", "update", "delete"]
- apiGroups: ["extensions.kuadrant.io"]
  resources: ["apiproducts"]
  verbs: ["get", "list"]
```

### Security Considerations

#### 1. Namespace Isolation

**Multi-tenancy within same namespace:**
- Consumer A and Consumer B can both create APIKeys in `payment-services` namespace
- Both can `list apikeys` in that namespace
- **Risk**: Consumers can see each other's APIKeys (metadata)
- **Mitigation**: UI filters by `spec.requestedBy.userId` (client-side)
- **Limitation**: Kubernetes RBAC cannot filter list results by field selectors for CRDs

**Recommendation**: If strict isolation is required, use dedicated consumer namespaces.

#### 2. Secret Exposure

**One-time viewing:**
- `status.canReadSecret` flag prevents repeated secret viewing
- After first view, consumer must create new APIKey to get new secret
- **Risk**: Consumer can `get` secret directly via kubectl (bypasses UI flag)
- **Mitigation**: Document that `canReadSecret` is a UI convenience, not security enforcement

**Secret rotation:**
- No automatic secret rotation mechanism
- Consumer must delete old APIKey and create new one
- Owner can reject old APIKey to force rotation

#### 3. Approval Bypass

**Automatic approval mode:**
- `APIProduct.spec.approvalMode: automatic` grants immediate access
- **Risk**: Owner accidentally sets automatic mode for sensitive API
- **Mitigation**: Document approval modes clearly, consider validation webhook

**Status manipulation:**
- Consumers need `update apikeys/status` for `canReadSecret` workflow
- **Risk**: Malicious consumer could try to set `status.phase: Approved`
- **Mitigation**: Developer Portal Controller should reconcile status.phase based on approval mode
- **Future enhancement**: Validation webhook to prevent unauthorized status.phase changes

#### 4. Cross-namespace Access

**Consumer permissions in owner namespace:**
- Consumers need permissions in API owner's namespace to create APIKeys
- Consumers need `get secrets` in API owner's namespace to retrieve API key value
- **Risk**: Broad consumer permissions across many namespaces
- **Mitigation**: Use namespace-scoped RoleBindings (admin grants access selectively)

#### 5. RBAC Privilege Escalation

**Owner cannot become admin:**
- Owners have namespace-scoped permissions only
- Cannot create PlanPolicies (platform resource)
- Cannot modify products in other namespaces

**Consumer cannot become owner:**
- Consumers have limited write operations (create/update/delete APIKeys only)
- Cannot create or modify APIProducts
- Cannot approve other consumers' APIKeys (requires changing status.phase to "Approved", but Developer Portal Controller should enforce approval based on APIProduct owner)

**Future enhancement**: Validation webhook to enforce:
- Only APIProduct owner can approve APIKeys
- Consumers cannot approve their own requests
- Status.phase changes validated against approvalMode

## Implementation Plan

This design has been implemented with the following deliverables:

### ✅ Completed: RBAC Role Definitions

**Deliverables:**
- ✅ `config/rbac/api-consumer-role.yaml` - Consumer role and catalog reader ClusterRole
- ✅ `config/rbac/api-owner-role.yaml` - Owner role and catalog reader ClusterRole
- ✅ `config/rbac/api-admin-clusterrole.yaml` - Admin ClusterRole
- ✅ `config/rbac/README.md` - Deployment guide with common patterns
- ✅ `e2e/manifests/api-management-rbac.yaml` - Test personas for validation
- ✅ `docs/designs/2026-03-26-api-management-rbac-design.md` - This design document
- ✅ `docs/api-management-rbac-validation.md` - Manual validation procedures

### Future Work (Out of Scope for RBAC Design)

**Console Plugin Implementation** (separate work):
- UI components respecting RBAC permissions
- Progressive disclosure via `SelfSubjectAccessReview`
- Client-side filtering for APIKey lists

**Kuadrant Operator Integration** (future enhancement):
- Include RBAC ClusterRoles in operator deployment
- Auto-create roles during Kuadrant installation
- Namespace templates for team onboarding

## Testing Strategy

RBAC testing focuses on verifying that Kubernetes enforces the defined permissions correctly.

### kubectl Impersonation Tests

Use `kubectl --as=<user>` to test permissions without creating real users:

```bash
# Test consumer permissions
kubectl auth can-i list apiproducts --as=test-consumer --all-namespaces
kubectl auth can-i create apikeys --as=test-consumer -n payment-services
kubectl auth can-i create apiproducts --as=test-consumer -n payment-services  # Should fail

# Test owner permissions
kubectl auth can-i create apiproducts --as=test-owner -n payment-services
kubectl auth can-i create apiproducts --as=test-owner -n other-namespace  # Should fail
kubectl auth can-i update apikeys/status --as=test-owner -n payment-services

# Test admin permissions
kubectl auth can-i create planpolicies --as=test-admin -n kuadrant-system
kubectl auth can-i delete apiproducts --as=test-admin -n any-namespace
```

### Manual Validation

Comprehensive validation procedures are documented in `docs/api-management-rbac-validation.md`:

1. **Consumer scenario**: Browse catalog, create APIKey, verify denials
2. **Owner scenario**: Create APIProduct in own namespace, approve APIKey, verify cross-namespace denials
3. **Admin scenario**: Manage resources across all namespaces, create PlanPolicies
4. **Negative tests**: Verify permission denials work as expected

### Test Personas

Test users and RoleBindings are available in `e2e/manifests/api-management-rbac.yaml`:
- `test-api-consumer` - Consumer with access to `api-consumers` namespace
- `test-api-owner-team-a` - Owner with access to `api-team-a` namespace
- `test-api-owner-team-b` - Owner with access to `api-team-b` namespace
- `test-api-admin` - Admin with cluster-wide access

## Open Questions

### 1. Approval Workflow Enforcement

**Question**: Should we add a validation webhook to prevent consumers from approving their own APIKeys?

**Current state**:
- Consumers have `update apikeys/status` permission (needed for `canReadSecret`)
- Nothing prevents consumer from setting `status.phase: Approved` via kubectl
- Developer Portal Controller should reconcile status, but race conditions possible

**Options**:
- **A**: Trust controller reconciliation (simplest, current approach)
- **B**: Add validation webhook to reject unauthorized `status.phase` changes
- **C**: Create separate API endpoint for approvals (more complex)

**Recommendation**: Start with A, add webhook (B) if abuse becomes an issue.

### 2. Secret Synchronization

**Question**: Should the Developer Portal Controller automatically copy secrets to consumer workload namespaces?

**Current state**:
- Secrets created in same namespace as APIKey/APIProduct
- Consumer must manually copy secret to their workload namespace (kubectl or UI)
- Consumer needs `get secrets` permission in API owner namespace

**Options**:
- **A**: Manual copy (current approach, simple but inconvenient)
- **B**: Controller copies to namespace specified in `APIKey.spec.targetNamespace`
- **C**: Use external-secrets operator or similar (out of scope)
- **D**: Recommend consumers run workloads in API owner namespace (defeats isolation)

**Recommendation**: Document A as initial approach, consider B as future enhancement.

### 3. Namespace Scoping for Consumers

**Question**: Should consumer permissions be cluster-wide or namespace-scoped by default?

**Current state**:
- Design documents both patterns
- Cluster-wide is simpler (one binding per consumer group)
- Namespace-scoped is more secure (admin controls access per API)

**Trade-offs**:

| Pattern | Pros | Cons |
|---------|------|------|
| Cluster-wide | Simple deployment, consumers can access any API | Less secure, consumers see all namespaces |
| Namespace-scoped | Admin controls access, better isolation | Complex deployment, many RoleBindings |

**Recommendation**: Default to cluster-wide in documentation, provide namespace-scoped as security hardening option.

### 4. Kuadrant Operator Integration

**Question**: Should Kuadrant Operator automatically create API Management RBAC roles during installation?

**Options**:
- **A**: Operator creates ClusterRoles but not bindings (admin must bind to users/groups)
- **B**: Operator creates example bindings (disabled by default, admin enables)
- **C**: Operator doesn't create anything (admin applies manifests manually)

**Recommendation**: A - Operator creates ClusterRoles, admin creates bindings based on deployment guide.

## Validation and Next Steps

### RBAC Validation

**Manual testing** (documented in `docs/api-management-rbac-validation.md`):
- Use kubectl impersonation (`--as=<user>`) to test each persona
- Verify positive permissions (consumer can list APIProducts, owner can create in own namespace)
- Verify negative permissions (consumer cannot create APIProducts, owner cannot access other namespaces)
- Test cross-namespace scenarios (consumer creates APIKey in owner's namespace)

**Automated testing**:
- E2E test suite validating RBAC for consumer, owner, and admin personas
- Negative test scenarios to verify permission denials
- Test personas available in `e2e/manifests/api-management-rbac.yaml`

### Next Steps

1. **Console Plugin Integration** (separate from this design):
   - Implement UI components respecting RBAC via `SelfSubjectAccessReview`
   - Progressive disclosure based on user permissions
   - Client-side filtering for APIKey lists by `requestedBy.userId`

2. **Kuadrant Operator Integration** (future enhancement):
   - Include API Management ClusterRoles in operator deployment manifests
   - Auto-create roles when Kuadrant is installed
   - Document RoleBinding creation for users/groups

3. **Documentation**:
   - Admin guide for deploying and configuring API Management RBAC
   - User workflows for each persona (consumer, owner, admin)
   - Troubleshooting guide for common RBAC issues

### Completed

- ✅ RBAC role definitions for API Consumer, API Owner, API Admin
- ✅ Deployment patterns documentation (`config/rbac/README.md`)
- ✅ E2E test personas (`e2e/manifests/api-management-rbac.yaml`)
- ✅ Validation guide (`docs/api-management-rbac-validation.md`)
- ✅ Design document (this file)

## References

- [Kuadrant Developer Portal Controller](https://github.com/Kuadrant/developer-portal-controller) - APIKey CRD source of truth
- [Kuadrant Backstage Plugin RBAC](https://github.com/Kuadrant/kuadrant-backstage-plugin/blob/main/docs/rbac-permissions.md) - Original permissions design
- [Kubernetes RBAC Documentation](https://kubernetes.io/docs/reference/access-authn-authz/rbac/) - K8s RBAC reference
- [OpenShift Authorization](https://docs.openshift.com/container-platform/latest/authentication/using-rbac.html) - OpenShift RBAC guide
- [OpenShift Console Dynamic Plugin SDK](https://github.com/openshift/dynamic-plugin-sdk) - Console SDK documentation
- [APIKey CRD Schema](https://github.com/Kuadrant/developer-portal-controller/blob/main/config/crd/bases/devportal.kuadrant.io_apikeys.yaml) - Complete APIKey resource definition
