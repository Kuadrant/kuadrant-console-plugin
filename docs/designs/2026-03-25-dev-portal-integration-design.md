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
- Figma design: https://www.figma.com/design/nDsKwCU06OyhXH7bvOHxap/-Latest--RHCL-dev-portal-in-OCP?node-id=893-47728&m=draw
- Microcopy: https://docs.google.com/document/d/11iB4C68KV4LVzoEnOVTXzcc4qVDaAuAtF_inbpKZcOs/edit?tab=t.dj9d75n0gfxu
- Watch APIProduct resources using `useK8sWatchResource`
- Filter by namespace or all namespaces (#ALL_NS#)
- RBAC: All personas can view, filtered by access
- Columns: Name, Display Name, Namespace, HTTPRoute Target, Plans, Status, Actions
- Components: Empty state (PF6 EmptyState), Loading state (PF6 Spinner), Table with filters (PF6 Toolbar with filter), API product lifecycle status labels (PF6 filled labels: Draft, Published, Deprecated, Retired), Tag labels (PF6 outlined labels)

**APIProductDetailsPage** (#320):
- Figma design: https://www.figma.com/design/nDsKwCU06OyhXH7bvOHxap/-Latest--RHCL-dev-portal-in-OCP?node-id=893-47728&m=draw
- Microcopy: https://docs.google.com/document/d/11iB4C68KV4LVzoEnOVTXzcc4qVDaAuAtF_inbpKZcOs/edit?tab=t.dj9d75n0gfxu
- Tabbed view: Overview, YAML, Policies
- Overview tab: API product details, lifecycle status label (PF6 filled labels), simple list of properties (PF6 SimpleList), link buttons for adding spec/docs
- Policies tab: Show PlanPolicy tiers if attached, or RateLimitPolicy if no PlanPolicy; display AuthPolicy
- Publish/Unpublish action button (PF6 MenuToggle with custom icon)
- Display discovered plans from status.plans
- Show auth schemes from status.authSchemes
- Link to referenced HTTPRoute
- Status conditions display (Ready, Discovered)

**APIProductForm** (#321):
- Figma design: https://www.figma.com/design/nDsKwCU06OyhXH7bvOHxap/-Latest--RHCL-dev-portal-in-OCP?node-id=893-47728&m=draw
- Microcopy: https://docs.google.com/document/d/11iB4C68KV4LVzoEnOVTXzcc4qVDaAuAtF_inbpKZcOs/edit?tab=t.kyxh9rr7ffo4
- Form/YAML toggle (tab component)
- Auto-generated Kubernetes resource name from display name (editable)
- Fields: Display Name, Description, Tags (optional, PF6 Menu with search filtering), HTTPRoute selector (PF6 Menu with actions), Lifecycle status (PF6 context selector menu: Draft, Published, Deprecated, Retired - Retired disabled in create mode), Owner
- HTTPRoute policies: Display all policies attached to selected route including gateway-level policies (PF6 SimpleList)
- Validation: Ensure HTTPRoute exists before creation
- Edit mode: Resource name is read-only, show alert if API product is published
- Use `KuadrantCreateUpdate` component for save operations
- Show toast alert after create/update
- Redirect to detail view after success

#### 2. APIKey Components (`src/components/apikey/`)

**MyAPIKeysPage** (#317):
- Figma design: https://www.figma.com/design/nDsKwCU06OyhXH7bvOHxap/-Latest--RHCL-dev-portal-in-OCP?node-id=68-19935&t=F2Yvq6iI78uOWRoO-1
- Request modal design: https://www.figma.com/design/nDsKwCU06OyhXH7bvOHxap/-Latest--RHCL-dev-portal-in-OCP?node-id=514-22090&t=pZkUvO5i7wWS87B5-1
- Microcopy: https://docs.google.com/document/d/11iB4C68KV4LVzoEnOVTXzcc4qVDaAuAtF_inbpKZcOs/edit?tab=t.aoj7rlqap922
- UX Prototype: https://my-api-keys-ux-demo.vercel.app/
- User-scoped view showing only the requester's APIKeys
- Components: Empty state, Loading state, Collapsed/expanded list view
- Filter by status: Approved, Rejected, Pending
- Table columns: API Product, Plan (with tier tooltip), Status, Requested Date, Actions
- Rejected items only have "delete" action
- Reveal API key modal: Click mask area or eye icon to reveal, close button disabled until checkbox checked
- "Request Access" button opens modal form
- Request form fields:
  - API Product selector (search with autocomplete, max 3.x visible items)
  - Plan/tier selector (disabled until API selected, PF6 option single select menu)
  - API key name (validation: blank error, duplicate name error)
  - Use case/reason (text area)
- Edit/Delete modals: Edit requires approval for changes, delete requires typing API key name for confirmation
- Create APIKey resource on form submission

**APIKeyApprovalPage** (#318):
- Figma design: https://www.figma.com/design/nDsKwCU06OyhXH7bvOHxap/-Latest--RHCL-dev-portal-in-OCP?node-id=514-23096&t=gksvHbkczPbDoe9f-1
- Microcopy: https://docs.google.com/document/d/11iB4C68KV4LVzoEnOVTXzcc4qVDaAuAtF_inbpKZcOs/edit?tab=t.ulo6upsfhvma
- UX Prototype: https://api-key-approval-ux-demo.vercel.app/
- RBAC: Only visible to Owner and Admin personas
- Components: Empty state, Loading state, Table with checkboxes (PF6 table with checkboxes)
- List APIKeys in "Pending" phase for products the user owns
- Filter by API Product, requester, date
- Table columns: Requester, API Product, Plan, Use Case (truncated with tooltip), Date, Actions, Status (sorted descending: pending > approved > rejected)
- Table checkboxes for approved/rejected items are disabled
- No action menu for approved/rejected items
- Bulk selection: "Approve x selected" and "Reject x selected" buttons appear after bulk selection
- Approve modal: Single or bulk approval with compact table (max 4 entries visible, scrollable, fixed header)
- Reject modal: Single or bulk rejection, can remove items during process, modal closes when last item removed
- Update APIKey status on approval/rejection
- Controller creates Secret with actual key upon approval
- Toast notifications for approval/rejection actions

### Security Considerations

**RBAC Implementation** (#340):

> **Note**: RBAC model is pending further discussion. The three-persona model below is a starting point but may be refined.

Three personas aligned with Backstage plugin:
1. **Consumer**: Can view API Products, request API keys, view own keys
2. **Owner**: Can manage API Products they own, approve/reject access requests
3. **Admin**: Can manage all API Products, approve/reject all requests

**Kubernetes RBAC Mapping**:
```yaml
# Consumer role
- apiGroups: ["devportal.kuadrant.io"]
  resources: ["apiproducts"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["devportal.kuadrant.io"]
  resources: ["apikeys"]
  verbs: ["get", "list", "watch", "create"]
  # ResourceNames limited to user's own keys via webhook/controller

# Owner role (inherits Consumer + adds)
- apiGroups: ["devportal.kuadrant.io"]
  resources: ["apiproducts"]
  verbs: ["create", "update", "patch", "delete"]
  # Limited to products where metadata.owner matches user
- apiGroups: ["devportal.kuadrant.io"]
  resources: ["apikeys"]
  verbs: ["update", "patch"]
  # Limited to keys for owned products

# Admin role (inherits Owner + expands scope)
- apiGroups: ["devportal.kuadrant.io"]
  resources: ["apiproducts", "apikeys"]
  verbs: ["*"]
```

**Security Measures**:
- Double-confirmation modal for approve/reject actions to prevent accidental changes
- RBAC checks before rendering create/edit/approve buttons using `useAccessReviews`
- API key secrets only readable by the requester (enforced by controller)
- Audit logging of approval/rejection actions via Kubernetes events

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

## Execution

### Todo

- [ ] [RBAC for personas/users](https://github.com/Kuadrant/kuadrant-console-plugin/issues/340) **⏸️ BLOCKED: Pending RBAC model discussion**
  - [ ] Unit tests for persona role mapping
  - [ ] Integration tests for RBAC enforcement
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
