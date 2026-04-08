# Feature: Developer Portal Integration in Console Plugin

## Summary

Add UI components to the Kuadrant console plugin for managing Developer Portal resources (APIProduct and APIKey CRDs). This provides a native OpenShift Console experience for managing API catalog entries and access requests, enabling API owners and consumers to work directly within the platform.

## Goals

- Provide API owners with UI to view and manage APIProducts in the console
- Enable developers to view their API key requests and request new access within the console
- Allow API owners/admins to approve or reject API key requests with appropriate confirmation flows
- Implement RBAC-aware views that show/hide functionality based on user personas (Consumer, Owner, Admin)
- Maintain consistency with existing Kuadrant plugin patterns (resource lists, detail views, forms)

## Non-Goals

- Replacing the Backstage developer portal (this is complementary, not a replacement)
- Implementing automatic API discovery (handled by developer-portal-controller)
- Creating new CRD definitions (APIProduct and APIKey already exist in developer-portal-controller)
- Implementing API key generation logic (handled by developer-portal-controller)
- Changing the existing Gateway/HTTPRoute/Policy management workflows

## Design

### Backwards Compatibility

No breaking changes. This adds new views and components without modifying existing Gateway API or Policy management features.

### Architecture Changes

```
OpenShift Console Plugin (New Components)
├── API Products
│   ├── List View (#316)
│   ├── Detail View (#320)
│   └── Create/Edit Form (#321)
└── API Keys
    ├── My Keys View (#317)
    └── Approval View (#318)
```

**Integration with Existing Ecosystem:**

- **developer-portal-controller**: Reconciles APIProduct and APIKey CRDs
- **kuadrant-backstage-plugin**: Developer-facing portal for browsing APIs
- **console-plugin** (this repo): Admin and owner interface for API management

### API Changes

Uses existing CRDs from `developer-portal-controller`:

**APIProduct** (`devportal.kuadrant.io/v1alpha1`):

```yaml
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIProduct
metadata:
  name: petstore-api
  namespace: petstore
spec:
  displayName: Petstore API
  description: A sample API for managing pets
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: petstore-route
  owner: api-team
status:
  conditions:
    - type: Ready
      status: "True"
  plans:
    - name: gold
      tier: premium
    - name: silver
      tier: standard
  authSchemes:
    - type: apiKey
  openAPISpecRef:
    url: https://petstore.example.com/openapi.json
```

**APIKey** (`devportal.kuadrant.io/v1alpha1`):

```yaml
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: user-petstore-gold
  namespace: petstore
spec:
  apiProductRef:
    name: petstore-api
  plan: gold
  requester: developer@example.com
  useCase: "Mobile app integration"
  approvalMode: manual
status:
  phase: Pending  # Pending | Approved | Rejected
  secretRef:
    name: user-petstore-gold-secret  # Created after approval
```

### Component Changes

#### 1. APIProduct Components (`src/components/apiproduct/`)

**APIProductListPage** (#316):

- Figma design: <https://www.figma.com/design/nDsKwCU06OyhXH7bvOHxap/-Latest--RHCL-dev-portal-in-OCP?node-id=893-47728&m=draw>
- Microcopy: <https://docs.google.com/document/d/11iB4C68KV4LVzoEnOVTXzcc4qVDaAuAtF_inbpKZcOs/edit?tab=t.dj9d75n0gfxu>
- Watch APIProduct resources using `useK8sWatchResource`
- Filter by namespace or all namespaces (#ALL_NS#)
- RBAC: All personas can view, filtered by access

**1. Empty State**:

- Component: PF6 EmptyState
- Display when no API Products exist

**2. Loading State**:

- Icon: PF6 Spinner
- Title: Heading (H2) using PF6 Typography
- Description: Body text (default) using PF6 Typography

**3. Overview (Table with Data)**:

- Table filters:
  - Status filter: PF6 Toolbar with filter
  - Other filters: PF6 Attribute search
- Table headers: PF6 Header cell (default with sortable)
- Columns: Name, Display Name, Namespace, HTTPRoute Target, Plans, Status, Actions
- API product lifecycle status labels: PF6 filled labels
  - Draft: API is in draft state
  - Published: API is live in API catalog
  - Deprecated: API is still functional but scheduled to be retired
  - Retired: API is no longer accessible
- Tag labels: PF6 outlined labels

**4. Table Actions**:

- Table filter menu: PF6 Menu with actions
- Table action buttons in actions column

**5. Tooltips & Toolbar Menu**:

- Tooltips for status labels and table elements
- Toolbar menu for bulk actions

**APIProductDetailsPage** (#320):

- Figma design: <https://www.figma.com/design/nDsKwCU06OyhXH7bvOHxap/-Latest--RHCL-dev-portal-in-OCP?node-id=893-47728&m=draw>
- Microcopy: <https://docs.google.com/document/d/11iB4C68KV4LVzoEnOVTXzcc4qVDaAuAtF_inbpKZcOs/edit?tab=t.dj9d75n0gfxu>
- Tabbed view: Overview, YAML, Policies

**1. Overview Tab**:

- Action button: PF6 MenuToggle with custom icon
- API product lifecycle label: PF6 filled labels (Draft, Published, Deprecated, Retired)
- Properties list: PF6 SimpleList displaying API details
- Link buttons: PF6 Link button (with icon) for adding API spec and API documentation
  - Opens API editing modal on click
- Publish/Unpublish button:
  - Before publish: Shows "Publish API product"
  - After publish: Changes to "Unpublish API product"
  - Shows toast alert after publish action
- Display discovered plans from status.plans
- Show auth schemes from status.authSchemes
- Link to referenced HTTPRoute

**2. YAML Tab**:

- YAML editor view for direct resource editing

**3. Policies Tab**:

- Show PlanPolicy and tiers if HTTPRoute has attached PlanPolicy
- Show RateLimitPolicy and AuthPolicy if HTTPRoute does not have attached PlanPolicy
- Display AuthPolicy in both scenarios

**4. Tooltips & Toast Alerts**:

- Tooltips for field explanations
- Toast alerts for publish/unpublish actions
- Status conditions display (Ready, Discovered)

**APIProductForm** (#321):

- Figma design: <https://www.figma.com/design/nDsKwCU06OyhXH7bvOHxap/-Latest--RHCL-dev-portal-in-OCP?node-id=893-47728&m=draw>
- Microcopy: <https://docs.google.com/document/d/11iB4C68KV4LVzoEnOVTXzcc4qVDaAuAtF_inbpKZcOs/edit?tab=t.kyxh9rr7ffo4>

**1. API Product Creation Form**:

- Tab: Switch between Form view and YAML view
- Kubernetes resource name:
  - Auto-generated from API product display name
  - Editable manually
- Form fields:
  - Display Name (required)
  - Description (optional)
  - Tags: PF6 Menu with filtering/search input, uses PF6 Divider to visually separate options
  - HTTPRoute selector: PF6 Menu with actions
  - Owner (required)
  - Lifecycle status: PF6 context selector menu (Draft, Published, Deprecated, Retired)
    - Retired label is disabled in creation mode
- HTTPRoute policies list:
  - Component: PF6 SimpleList
  - Shows all policies attached to selected route including gateway-level policies
- Validation: Ensure HTTPRoute exists before creation

**2. After Click [Create] Button**:

- Toast alert: "API product created successfully"
- Redirect to API product details page
- Publish button is enabled on details page

**3. Tooltips & Policy Text Area**:

- HTTPRoute tooltip: "When an HTTPRoute is selected, the attached Plan Policies define the consumption rules. Note: The API Product and its policies must share the same namespace."
- HTTPRoute policies tooltip: "A consolidated view of all policies attached to this route (including gateway-level policies)."

**4. YAML View**:

- Direct YAML editing capability
- Toggle from Form view using tab

**5. Edit Mode**:

- Title: "Edit API product" (instead of "Create")
- Resource name field: Read-only in edit mode
- Published API product alert:
  - Component: PF6 Notification drawer
  - Shows alert if API product is already published to API catalog
  - Shows different alert if already published to API consumers

**6. Delete Action**:

- Confirmation modal for API product deletion
- **IMPORTANT:** Modal must show count of dependent APIKeys that will be cascade-deleted
- Modal layout:

  ```
  Warning: Deleting this API Product will revoke access for active API keys

  Are you sure you want to delete "Petstore API"?
  - X approved API keys will be revoked immediately
  - X pending requests will be cancelled
  - X rejected requests will be deleted
  - This action cannot be undone

  Type "petstore-api" to confirm:
  [__________________]

  [Cancel] [Delete API Product]
  ```

- Implementation: Query dependent APIKeys using `useK8sWatchResource` filtered by `spec.apiProductRef.name`
- Delete button disabled until user types exact resource name
- Kubernetes garbage collection will automatically delete all child APIKeys and their Secrets (see Edge Cases section)

**7. Alerts & Notifications**:

- Toast alerts for create/update/publish/unpublish actions
- Inline alerts for published API products during edit
- Use `KuadrantCreateUpdate` component for save operations

#### 2. APIKey Components (`src/components/apikey/`)

**MyAPIKeysPage** (#317):

- Figma design: <https://www.figma.com/design/nDsKwCU06OyhXH7bvOHxap/-Latest--RHCL-dev-portal-in-OCP?node-id=68-19935&t=F2Yvq6iI78uOWRoO-1>
- Request modal design: <https://www.figma.com/design/nDsKwCU06OyhXH7bvOHxap/-Latest--RHCL-dev-portal-in-OCP?node-id=514-22090&t=pZkUvO5i7wWS87B5-1>
- Microcopy: <https://docs.google.com/document/d/11iB4C68KV4LVzoEnOVTXzcc4qVDaAuAtF_inbpKZcOs/edit?tab=t.aoj7rlqap922>
- UX Prototype: <https://my-api-keys-ux-demo.vercel.app/>
- User-scoped view showing only the requester's APIKeys

**1. My API Keys List Page**:

**Empty State**:

- Component: PF6 EmptyState
- Display when user has no API keys

**Loading State**:

- Component: PF6 Spinner
- Display while fetching API keys

**Collapsed List**:

- Table columns: API Product, Plan, Status, Requested Date, Actions
- Hover on tier label to view details in tooltip
- Filter by status: Approved, Rejected, Pending
- Rejected items only have "delete" action

**Expanded List**:

- Shows additional details when row is expanded
- Expandable rows pattern

**2. Reveal API Key Modal**:

- Trigger: Clicking mask area or eye icon
- Modal displays the API key secret
- Close icon and button disabled until user checks acknowledgment checkbox
- Prevents accidental key exposure

**3. API Key Details Page**:

**Active API Key**:

- Shows full API key details
- Two options for API key field:
  - Option 1: Masked with reveal on click
  - Option 2: Eye icon to trigger reveal modal
- Reveal process shows on the page

**Pending API Key**:

- Shows pending status
- Limited actions available until approved

**Rejected API Key**:

- Shows rejection reason
- "Request a new key" button opens request modal on current page

**4. API Key Tab in API Details Page**:

- Shows user's API keys for specific API product
- Embedded view within API product details

**5. API Key Request Modal**:

**Step 1: Request API Key**:

- API selector: PF6 Search with autocomplete
  - Max 3.x visible menu items at once
  - Fourth item partially visible to indicate scrollability
- Tier field: Disabled until API is selected

**Search for API**:

- Search input with autocomplete functionality
- Shows "No results" state if search yields nothing

**Select Tier**:

- Component: PF6 Option single select menu
- Enabled only after API is selected
- Shows available tiers for selected API

**Provide API Key Name**:

- Blank field error validation
- Duplicate name error validation
- Success state when valid name provided
- Description hidden when field is configured

**Request from API Details Page**:

- API field is read-only (pre-selected)
- Only tier and name fields are editable

**View API Key from API Details Page**:

- Breadcrumbs show third-level navigation
- Opens API key details without returning to My API keys list

**6. Delete API Keys**:

> **Note:** APIKey editing is not supported in the initial release. Users must delete and create a new APIKey if changes are needed.

**Delete API Key**:

- Confirmation modal with input field
- User must type correct API key name to enable Delete button
- Field shows warning state for incorrect input
- Field shows success state for correct input
- Delete button disabled until correct name entered

**7. Notifications**:

- Toast notifications for all key actions
- Success/error states clearly communicated

**APIKeyApprovalPage** (#318):

- Figma design: <https://www.figma.com/design/nDsKwCU06OyhXH7bvOHxap/-Latest--RHCL-dev-portal-in-OCP?node-id=514-23096&t=gksvHbkczPbDoe9f-1>
- Microcopy: <https://docs.google.com/document/d/11iB4C68KV4LVzoEnOVTXzcc4qVDaAuAtF_inbpKZcOs/edit?tab=t.ulo6upsfhvma>
- UX Prototype: <https://api-key-approval-ux-demo.vercel.app/>
- RBAC: Only visible to Owner and Admin personas

**1. API Key Approval List Page**:

**Empty State**:

- Component: PF6 EmptyState
- Display when no pending approvals exist

**Loading State**:

- Component: PF6 Spinner
- Display while fetching approval requests

**With Data**:

- Component: PF6 Table with checkboxes, radio select, and actions
- Table columns: Checkbox, Requester, API Product, Plan, Use Case, Date, Status, Actions
- Status column: Sorted in descending order (pending > approved > rejected)
- Use Case column: Truncated with PF6 Tooltip for full content
- Table checkboxes for approved/rejected items are disabled
- No action menu for approved/rejected items
- Filter by API Product, requester, date
- List APIKeys in "Pending" phase for products the user owns

**2. Bulk Selection**:

- "Approve x selected" button appears after bulk selection
- "Reject x selected" button appears after bulk selection
- Buttons only visible when items are selected
- Cannot select approved/rejected items (checkboxes disabled)

**3. Approve API Key Modal**:

**Single Approval**:

- Displays single API key details
- Confirmation required before approval

**Bulk Approval**:

- Compact table showing selected items
- Max 4 entries visible at once
- Table is scrollable for more items
- Table header is fixed during scroll
- API owners can remove items during approval process
- Modal closes when last item is removed (assumes user abandons operation)
- "Approve N API keys" title updates based on remaining items

**4. Reject API Key Modal**:

**Single Rejection**:

- Displays single API key details
- Optional rejection reason field
- Confirmation required before rejection

**Bulk Rejection**:

- Compact table showing selected items
- Max 4 entries visible at once
- Table is scrollable for more items
- Table header is fixed during scroll
- API owners can remove items during rejection process
- Modal closes when last item is removed (assumes user abandons operation)
- "Reject N API keys" title updates based on remaining items
- Optional rejection reason applies to all items

**5. Notifications**:

- Toast notifications for approval actions
- Toast notifications for rejection actions
- Success/error states clearly communicated
- Controller creates Secret with actual key upon approval
- Update APIKey status on approval/rejection

### Security Considerations

> **📖 Full RBAC Design:** This section provides a high-level overview. For complete RBAC architecture, permission matrices, validation procedures, and deployment patterns, see **[API Management RBAC Design](./2026-03-26-api-management-rbac-design.md)**.

**RBAC Implementation** ([#353](https://github.com/Kuadrant/kuadrant-console-plugin/issues/353)):

**Namespace-Based RBAC Model:**

- **API Consumer**: Can view API Products, request API keys, view own keys
- **API Owner**: Can manage API Products they own, approve/reject access requests
- **API Admin**: Can manage all API Products, approve/reject all requests

**Key Architectural Decisions:**

1. **APIKeys in consumer's namespace** (not owner's) for RBAC-enforced isolation between consumers
2. **APIKeyRequest shadow resources** in owner's namespace enable request discovery without exposing API key values
3. **APIKeyApproval CRD** enforces approval workflow via namespace separation (consumers cannot approve their own requests)
4. **Centralized secret storage** in `kuadrant` namespace with API key value projection via `status.apiKeyValue`
5. **All operations as logged-in user** via OpenShift Console's OAuth token (no backend service accounts)

**Security Measures**:

- Double-confirmation modal for approve/reject actions to prevent accidental changes
- RBAC checks before rendering create/edit/approve buttons using `useAccessReviews`
- API key secrets only readable by the requester (enforced by controller)
- Audit logging of approval/rejection actions via Kubernetes events

### Edge Cases and Lifecycle Behaviors

This section addresses critical lifecycle behaviors that emerged during design review.

#### 1. APIKey Editing (Not Implemented)

**Decision:** APIKey editing is **not supported** in the initial release due to complexity around re-approval workflows and controller reconciliation logic.

**Current Behavior:**

- Users cannot edit existing APIKeys (no edit button in UI)
- To change tier, use case, or other fields: user must delete the old APIKey and create a new one
- Deletion of an approved APIKey immediately revokes access (deletes the Secret)

**Rationale:**

- The `developer-portal-controller` has no reconciliation logic for handling spec changes after initial approval
- Re-approval workflows introduce complexity around:
  - Whether old key remains active during pending state
  - How to transition between Secrets without downtime
  - Validation of which fields can/cannot be edited
- Initial release focuses on create, approve/reject, and delete workflows

**Future Enhancement:**
If editing is needed in future releases, recommend "Safe Re-approval" approach:

- Editing transitions APIKey back to `Pending` phase
- Old Secret remains active until new request is approved
- Upon approval, controller creates new Secret and deletes old one
- Zero downtime for the developer
- Requires controller enhancement to track "previous Secret" reference

#### 2. APIProduct Deletion and Cascade Effects

**Design Decision:** APIProduct uses a finalizer to ensure clean deletion order. The resource cannot be deleted until all child APIKeys and Secrets are cleaned up.

**Deletion Flow:**

```
1. User initiates delete → APIProduct gets deletionTimestamp
2. Controller detects deletionTimestamp, starts cleanup:
   - Deletes all child APIKeys (Pending, Approved, Rejected)
   - Waits for Kubernetes garbage collection to delete Secrets
3. Once all APIKeys are gone → Controller removes finalizer
4. APIProduct is finally deleted

Result: All API access revoked, no orphaned resources
```

**Current Implementation Status:**

- Controller has RBAC for finalizers (`apiproducts/finalizers,verbs=update`)
- Controller sets `OwnerReference` on APIKeys ([apikey_controller.go:130-138](https://github.com/Kuadrant/developer-portal-controller/blob/main/internal/controller/apikey_controller.go#L130-L138))
- **Missing:** Finalizer add/remove logic in reconcile loop (needs implementation)

**UX Requirements:**

The deletion modal (section 6 under APIProductForm) **must** show dependent resource counts:

**Enhanced Delete Confirmation Modal:**

```jsx
Warning: Deleting this API Product will revoke access for active API keys

Are you sure you want to delete "Petstore API"?
- 47 approved API keys will be revoked immediately
- 12 pending requests will be cancelled
- 8 rejected requests will be deleted
- This action cannot be undone

Type "petstore-api" to confirm:
[__________________]

[Cancel] [Delete API Product]
```

**Implementation:** Query dependent APIKeys using `useK8sWatchResource` filtered by `spec.apiProductRef.name` and count by phase (Approved, Pending, Rejected).

**Note:**

- APIProducts can be deleted at any lifecycle stage
- Finalizer ensures clean deletion order (APIKeys/Secrets cleaned up before APIProduct removal)
- Retirement (section 4) is **recommended** before deletion to give developers migration time
- Deletion modal shows warning and key counts before user confirms
- Deletion is asynchronous - resource gets `deletionTimestamp` immediately, actual removal happens after cleanup

#### 3. APIProduct Lifecycle States (Draft → Published → Deprecated → Retired)

**Critical Finding:** The design doc shows four lifecycle states (`Draft | Published | Deprecated | Retired`), but the actual CRD only supports two:

```go
// From apiproduct_types.go:102-104
// +kubebuilder:validation:Enum=Draft;Published
// +kubebuilder:default=Draft
PublishStatus string `json:"publishStatus"`
```

**There is no "Retired" or "Deprecated" state in the controller!**

**Decision:** Extend the CRD to support all four lifecycle states.

**Required CRD Change:**

```go
// developer-portal-controller/api/v1alpha1/apiproduct_types.go
// +kubebuilder:validation:Enum=Draft;Published;Deprecated;Retired
PublishStatus string `json:"publishStatus"`
```

**State Definitions:**

- **Draft**: Not visible in API catalog, cannot request keys
- **Published**: Visible in catalog, accepting new requests
- **Deprecated**: Visible with warning, new requests blocked, existing keys continue working (grace period)
- **Retired**: Not visible, blocks new requests, all existing keys revoked (see section 4)

#### 4. Retired APIProducts and Existing APIKeys

**Decision:** Two-stage retirement with hard revocation

When an APIProduct is retired, all existing API keys are revoked immediately. This ensures clean state management and prevents orphaned access.

**Retirement Workflow:**

```yaml
# Stage 1: Deprecation (Warning Phase)
1. Owner sets publishStatus: Deprecated
   - API catalog shows "Deprecated" badge
   - New APIKey requests are blocked with warning
   - Existing approved keys continue working (grace period)
   - UI displays sunset date to developers

# Stage 2: Retirement (Revocation Phase)
2. Owner sets publishStatus: Retired
   - API removed from catalog
   - Controller reconciles all APIKeys for this product:
     - Approved → Rejected (Secrets deleted)
     - Pending → Rejected
   - All API access immediately revoked
   - New requests return validation error

# Stage 3: Deletion (Cleanup)
3. Owner deletes APIProduct (optional)
   - Cascade deletion removes all APIKey resources
   - Requires deletion modal confirmation with counts
```

**UI Behavior for Lifecycle States:**

**During Deprecation (Stage 1 - Warning Phase):**

In My API Keys Page:

```
Warning: This API is deprecated

The "Petstore API" is scheduled for retirement on 2026-12-31.
Please migrate to "Petstore API v2" before this date.
Your current API key will stop working when this API is retired.

[View Migration Guide]
```

**After Retirement (Stage 2 - Keys Revoked):**

In APIProduct Details Page (for admins/owners):

```
Retired API Product

This API has been retired. All API keys have been revoked.

[View Revoked Keys (47)] [Delete API Product]
```

In My API Keys Page:

```
Status: Rejected
Reason: Parent API Product "Petstore API" was retired on 2026-12-31

[Request Access to Petstore API v2]
```

#### 5. Un-retiring APIProducts

**Decision:** Retired products can be un-retired, but revoked keys are NOT restored.

**State Transition Rules:**

```
Draft ⟷ Published ⟷ Deprecated ⟷ Retired
  ↑                                    ↓
  └────────────────────────────────────┘
       (allowed but requires confirmation)
```

**Un-retirement Confirmation Modal:**

```
Un-retire "Petstore API"?

This will:
- Make the API visible in the catalog again
- Allow new API key requests

Important: Previously approved API keys (47) were revoked during retirement and will NOT be restored.
Users must request new API keys to regain access.

Previously rejected requests (12) will remain rejected.

[Cancel] [Un-retire API]
```

**Implementation:**

- Change `publishStatus: Retired` → `publishStatus: Published`
- UI must re-enable "Request Access" buttons
- Revoked APIKeys remain in "Rejected" state (Secrets were deleted during retirement)
- Users must create new APIKey requests to regain access

#### 6. Validation and Enforcement

**Required Validation Rules:**

1. **APIKey Creation Validation:**
   - Block new APIKey creation if `publishStatus: Retired`
   - Show error: "Cannot request access to retired API"

2. **APIProduct Deletion Validation:**
   - Require confirmation modal with dependent key counts (see section 6 under APIProductForm)
   - User must type resource name to confirm deletion

**Implementation Approach:**

- **Client-side:** UI prevents actions (better UX)
- **Server-side:** Validating webhook enforces rules (security)
- **Both required** for defense-in-depth

## Implementation Plan

1. **RBAC foundation** (#340): Define roles and personas, create RBAC manifests
2. **APIProduct List View** (#316): Basic list view with filtering
3. **APIProduct Detail View** (#320): Drill-down with tabs for plans, auth, OpenAPI
4. **APIProduct Create/Edit Form** (#321): CRUD operations for API Products
5. **My API Keys View** (#317): User-scoped view + request form
6. **API Key Approval View** (#318): Admin/owner approval workflow

## Testing Strategy

- **Unit tests**: Component rendering, form validation, RBAC visibility logic
- **Integration tests**: K8s resource watching, create/update/delete operations, RBAC enforcement
- **E2E tests**: Full user workflows (create API Product → request access → approve → verify secret creation)

## Open Questions

- **RBAC personas and implementation**: Three-persona model (Consumer, Owner, Admin) needs further discussion with UXD and engineering. Design docs being created to clarify the model. Issue #340 is blocked pending resolution.

## Implementation Dependencies

- **APIProduct CRD Extension Required**: The design assumes `publishStatus` supports `Draft | Published | Deprecated | Retired`, but the current CRD only supports `Draft | Published`. The `developer-portal-controller` team must extend the enum before lifecycle features can be implemented (see Edge Cases #3).

## Execution

### Todo

- [ ] [RBAC system for developer portal capabilities](https://github.com/Kuadrant/kuadrant-console-plugin/issues/353) ~**⏸️ BLOCKED: Pending RBAC model discussion**~
- [ ] [API Products List page](https://github.com/Kuadrant/kuadrant-console-plugin/issues/316)
  - [ ] Unit tests for list component rendering
  - [ ] Integration tests for resource watching and filtering
- [ ] [APIProduct Detail Page](https://github.com/Kuadrant/kuadrant-console-plugin/issues/320)
  - [ ] Unit tests for detail page tabs
  - [ ] Integration tests for HTTPRoute linking and status display
- [ ] [APIProduct Create/Edit Form](https://github.com/Kuadrant/kuadrant-console-plugin/issues/321)
  - [ ] Unit tests for form validation
  - [ ] Integration tests for create/update operations
- [ ] [My API Keys view](https://github.com/Kuadrant/kuadrant-console-plugin/issues/317)
  - [ ] Unit tests for request form
  - [ ] Integration tests for APIKey creation
- [ ] [API key approval view](https://github.com/Kuadrant/kuadrant-console-plugin/issues/318)
  - [ ] Unit tests for approval modal
  - [ ] Integration tests for approval workflow

### Completed

## Change Log

### 2026-04-02 — Added edge cases and lifecycle behaviors section

- **Decision:** APIKey editing is not supported in initial release (users must delete and recreate)
- **Enhanced deletion modal:** Added requirement to show dependent APIKey counts before deletion (see section 6 under APIProductForm)
- Clarified APIProduct deletion cascade effects and OwnerReference behavior (Kubernetes garbage collection)
- Identified CRD gap: `publishStatus` enum missing Deprecated/Retired states (design assumes 4 states, CRD only has 2)
- Defined retirement and un-retirement behaviors for APIProducts (soft/hard retirement options)
- Specified validation rules for blocking actions on retired products

### 2026-03-30 — Enhanced with detailed Figma design references

- Added specific Figma node-ids and microcopy links for all components
- Included PatternFly 6 component mappings from UXD specifications
- Added UX prototype links for My API Keys and API Key Approval flows
- Detailed component behaviors: empty states, loading states, modals, bulk operations
- Removed Backstage references to clarify this is OCP-native dev portal

### 2026-03-25 — Initial design created from Epic #313

- Created design doc from existing GitHub issues in Epic #313
- Organized features into API Product and API Key management sections
- Defined RBAC model aligned with three-persona architecture (Consumer, Owner, Admin)
- Established dependency order for implementation
- Documented integration points with developer-portal-controller and kuadrant-backstage-plugin

## References

- [Epic #313: Dev Portal in the Kuadrant console plugin](https://github.com/Kuadrant/kuadrant-console-plugin/issues/313)
- [Figma Design - RHCL Dev Portal in OCP](https://www.figma.com/design/nDsKwCU06OyhXH7bvOHxap/-Latest--RHCL-dev-portal-in-OCP?node-id=40-14335&m=draw)
- [developer-portal-controller repository](https://github.com/Kuadrant/developer-portal-controller)
- [kuadrant-backstage-plugin repository](https://github.com/Kuadrant/kuadrant-backstage-plugin)
