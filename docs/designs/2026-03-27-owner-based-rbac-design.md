# Feature: Owner-Based RBAC for APIProduct and APIKey Resources

## Summary

Implement ownership-based access control for APIProduct and APIKey resources in the OpenShift Console Plugin, ensuring users can only modify resources they own while maintaining a browsable API catalog. This design adds invisible ownership tracking with enforcement at three layers: admission control (webhook), API filtering (backend), and UI experience (console plugin).

## Goals

- Enable ownership-based access control where users can only modify APIProducts and APIKeys they own
- Maintain browsable API catalog (all users can view all APIProducts)
- Implement server-side filtering for sensitive APIKey data
- Ensure compatibility with existing RHDH/Backstage deployment
- Protect against kubectl/oc command-line bypasses
- Keep ownership completely invisible to end users (no UI fields)
- Support two-tier permission model: regular owners and global admins

## Non-Goals

- Namespace-scoped admins (subset admins for specific namespaces)
- Client-side filtering for APIKeys (must be server-side for security)
- Changing how Secrets are managed (existing behavior)
- RBAC for other Kuadrant resources (Gateway, HTTPRoute, Policies)
- Integration with external identity providers beyond OpenShift OAuth
- Granular per-APIProduct access control policies

## Design

### Backwards Compatibility

**Changes are additive and backward compatible:**
- Adding `status.owner` field to CRDs (optional, read-only)
- Adding `kuadrant.io/created-by` annotation (set automatically)
- Existing APIProducts without ownership will be backfilled during reconciliation
- RHDH deployment continues working unchanged (service account has admin privileges)
- No breaking changes to API or reconciliation logic

### Architecture Overview

**Three-component solution with layered security:**

```
┌─────────────────────────────────────────────────────────────┐
│  OpenShift Console Plugin (Frontend)                        │
│  - Calls backend API for filtered data                      │
│  - Shows edit/delete buttons based on ownership             │
│  - Never displays ownership field to users                  │
└──────────────────┬──────────────────────────────────────────┘
                   │ HTTP API (Bearer Token)
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  developer-portal-controller (Backend)                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ HTTP API Server (NEW)                                  │ │
│  │ - Port 8080                                            │ │
│  │ - GET /apiproducts (all, with status.owner)           │ │
│  │ - GET /apikeys/my-keys (filtered by requester)        │ │
│  │ - GET /apikeys/approval-queue (filtered by ownership) │ │
│  │ - POST /apikeys/:namespace/:name/approve              │ │
│  │ - POST /apikeys/:namespace/:name/reject               │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ValidatingWebhook (NEW)                                │ │
│  │ - Port 9443 (HTTPS, requires TLS cert)                │ │
│  │ - Single webhook handles APIProduct + APIKey          │ │
│  │ - Sets ownership annotation on CREATE                 │ │
│  │ - Blocks ownership changes (except admins)            │ │
│  │ - Validates APIKey approvals (fetches APIProduct)     │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Reconciler (MODIFY EXISTING)                           │ │
│  │ - Reads kuadrant.io/created-by annotation             │ │
│  │ - Mirrors to status.owner field (read-only)           │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────┬──────────────────────────────────────────┘
                   │ K8s API
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  Kubernetes API Server                                      │
│  - Stores APIProduct and APIKey CRDs                        │
│  - Calls webhook for admission control                      │
└─────────────────────────────────────────────────────────────┘
```

**Data Flow:**

**Create APIProduct:**
1. User submits via console plugin → backend API
2. Backend creates K8s resource → K8s calls webhook
3. Webhook sets `metadata.annotations["kuadrant.io/created-by"] = alice`
4. Resource created → controller reconciles → sets `status.owner = alice`

**List APIProducts:**
1. Console plugin → `GET /apiproducts`
2. Backend fetches from K8s, returns all (catalog browsing)
3. Console filters edit buttons client-side based on `status.owner`

**List My APIKeys:**
1. Console plugin → `GET /apikeys/my-keys`
2. Backend filters: `spec.requester == currentUser`
3. Returns only user's APIKeys (server-side filtered)

**Approval Queue:**
1. Console plugin → `GET /apikeys/approval-queue`
2. Backend filters: APIKeys for APIProducts where `status.owner == currentUser`
3. Returns only approvable APIKeys (server-side filtered)

### CRD Changes

**APIProduct status field addition:**

```yaml
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIProduct
metadata:
  name: petstore-api
  namespace: petstore
  annotations:
    kuadrant.io/created-by: alice  # ← Set by webhook, protected
spec:
  displayName: Petstore API
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: petstore-route
  # NO owner field in spec - users never see/edit ownership
status:
  owner: alice  # ← NEW: Copied by controller, read-only to users
  conditions:
    - type: Ready
      status: "True"
  plans: [...]
  authSchemes: [...]
  openAPISpecRef: {...}
```

**APIKey status field addition:**

```yaml
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: alice-petstore-gold
  namespace: petstore
  annotations:
    kuadrant.io/created-by: alice  # ← Set by webhook
spec:
  apiProductRef:
    name: petstore-api
  plan: gold
  requester: alice  # ← Set by webhook automatically
  useCase: "Mobile app integration"
  approvalMode: manual
status:
  owner: alice  # ← NEW: Mirrors created-by annotation
  phase: Pending
  secretRef: {...}
```

**Why this storage model:**
- `kuadrant.io/created-by` annotation: Set once by webhook, protected from changes
- `status.owner`: Read-only mirror of annotation, queryable by console plugin
- Users cannot edit either field (webhook blocks annotation, K8s blocks status)
- Completely invisible in UI

### Ownership Model

**Ownership Rules:**

| Action | User Type | Rule |
|--------|-----------|------|
| **Create APIProduct** | Any user with RBAC | Webhook auto-sets `kuadrant.io/created-by` to username |
| **Update APIProduct** | Owner or Admin | `status.owner == user` OR user in `kuadrant-api-admins` |
| **Delete APIProduct** | Owner or Admin | Same as update |
| **Transfer ownership** | Admin only | Admin edits `kuadrant.io/created-by`, controller updates `status.owner` |
| **Create APIKey** | Any consumer | Webhook auto-sets `spec.requester` to username |
| **Approve APIKey** | Owner or Admin | User owns referenced APIProduct OR user in `kuadrant-api-admins` |

**Admin Group:**
- `kuadrant-api-admins` (single global admin group)
- Can bypass all ownership restrictions
- Can transfer ownership between users/teams
- Can approve any APIKey request

**Design decision:** Two-tier model only (owners + global admins). Namespace-scoped admins considered but rejected due to unpredictable namespace organization patterns.

### Component Changes

#### 1. developer-portal-controller

**A) HTTP API Server (NEW)**

**Port:** 8080
**Authentication:** OpenShift OAuth bearer token (validated via TokenReview API)

**Endpoints:**

```
GET /api/v1/apiproducts?namespace=<ns>
- Returns all APIProducts with status.owner field
- Used for catalog browsing
- Authorization: Any user with list apiproducts RBAC

GET /api/v1/apikeys/my-keys?namespace=<ns>
- Returns APIKeys where spec.requester == currentUser
- Server-side filtered for security
- Authorization: Valid bearer token

GET /api/v1/apikeys/approval-queue?namespace=<ns>
- Returns pending APIKeys for APIProducts where status.owner == currentUser
- Server-side filtered
- Authorization: Valid bearer token + ownership validation

POST /api/v1/apikeys/:namespace/:name/approve
- Approves APIKey, updates phase to Approved
- Validates: user owns referenced APIProduct OR is admin
- Authorization: Ownership check before approval

POST /api/v1/apikeys/:namespace/:name/reject
- Rejects APIKey, updates phase to Rejected
- Same validation as approve
```

**Authentication flow:**
```go
func extractUserFromToken(token string) (*UserInfo, error) {
    // Call K8s TokenReview API
    tokenReview := &authv1.TokenReview{
        Spec: authv1.TokenReviewSpec{Token: token},
    }

    result := k8sClient.Create(tokenReview)

    return &UserInfo{
        Username: result.Status.User.Username,  // "alice"
        Groups:   result.Status.User.Groups,    // ["team-alpha", "kuadrant-api-admins"]
    }, nil
}
```

**B) ValidatingWebhook (NEW)**

**Port:** 9443 (HTTPS)
**Certificate:** TLS cert via cert-manager or manual generation
**Pattern:** Single webhook handles both APIProduct and APIKey resources

**APIProduct validation:**

```go
func (w *Webhook) ValidateAPIProduct(req admission.Request) admission.Response {
    switch req.Operation {
    case admissionv1.Create:
        // Auto-set ownership annotation
        apiProduct.Metadata.Annotations["kuadrant.io/created-by"] = req.UserInfo.Username
        return admission.Allowed("")

    case admissionv1.Update:
        // Check if admin
        if isGlobalAdmin(req.UserInfo.Groups) {
            return admission.Allowed("")
        }

        // Check if ownership annotation changed
        oldAnnotation := oldAPIProduct.Metadata.Annotations["kuadrant.io/created-by"]
        newAnnotation := newAPIProduct.Metadata.Annotations["kuadrant.io/created-by"]

        if oldAnnotation != newAnnotation {
            return admission.Denied("Only admins can transfer ownership")
        }

        // Check if user owns this resource
        if oldAPIProduct.Status.Owner != req.UserInfo.Username {
            return admission.Denied("You can only update APIProducts you own")
        }

        return admission.Allowed("")

    case admissionv1.Delete:
        // Same ownership check as update
        if isGlobalAdmin(req.UserInfo.Groups) ||
           apiProduct.Status.Owner == req.UserInfo.Username {
            return admission.Allowed("")
        }
        return admission.Denied("You can only delete APIProducts you own")
    }
}
```

**APIKey validation:**

```go
func (w *Webhook) ValidateAPIKey(req admission.Request) admission.Response {
    switch req.Operation {
    case admissionv1.Create:
        // Auto-set requester to current user
        apiKey.Spec.Requester = req.UserInfo.Username
        return admission.Allowed("")

    case admissionv1.Update:
        // Check if admin
        if isGlobalAdmin(req.UserInfo.Groups) {
            return admission.Allowed("")
        }

        // Fetch referenced APIProduct to check ownership
        apiProduct := w.fetchAPIProduct(apiKey.Spec.APIProductRef)
        if apiProduct == nil {
            return admission.Denied("Referenced APIProduct not found")
        }

        // Check if user owns the APIProduct
        if apiProduct.Status.Owner != req.UserInfo.Username {
            return admission.Denied("You can only approve APIKeys for APIProducts you own")
        }

        return admission.Allowed("")
    }
}

func isGlobalAdmin(groups []string) bool {
    for _, group := range groups {
        if group == "kuadrant-api-admins" {
            return true
        }
    }
    return false
}
```

**Webhook configuration:**

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingWebhookConfiguration
metadata:
  name: kuadrant-ownership-webhook
webhooks:
- name: ownership.kuadrant.io
  clientConfig:
    service:
      name: developer-portal-controller
      namespace: kuadrant-system
      path: /validate
    caBundle: <injected-by-cert-manager>
  rules:
  - operations: ["CREATE", "UPDATE", "DELETE"]
    apiGroups: ["devportal.kuadrant.io"]
    apiVersions: ["v1alpha1"]
    resources: ["apiproducts", "apikeys"]
  failurePolicy: Fail
  sideEffects: None
```

**C) Reconciler Updates (MODIFY EXISTING)**

```go
func (r *APIProductReconciler) Reconcile(ctx context.Context, req ctrl.Request) {
    apiProduct := &APIProduct{}
    r.Get(ctx, req.NamespacedName, apiProduct)

    // NEW: Set status.owner from annotation
    createdBy := apiProduct.Metadata.Annotations["kuadrant.io/created-by"]
    if createdBy != "" && apiProduct.Status.Owner != createdBy {
        apiProduct.Status.Owner = createdBy
        r.Status().Update(ctx, apiProduct)
    }

    // Existing reconciliation logic continues...
}
```

#### 2. Console Plugin

**A) API Client (NEW)**

```typescript
// src/utils/devPortalApi.ts

import { consoleFetch } from '@openshift-console/dynamic-plugin-sdk';

const API_BASE = 'http://developer-portal-controller.kuadrant-system.svc:8080/api/v1';

export const devPortalApi = {
  listAPIProducts: async (namespace?: string) => {
    const url = namespace
      ? `${API_BASE}/apiproducts?namespace=${namespace}`
      : `${API_BASE}/apiproducts`;
    return consoleFetch(url);  // Token automatically included
  },

  getMyAPIKeys: async (namespace?: string) => {
    const url = `${API_BASE}/apikeys/my-keys${namespace ? `?namespace=${namespace}` : ''}`;
    return consoleFetch(url);
  },

  getApprovalQueue: async (namespace?: string) => {
    const url = `${API_BASE}/apikeys/approval-queue${namespace ? `?namespace=${namespace}` : ''}`;
    return consoleFetch(url);
  },

  approveAPIKey: async (namespace: string, name: string) => {
    const url = `${API_BASE}/apikeys/${namespace}/${name}/approve`;
    return consoleFetch(url, { method: 'POST' });
  },

  rejectAPIKey: async (namespace: string, name: string) => {
    const url = `${API_BASE}/apikeys/${namespace}/${name}/reject`;
    return consoleFetch(url, { method: 'POST' });
  },
};
```

**B) Component Implementation (NEW)**

**APIProductListPage** (implements issue #316):

```typescript
export const APIProductListPage: React.FC = () => {
  const [apiProducts, setAPIProducts] = React.useState<APIProduct[]>([]);
  const [currentUser, setCurrentUser] = React.useState<string>('');
  const [userGroups, setUserGroups] = React.useState<string[]>([]);

  React.useEffect(() => {
    // Fetch current user
    k8sGet({ model: UserModel, name: '~' }).then(user => {
      setCurrentUser(user.metadata.name);
      setUserGroups(user.groups || []);
    });

    // Fetch APIProducts from backend API
    devPortalApi.listAPIProducts(namespace)
      .then(data => setAPIProducts(data.items));
  }, [namespace]);

  // Filter buttons based on ownership (client-side for UX)
  const canEdit = (product: APIProduct) => {
    const isOwner = product.status?.owner === currentUser;
    const isAdmin = userGroups.includes('kuadrant-api-admins');
    return isOwner || isAdmin;
  };

  return (
    <Table>
      {apiProducts.map(product => (
        <TableRow key={product.metadata.name}>
          <TableData>{product.spec.displayName}</TableData>
          <TableData>
            {canEdit(product) && (
              <>
                <Button onClick={() => handleEdit(product)}>Edit</Button>
                <Button onClick={() => handleDelete(product)}>Delete</Button>
              </>
            )}
          </TableData>
        </TableRow>
      ))}
    </Table>
  );
};

// IMPORTANT: status.owner field is NEVER displayed in the UI
```

**MyAPIKeysPage** (implements issue #317):

```typescript
export const MyAPIKeysPage: React.FC = () => {
  const [myKeys, setMyKeys] = React.useState<APIKey[]>([]);

  React.useEffect(() => {
    // Backend already filters by requester
    devPortalApi.getMyAPIKeys(namespace)
      .then(data => setMyKeys(data.items));
  }, [namespace]);

  // All keys returned are user's keys - no additional filtering needed

  return (
    <Table>
      {myKeys.map(key => (
        <TableRow>
          <TableData>{key.spec.apiProductRef.name}</TableData>
          <TableData>{key.spec.plan}</TableData>
          <TableData>{key.status.phase}</TableData>
          {key.status.phase === 'Approved' && (
            <TableData>
              <Button onClick={() => revealSecret(key)}>View Secret</Button>
            </TableData>
          )}
        </TableRow>
      ))}
    </Table>
  );
};
```

**APIKeyApprovalPage** (implements issue #318):

```typescript
export const APIKeyApprovalPage: React.FC = () => {
  const [pendingKeys, setPendingKeys] = React.useState<APIKey[]>([]);

  React.useEffect(() => {
    // Backend filters: only keys for APIProducts user owns
    devPortalApi.getApprovalQueue(namespace)
      .then(data => setPendingKeys(data.items));
  }, [namespace]);

  const handleApprove = async (key: APIKey) => {
    const confirmed = await showConfirmModal('Approve API key request?');
    if (!confirmed) return;

    await devPortalApi.approveAPIKey(key.metadata.namespace, key.metadata.name);
    // Refresh queue
    refreshApprovalQueue();
  };

  const handleReject = async (key: APIKey) => {
    const confirmed = await showConfirmModal('Reject API key request?');
    if (!confirmed) return;

    await devPortalApi.rejectAPIKey(key.metadata.namespace, key.metadata.name);
    refreshApprovalQueue();
  };

  return (
    <Table>
      {pendingKeys.map(key => (
        <TableRow>
          <TableData>{key.spec.requester}</TableData>
          <TableData>{key.spec.apiProductRef.name}</TableData>
          <TableData>{key.spec.plan}</TableData>
          <TableData>{key.spec.useCase}</TableData>
          <TableData>
            <Button onClick={() => handleApprove(key)}>Approve</Button>
            <Button onClick={() => handleReject(key)}>Reject</Button>
          </TableData>
        </TableRow>
      ))}
    </Table>
  );
};
```

### Security Considerations

#### Three-Layer Security Model

**Layer 1: Webhook (Admission Control)**
- Blocks unauthorized CREATE/UPDATE/DELETE before resource is stored
- Validates ownership on every operation
- Protects against kubectl/oc bypass
- Cannot be circumvented by users

**Layer 2: HTTP API (Read Filtering)**
- Server-side filtering prevents data leakage
- APIKeys filtered by requester/ownership
- Token authentication via TokenReview
- Validates ownership before approval

**Layer 3: Console Plugin (UX)**
- Client-side button filtering
- Improves user experience
- NOT a security layer (enforcement happens in layers 1 & 2)
- Users never see ownership field

#### Authentication & Authorization

**Token Flow:**
1. User logs into OpenShift Console (OAuth)
2. Console obtains bearer token automatically
3. Console plugin includes token in API requests (via `consoleFetch`)
4. Backend validates token via K8s TokenReview API
5. Extracts username and groups for ownership checks

**Admin Identification:**
- Single global admin group: `kuadrant-api-admins`
- Users create this group and assign members
- Checked consistently in webhook and API endpoints

**Service Account Compatibility:**
- RHDH backend uses service account
- Service account can be added to `kuadrant-api-admins` group OR
- Service account granted cluster role that bypasses webhook
- No breaking changes to RHDH workflow

#### Data Exposure Model

| Resource | Visibility | Edit Access | Security Layer |
|----------|-----------|-------------|----------------|
| **APIProduct** | All users (catalog) | Owners + admins | Webhook + client-side filtering |
| **APIKey** | Requester + product owner + admins | Requester (cancel) + owner (approve) + admins | API filtering + webhook |
| **Secret** | Requester only (one-time reveal) | Read-only | Existing controller logic |

#### Threat Model

**Protected:**
- ✅ User modifying APIProduct they don't own (webhook blocks)
- ✅ User approving APIKey for APIProduct they don't own (webhook + API block)
- ✅ User viewing other users' APIKey requests (API filters server-side)
- ✅ kubectl/oc bypass (webhook validates all K8s API requests)
- ✅ Ownership transfer by non-admins (webhook blocks annotation changes)

**Not Protected (Out of Scope):**
- Cluster admins with direct etcd access (cluster-level privilege)
- Service accounts with broad cluster roles (intentional for automation)
- RBAC misconfigurations (user's operational responsibility)

**Alternative Considered:**
- API-only validation (no webhook for APIKey approval)
- ✅ Pros: No TLS certificate management needed
- ❌ Cons: Doesn't protect against kubectl-based approval
- **Decision:** Implement webhook to protect both console and kubectl paths
- **Team discussion required:** Is kubectl approval a realistic threat?

### Testing Strategy

#### Unit Tests

**developer-portal-controller:**

```go
// Webhook tests
func TestAPIProductWebhook_Create_SetsOwnership(t *testing.T)
func TestAPIProductWebhook_Update_BlocksNonOwner(t *testing.T)
func TestAPIProductWebhook_Update_AllowsAdmin(t *testing.T)
func TestAPIProductWebhook_Update_BlocksOwnershipTransfer(t *testing.T)
func TestAPIKeyWebhook_Create_SetsRequester(t *testing.T)
func TestAPIKeyWebhook_Update_ValidatesAPIProductOwnership(t *testing.T)

// API tests
func TestListAPIProducts_ReturnsAllWithOwner(t *testing.T)
func TestGetMyAPIKeys_FiltersCorrectly(t *testing.T)
func TestGetApprovalQueue_FiltersCorrectly(t *testing.T)
func TestApproveAPIKey_ValidatesOwnership(t *testing.T)
func TestApproveAPIKey_AllowsAdmin(t *testing.T)

// Reconciler tests
func TestReconciler_SetsStatusOwner(t *testing.T)
func TestReconciler_HandlessMissingAnnotation(t *testing.T)
```

**console-plugin:**

```typescript
describe('APIProductListPage', () => {
  test('shows edit button for owned products', () => {});
  test('hides edit button for non-owned products', () => {});
  test('shows edit button for admins on all products', () => {});
});

describe('devPortalApi', () => {
  test('calls correct endpoint with token', async () => {});
  test('includes namespace in query params', async () => {});
});
```

#### Integration Tests

**Test 1: Create and Own APIProduct**
```
1. User alice creates APIProduct via console
2. Assert: kuadrant.io/created-by = alice
3. Assert: status.owner = alice
4. Assert: Edit button visible to alice
5. User bob views same APIProduct
6. Assert: Edit button hidden for bob
```

**Test 2: Admin Transfer Ownership**
```
1. Admin edits kuadrant.io/created-by annotation (alice → bob)
2. Controller reconciles
3. Assert: status.owner = bob
4. Assert: alice cannot edit
5. Assert: bob can edit
```

**Test 3: APIKey Approval Workflow**
```
1. Consumer alice creates APIKey for product owned by bob
2. Assert: spec.requester = alice
3. Alice views "My Keys" - sees her request
4. Bob views "Approval Queue" - sees alice's request
5. Charlie (different owner) views queue - does NOT see request
6. Bob approves APIKey
7. Assert: phase = Approved
```

**Test 4: kubectl Bypass Protection**
```
1. User attempts: kubectl patch apiproduct --owner=admin
2. Assert: Webhook denies (not admin)
3. Admin attempts same command
4. Assert: Webhook allows
5. Assert: status.owner updated
```

#### RHDH Compatibility Tests

**Test 1: RHDH Can Create APIProduct**
```
1. RHDH backend creates APIProduct
2. Assert: Resource created successfully
3. Assert: Webhook doesn't block service account
```

**Test 2: RHDH Approval Workflow Unchanged**
```
1. RHDH backend approves APIKey
2. Assert: Phase updated
3. Assert: Secret created
4. Assert: No breaking changes
```

**Test 3: Backfill Existing APIProducts**
```
1. APIProduct exists without status.owner
2. Controller reconciles
3. Assert: status.owner backfilled from annotation
4. Assert: Console handles missing field gracefully
```

#### Performance Benchmarks

- List 1000 APIProducts: < 500ms
- Filter approval queue (100 pending keys): < 200ms
- Webhook validation: < 50ms

## Implementation Plan

### Phase 1: developer-portal-controller Foundation

**Tasks:**

- [ ] Add status.owner field to APIProduct CRD
  - [ ] Unit tests for CRD schema
  - [ ] Integration tests for backward compatibility
- [ ] Add status.owner field to APIKey CRD
  - [ ] Unit tests for CRD schema
  - [ ] Integration tests for backward compatibility
- [ ] Implement reconciler changes
  - [ ] Read kuadrant.io/created-by annotation
  - [ ] Set status.owner field
  - [ ] Handle missing annotation gracefully
  - [ ] Unit tests for reconciler
  - [ ] Integration tests for backfilling existing resources
- [ ] Implement ValidatingWebhook
  - [ ] Create webhook server (port 9443)
  - [ ] Generate/configure TLS certificates via cert-manager
  - [ ] Implement APIProduct validation logic
  - [ ] Implement APIKey validation logic
  - [ ] Register ValidatingWebhookConfiguration
  - [ ] Unit tests for webhook validation
  - [ ] Integration tests for admission control
- [ ] Implement HTTP API Server
  - [ ] Create HTTP server (port 8080)
  - [ ] Implement authentication (TokenReview)
  - [ ] Implement GET /apiproducts
  - [ ] Implement GET /apikeys/my-keys
  - [ ] Implement GET /apikeys/approval-queue
  - [ ] Implement POST /apikeys/:namespace/:name/approve
  - [ ] Implement POST /apikeys/:namespace/:name/reject
  - [ ] Unit tests for API handlers
  - [ ] Integration tests for filtering logic
- [ ] Deployment updates
  - [ ] Update Deployment manifest (ports 8080, 9443)
  - [ ] Create Service for HTTP API
  - [ ] Create Service for webhook
  - [ ] Configure cert-manager Certificate
  - [ ] Create ValidatingWebhookConfiguration

### Phase 2: Console Plugin Implementation

**Tasks:**

- [ ] Create API client
  - [ ] Implement src/utils/devPortalApi.ts
  - [ ] Use consoleFetch for authenticated requests
  - [ ] Handle errors and retries
  - [ ] Unit tests for API client
- [ ] Create APIProduct components (issue #316, #320, #321)
  - [ ] Create APIProductListPage
    - [ ] Call API for data
    - [ ] Implement ownership-based button filtering
    - [ ] Never display ownership field
  - [ ] Create APIProductDetailsPage
    - [ ] Tabbed view (Overview, Plans, Authentication)
    - [ ] Show/hide edit/delete based on ownership
  - [ ] Create APIProductForm
    - [ ] No ownership input field
    - [ ] Webhook auto-sets on save
  - [ ] Unit tests for components
  - [ ] Integration tests for ownership filtering
- [ ] Create APIKey components (issue #317, #318)
  - [ ] Create MyAPIKeysPage
    - [ ] Call /apikeys/my-keys endpoint
    - [ ] Display user's requests
    - [ ] Secret revelation modal
  - [ ] Create APIKeyApprovalPage
    - [ ] Call /apikeys/approval-queue endpoint
    - [ ] Approve/reject with confirmation modals
  - [ ] Unit tests for components
  - [ ] Integration tests for approval workflow
- [ ] E2E testing
  - [ ] Test ownership workflows end-to-end
  - [ ] Test kubectl bypass protection
  - [ ] Test admin transfer scenarios

### Phase 3: Documentation & Migration

**Tasks:**

- [ ] Documentation
  - [ ] Update README with RBAC setup
  - [ ] Document how to create kuadrant-api-admins group
  - [ ] API endpoint reference
  - [ ] Webhook configuration guide
  - [ ] Troubleshooting guide
- [ ] Migration plan
  - [ ] Backfill status.owner for existing APIProducts
  - [ ] Document breaking changes (if any)
  - [ ] RHDH compatibility notes
- [ ] RHDH regression testing
  - [ ] Verify RHDH workflows still work
  - [ ] Test service account permissions
  - [ ] Validate no breaking changes

## Open Questions

**Resolved:**
- Admin group model: Single global admin group (`kuadrant-api-admins`)
- Ownership storage: Annotation (protected) + Status (read-only)
- Webhook requirement: Yes, needed to protect kubectl access
- Secret revelation: Reuse existing developer-portal-controller mechanism

**For Team Discussion:**
- Webhook vs API-only validation for APIKey approval
  - Webhook protects kubectl but requires TLS certs
  - API-only is simpler but allows kubectl bypass
  - Is kubectl approval a realistic threat model?

## Execution

### Todo

- [ ] Phase 1: developer-portal-controller foundation
  - [ ] Unit tests for CRD changes
  - [ ] Integration tests for reconciler
  - [ ] Unit tests for webhook
  - [ ] Integration tests for admission control
  - [ ] Unit tests for HTTP API
  - [ ] Integration tests for filtering
- [ ] Phase 2: Console plugin implementation
  - [ ] Unit tests for components
  - [ ] Integration tests for API calls
  - [ ] E2E tests for ownership workflows
- [ ] Phase 3: Documentation and migration
  - [ ] RBAC setup guide
  - [ ] Migration plan for existing resources
  - [ ] RHDH compatibility validation

### Completed

## Change Log

### 2026-03-27 — Initial design created

**Key design decisions:**
- Three-layer security: webhook (admission), API (filtering), UI (UX)
- Username-based ownership (auto-set, invisible to users)
- Two-tier permissions: owners + global admins
- Single webhook for both APIProduct and APIKey
- Server-side filtering for APIKeys (security requirement)
- Backward compatible with existing RHDH deployment
- Reuse existing secret revelation mechanism

**Alternative approaches considered:**
- ValidatingAdmissionPolicy (native K8s) vs custom webhook
  - Decision: Custom webhook (can fetch APIProduct for validation)
- API-only validation vs webhook + API
  - Decision: Both layers (webhook protects kubectl, API filters reads)
- Namespace-scoped admins vs global admins only
  - Decision: Global only (namespace organization too unpredictable)

## References

- [GitHub Discussion #341: RBAC for Dev Portal Users](https://github.com/Kuadrant/kuadrant-console-plugin/discussions/341)
- [Kubernetes ValidatingAdmissionPolicy Documentation](https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy/)
- [How to Build a Webhook Server That Handles Multiple Admission Resources](https://oneuptime.com/blog/post/2026-02-09-webhook-server-multiple-admission-resources/view)
- [Kubebuilder Webhook Implementation Guide](https://book.kubebuilder.io/cronjob-tutorial/webhook-implementation)
- [OpenShift LDAP Authentication Guide](https://medium.com/@salwan.mohamed/openshift-ldap-authentication-identity-management-a-complete-enterprise-implementation-guide-3c042bb31ce2)
- [Enterprise OpenShift Authentication: OIDC](https://medium.com/@salwan.mohamed/enterprise-openshift-authentication-implementing-oidc-identity-providers-for-production-eb1deb29ccf3)
- [developer-portal-controller repository](https://github.com/Kuadrant/developer-portal-controller)
- [kuadrant-backstage-plugin repository](https://github.com/Kuadrant/kuadrant-backstage-plugin)
