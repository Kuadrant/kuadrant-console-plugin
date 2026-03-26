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

Existing policy RBAC (AuthPolicy, RateLimitPolicy, DNSPolicy, TLSPolicy) remains unchanged. The new roles are additive and only affect access to API Management resources:
- `APIProduct` (`extensions.kuadrant.io/v1alpha1`)
- `APIKey` (`devportal.kuadrant.io/v1alpha1`)
- `PlanPolicy` (`extensions.kuadrant.io/v1alpha1`)

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

#### APIKey Resource (devportal.kuadrant.io/v1alpha1)

The `APIKey` resource is the core of the consumer access request workflow:

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

**Key fields for RBAC design:**
- `spec.requestedBy.userId`: Used by UI to filter APIKeys (consumer sees only their own)
- `status.phase`: Approval state, updated by API Owner
- `status.canReadSecret`: One-time viewing flag, updated by consumer after viewing secret

#### APIProduct Resource (extensions.kuadrant.io/v1alpha1)

```yaml
apiVersion: extensions.kuadrant.io/v1alpha1
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
- `approvalMode: automatic` → APIKey approved immediately (no owner intervention)
- `approvalMode: manual` → Owner must set `status.phase: Approved`
- `publishStatus: Draft` → Can be used to hide products from catalog

#### PlanPolicy Resource (extensions.kuadrant.io/v1alpha1)

```yaml
apiVersion: extensions.kuadrant.io/v1alpha1
kind: PlanPolicy
metadata:
  name: standard-rate-limits
  namespace: kuadrant-system  # Platform-managed
spec:
  name: standard
  displayName: "Standard Plan"
  limits:
    - period: 1m
      requests: 100
    - period: 1h
      requests: 5000
```

**RBAC implications:**
- Platform-managed resource (typically cluster-scoped or system namespace)
- Consumers and owners: read-only access
- Admins: full CRUD access

### Component Changes

#### Console Plugin UI Permission Checks

The console plugin uses `SelfSubjectAccessReview` to conditionally render UI elements:

```typescript
// Example: API Products page
import { checkAccess } from '@openshift-console/dynamic-plugin-sdk';

const canCreateProduct = await checkAccess({
  group: 'extensions.kuadrant.io',
  resource: 'apiproducts',
  verb: 'create',
  namespace: activeNamespace,
});

// Conditionally render "Create Product" button
{canCreateProduct && <Button onClick={handleCreate}>Create Product</Button>}
```

**Permission checks by page:**

| Page/Component | UI Element | Permission Check |
|----------------|------------|------------------|
| API Catalog | Product list | `list apiproducts` (cluster-wide) |
| API Catalog | "Request Access" button | `create apikeys` in product namespace |
| My API Products | "Create Product" button | `create apiproducts` in active namespace |
| My API Products | "Edit" action | `update apiproducts` on specific resource |
| My API Products | "Delete" action | `delete apiproducts` on specific resource |
| API Key Requests | Request list | `list apikeys` in namespace |
| API Key Requests | "View Secret" button | `get secrets` + `apikey.status.canReadSecret: true` |
| API Key Requests | "Approve/Reject" actions | `update apikeys/status` on specific resource |
| API Key Requests | "Delete" action | `delete apikeys` on specific resource |
| Plans | Plan list | `list planpolicies` (cluster-wide) |
| Plans | "Create Plan" button | `create planpolicies` in namespace |

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

### Phase 1: RBAC Role Definitions ✅ (Complete)

1. Create API Consumer role (`config/rbac/api-consumer-role.yaml`)
2. Create API Owner role (`config/rbac/api-owner-role.yaml`)
3. Create API Admin cluster role (`config/rbac/api-admin-clusterrole.yaml`)
4. Document deployment patterns (`config/rbac/README.md`)
5. Create E2E test personas (`e2e/manifests/api-management-rbac.yaml`)

**Deliverables:**
- ✅ `config/rbac/api-consumer-role.yaml`
- ✅ `config/rbac/api-owner-role.yaml`
- ✅ `config/rbac/api-admin-clusterrole.yaml`
- ✅ `config/rbac/README.md`
- ✅ `e2e/manifests/api-management-rbac.yaml`
- ✅ `docs/designs/2026-03-26-api-management-rbac-design.md` (this file)
- ✅ `docs/api-management-rbac-validation.md`

### Phase 2: Console Plugin UI Implementation (TODO)

1. Add API Management pages (API Catalog, My APIs, API Keys, Plans)
2. Implement permission checks using `checkAccess()` and `useAccessReviews()`
3. Filter APIKey lists by `spec.requestedBy.userId` for consumers
4. Implement one-time secret viewing with `canReadSecret` workflow
5. Add approval/rejection actions for API owners
6. Update `console-extensions.json` for new routes

**Deliverables:**
- `src/components/apimanagement/APICatalogPage.tsx`
- `src/components/apimanagement/MyAPIProductsPage.tsx`
- `src/components/apimanagement/APIKeysPage.tsx`
- `src/components/apimanagement/PlansPage.tsx`
- Permission check utilities in `src/utils/apiManagementRBAC.tsx`

### Phase 3: E2E Testing (TODO)

1. Create E2E test suite (`e2e/tests/api-management-rbac.spec.ts`)
2. Test consumer scenario: browse catalog, request access, view secret
3. Test owner scenario: create product, approve request, manage namespace resources
4. Test admin scenario: view all resources, cross-namespace operations
5. Test negative scenarios: verify permission denials

**Deliverables:**
- `e2e/tests/api-management-rbac.spec.ts`
- CI integration for RBAC tests

### Phase 4: Documentation (TODO)

1. Update main README with API Management RBAC section
2. Create admin deployment guide
3. Document user workflows for each persona
4. Add examples to kuadrant-dev-setup repository

**Deliverables:**
- `README.md` updates
- `docs/admin-guide-api-management-rbac.md`
- User workflow documentation

### Phase 5: Kuadrant Operator Integration (Future Enhancement)

1. Add API Management RBAC roles to Kuadrant Operator deployment
2. Auto-create roles when Kuadrant is installed
3. Document how to bind roles to users/groups
4. Consider namespace templates for auto-provisioning

**Deliverables:**
- Kuadrant Operator changes (separate repository)
- Deployment manifests

## Testing Strategy

### Unit Tests

Not applicable for RBAC definitions (YAML manifests). Testing focuses on integration and E2E.

### Integration Tests

**kubectl impersonation tests:**
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

**Test script:** `docs/api-management-rbac-validation.md` contains manual validation procedures.

### E2E Tests

**Playwright/Cypress tests (future):**
1. Consumer logs in → sees API catalog → requests access → views secret once
2. Owner logs in → creates API product → approves request → sees approval in status
3. Admin logs in → manages all resources across namespaces
4. Permission denial tests → verify forbidden errors

**Test data:**
- Use `e2e/manifests/api-management-rbac.yaml` for test personas
- Create sample APIProducts, APIKeys, PlanPolicies
- Verify RBAC via actual API calls (not just permission checks)

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

## Execution

### Todo

Ordered by dependency — workable top to bottom.

- [ ] Create UI components for API Management
    - [ ] APICatalogPage component (browse published APIProducts)
    - [ ] MyAPIProductsPage component (manage owned APIProducts)
    - [ ] APIKeysPage component (view/create/approve APIKeys)
    - [ ] PlansPage component (browse PlanPolicies)
    - [ ] Unit tests for components
    - [ ] Integration tests with permission checks
- [ ] Implement permission checks in UI
    - [ ] Add `useAccessReviews` hook for API Management resources
    - [ ] Filter APIKey lists by `requestedBy.userId`
    - [ ] Show/hide UI elements based on permissions
    - [ ] Unit tests for permission logic
    - [ ] Integration tests
- [ ] Implement one-time secret viewing workflow
    - [ ] Check `canReadSecret` flag before displaying secret
    - [ ] Update `canReadSecret: false` after first view
    - [ ] Display warning message about one-time viewing
    - [ ] Unit tests
    - [ ] Integration tests
- [ ] Add approval/rejection actions for API owners
    - [ ] Implement status.phase update UI
    - [ ] Add reviewedBy and reviewedAt fields
    - [ ] Handle approval mode (automatic vs manual)
    - [ ] Unit tests
    - [ ] Integration tests
- [ ] Create E2E test suite
    - [ ] Consumer scenario test
    - [ ] Owner scenario test
    - [ ] Admin scenario test
    - [ ] Negative permission tests
    - [ ] Integration tests
- [ ] Update documentation
    - [ ] README.md with API Management RBAC overview
    - [ ] Admin deployment guide
    - [ ] User workflow documentation
    - [ ] Integration tests
- [ ] Kuadrant Operator integration (future)
    - [ ] Add API Management ClusterRoles to operator deployment
    - [ ] Document binding creation process
    - [ ] Add namespace template examples
    - [ ] Integration tests

### Completed

- ✅ 2026-03-26: Created RBAC role definitions for API Consumer, API Owner, API Admin
- ✅ 2026-03-26: Documented deployment patterns in config/rbac/README.md
- ✅ 2026-03-26: Created E2E test personas in e2e/manifests/api-management-rbac.yaml
- ✅ 2026-03-26: Wrote validation guide in docs/api-management-rbac-validation.md
- ✅ 2026-03-26: Created design document (this file)

## Change Log

### 2026-03-26 — Initial Design

**Key decisions:**
1. **Namespace-based isolation** instead of ownership annotations
   - Leverages Kubernetes native RBAC
   - Stronger boundaries than Backstage's annotation-based approach

2. **Three personas model**
   - API Consumer: Browse and consume APIs
   - API Owner: Publish and manage APIs in assigned namespaces
   - API Admin: Platform team with cluster-wide access

3. **Cluster-wide read for discovery**
   - All personas can list/get APIProducts globally
   - Write operations are namespace-scoped

4. **APIKey approval workflow**
   - Owner updates `status.phase` directly (no intermediate spec field)
   - Based on `APIProduct.spec.approvalMode` (automatic vs manual)

5. **One-time secret viewing**
   - `status.canReadSecret` flag enforced by UI
   - Consumer needs `update apikeys/status` permission
   - Not a security enforcement mechanism (UI convenience)

6. **No service account impersonation**
   - Console plugin makes all API calls as logged-in user
   - RBAC rules apply to end users, not backend service account

7. **Secret access pattern**
   - Secrets created in same namespace as APIKey
   - Consumer reads secret from API owner namespace
   - Consumer needs `get secrets` permission in owner namespace
   - Manual copy to workload namespace (future: automatic sync)

8. **APIKey resource group**
   - Uses `devportal.kuadrant.io/v1alpha1` (not `extensions.kuadrant.io`)
   - Aligns with Developer Portal Controller repository

**Differences from Backstage plugin:**
- No `backstage.io/owner` annotations → namespace-based ownership
- No `.own` vs `.all` permission scopes → namespace vs cluster scopes
- Immutable ownership not needed → namespace access is the boundary

**Future enhancements:**
- Validation webhook for `status.phase` approval enforcement
- Automatic secret synchronization to consumer workload namespaces
- Kuadrant Operator integration for automatic role provisioning
- Namespace templates for team onboarding
- Audit logging for approval/rejection actions

## References

- [Kuadrant Developer Portal Controller](https://github.com/Kuadrant/developer-portal-controller) - APIKey CRD source of truth
- [Kuadrant Backstage Plugin RBAC](https://github.com/Kuadrant/kuadrant-backstage-plugin/blob/main/docs/rbac-permissions.md) - Original permissions design
- [Kubernetes RBAC Documentation](https://kubernetes.io/docs/reference/access-authn-authz/rbac/) - K8s RBAC reference
- [OpenShift Authorization](https://docs.openshift.com/container-platform/latest/authentication/using-rbac.html) - OpenShift RBAC guide
- [OpenShift Console Dynamic Plugin SDK](https://github.com/openshift/dynamic-plugin-sdk) - Console SDK documentation
- [APIKey CRD Schema](https://github.com/Kuadrant/developer-portal-controller/blob/main/config/crd/bases/devportal.kuadrant.io_apikeys.yaml) - Complete APIKey resource definition
