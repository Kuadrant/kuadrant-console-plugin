# Namespace-Scoped Overview Page

**Date:** 2026-03-27
**Issue:** [#298](https://github.com/Kuadrant/kuadrant-console-plugin/issues/298)
**Status:** Approved

## Problem Statement

The Overview page (`/kuadrant/overview`) was built with cluster-admin users in mind. It watches all resources cluster-wide using `#ALL_NS#`, which breaks for namespace-scoped users who lack cluster-level read permissions. These users see incomplete or missing data, especially in the gateway health cards.

**Current Issues:**
- Gateway health card watches gateways cluster-wide and shows no results for namespace-scoped users
- All ResourceList components hardcoded to `#ALL_NS#`
- RBAC checks incorrectly resolve to 'default' namespace even when viewing cluster-wide

## Solution Overview

Add namespace support to the Overview page using OpenShift's `NamespaceBar` component and URL-based routing, consistent with the existing Policies page pattern. The page will intelligently default to the appropriate view based on user permissions.

## Design

### Route Structure

Add two routes in `console-extensions.json`:

1. `/kuadrant/overview` - Cluster-wide view (stays here if user has cluster-wide permissions)
2. `/kuadrant/ns/:ns/overview` - Namespace-scoped view (redirects here if user lacks cluster-wide permissions)

### Smart Default Behavior

When a user first lands on `/kuadrant/overview`, the component will:

1. Perform RBAC check for cluster-wide Gateway list permission:
   ```typescript
   const clusterWideAllowed = await checkAccess({
     group: 'gateway.networking.k8s.io',
     resource: 'gateways',
     verb: 'list'
     // no namespace parameter = cluster-wide check
   });
   ```

2. Redirect based on permission:
   - If `allowed === true` → stay on `/kuadrant/overview` (cluster-wide view)
   - If `allowed === false` → redirect to `/kuadrant/ns/default/overview` (fallback namespace)

3. After initial redirect, respect URL parameter (no further redirects)
4. Users can switch to their accessible namespace via NamespaceBar dropdown

### UI Components

**NamespaceBar Integration:**
- Use OpenShift's `<NamespaceBar>` component (from `@openshift-console/dynamic-plugin-sdk`)
- Automatically filters namespaces based on user RBAC
- Shows "All namespaces" option only if user has cluster-wide permissions
- Handles namespace search and filtering

**Page Layout:**
```text
┌──────────────────────────────────────────────────────┐
│ [NamespaceBar - OpenShift built-in component]        │
├──────────────────────────────────────────────────────┤
│ Kuadrant Overview                                    │
│                                                      │
│ [Kuadrant CR Status Alert]                          │
│ [Getting Started Card - static, always visible]     │
│                                                      │
│ [Gateway Health Summary - respects namespace]       │
│ [Gateway Traffic Table - respects namespace]        │
│ [Policies Card - respects namespace]                │
│ [HTTPRoutes Card - respects namespace]              │
└──────────────────────────────────────────────────────┘
```

### Data Flow

```text
1. User navigates to /kuadrant/overview
   ↓
2. Check cluster-wide Gateway list permission
   ↓
3. Stay on /kuadrant/overview (if allowed)
   OR redirect to /kuadrant/ns/default/overview (if denied)
   ↓
4. NamespaceBar component displays, filtered by user's accessible namespaces
   ↓
5. Watch resources scoped to namespace from URL (ns param or activeNamespace)
   ↓
6. User changes namespace via NamespaceBar
   ↓
7. handleNamespaceChange updates URL to /kuadrant/ns/{namespace}/overview
   ↓
8. Component re-renders with new namespace, re-watches resources
```

### Implementation Details

#### KuadrantOverviewPage.tsx Changes

**1. Import NamespaceBar:**
```typescript
import { NamespaceBar } from '@openshift-console/dynamic-plugin-sdk';
```

**2. Read namespace from URL:**
```typescript
const { ns } = useParams<{ ns: string }>();
const navigate = useNavigate();
const location = useLocation();
```

**3. Smart default redirect:**
```typescript
React.useEffect(() => {
  const performRedirect = async () => {
    if (location.pathname === '/kuadrant/overview') {
      try {
        const result = await checkAccess({
          group: 'gateway.networking.k8s.io',
          resource: 'gateways',
          verb: 'list'
        });

        // If user doesn't have cluster-wide access, redirect to namespace-scoped view
        if (!result.status?.allowed) {
          const targetNamespace =
            activeNamespace && activeNamespace !== '#ALL_NS#' ? activeNamespace : 'default';
          navigate(`/kuadrant/ns/${targetNamespace}/overview`, { replace: true });
        }
        // Otherwise, stay on /kuadrant/overview (cluster-wide view)
      } catch (error) {
        // On error, redirect to namespace-scoped view
        const targetNamespace =
          activeNamespace && activeNamespace !== '#ALL_NS#' ? activeNamespace : 'default';
        navigate(`/kuadrant/ns/${targetNamespace}/overview`, { replace: true });
      }
    }
  };

  performRedirect();
}, [location.pathname, activeNamespace, navigate]);
```

**4. Determine namespace for watches:**
```typescript
// Read namespace from URL param or fall back to activeNamespace
const watchNamespace = ns || activeNamespace;
```

**5. Update resource watches:**

Replace all hardcoded `namespace="#ALL_NS#"` with `namespace={watchNamespace}`:

- Gateway watch - **Critical:** Use conditional to handle `#ALL_NS#`
  ```typescript
  const [gateways] = useK8sWatchResource<Gateway[]>({
    groupVersionKind: gvk,
    isList: true,
    namespace: watchNamespace === '#ALL_NS#' ? undefined : watchNamespace,
  });
  ```
- ResourceList for Gateways Traffic (line 910) - uses `namespace={watchNamespace}`
- ResourceList for Policies (line 1019) - uses `namespace={watchNamespace}`
- ResourceList for HTTPRoutes (line 1059) - uses `namespace={watchNamespace}`

**6. Add Prometheus metrics filtering:**

The gateway traffic metrics must also respect namespace selection. Use utility functions from `src/utils/metricsQueries.ts`:

```typescript
// Determine namespace for metrics filtering (undefined for cluster-wide)
const metricsNamespace = watchNamespace === '#ALL_NS#' ? undefined : watchNamespace;

// Build queries as memoized values to ensure proper re-fetching when namespace changes
const totalRequestsQuery = React.useMemo(
  () => buildTotalRequestsQuery(metricsNamespace),
  [metricsNamespace],
);

const totalErrorsQuery = React.useMemo(
  () => buildErrorRequestQuery(metricsNamespace),
  [metricsNamespace],
);

const totalErrorsByCodeQuery = React.useMemo(
  () => buildErrorsByCodeQuery(metricsNamespace),
  [metricsNamespace],
);
```

**Metrics query utilities** (in `src/utils/metricsQueries.ts`):
```typescript
const escapePromQLLabelValue = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const buildNamespaceFilter = (namespace?: string): string =>
  namespace ? `source_workload_namespace="${escapePromQLLabelValue(namespace)}"` : '';

export const buildTotalRequestsQuery = (namespace?: string): string => {
  const filter = buildNamespaceFilter(namespace);
  return filter
    ? `sum by (source_workload, source_workload_namespace) (increase(istio_requests_total{${filter}}[24h]))`
    : 'sum by (source_workload, source_workload_namespace) (increase(istio_requests_total[24h]))';
};
```

**Why memoization is critical:**
- `usePrometheusPoll` hook doesn't automatically re-poll when query string changes
- `React.useMemo` ensures new query object triggers re-execution
- Without memoization, switching namespaces won't update metrics

**7. Fix RBAC checks:**

Current (broken):
```typescript
const resolvedNamespace = activeNamespace === '#ALL_NS#' ? 'default' : activeNamespace;
```

New (correct):
```typescript
const resolvedNamespace = watchNamespace === '#ALL_NS#' ? undefined : watchNamespace;
```

**Why this matters:**
- `undefined` performs cluster-wide RBAC check
- `'default'` would only check permissions in the default namespace
- This was a critical bug fix

**8. Add NamespaceBar with callback:**
```typescript
const handleNamespaceChange = (newNamespace: string) => {
  if (newNamespace !== '#ALL_NS#') {
    navigate(`/kuadrant/ns/${newNamespace}/overview`, { replace: true });
  } else {
    navigate('/kuadrant/overview', { replace: true });
  }
};

return (
  <>
    <NamespaceBar onNamespaceChange={handleNamespaceChange} />
    <PageSection className="kuadrant-overview-page">
      {/* existing content */}
    </PageSection>
  </>
);
```

#### console-extensions.json Changes

**Add new routes:**
```json
{
  "type": "console.page/route",
  "properties": {
    "exact": true,
    "path": "/kuadrant/overview",
    "component": { "$codeRef": "KuadrantOverviewPage" }
  }
},
{
  "type": "console.page/route",
  "properties": {
    "exact": true,
    "path": "/kuadrant/ns/:ns/overview",
    "component": { "$codeRef": "KuadrantOverviewPage" }
  }
}
```

**Navigation links remain unchanged:**
```json
{
  "type": "console.navigation/href",
  "properties": {
    "id": "kuadrant-overview-admin",
    "name": "%plugin__kuadrant-console-plugin~Overview%",
    "href": "/kuadrant/overview",
    "perspective": "admin",
    "section": "kuadrant-section-admin"
  }
},
{
  "type": "console.navigation/href",
  "properties": {
    "id": "kuadrant-dashboard-dev",
    "name": "%plugin__kuadrant-console-plugin~Overview%",
    "href": "/kuadrant/overview",
    "perspective": "dev",
    "section": "kuadrant-section-dev"
  }
}
```

**Note:** Navigation links point to `/kuadrant/overview` which will redirect namespace-scoped users automatically. This is simpler than the original three-route design.

## User Experience

### Cluster-Admin User

1. Clicks "Overview" in navigation
2. Stays on `/kuadrant/overview`
3. Sees NamespaceBar with "All namespaces" selected
4. Sees cluster-wide gateway health, policies, routes, and traffic metrics
5. Can switch to specific namespace via NamespaceBar (URL updates to `/kuadrant/ns/{namespace}/overview`)

### Namespace-Scoped User (Single Namespace)

1. Clicks "Overview" in navigation
2. Redirects to `/kuadrant/ns/default/overview` (fallback namespace)
3. Sees "Access Denied" messages (no permissions in default namespace)
4. Uses NamespaceBar dropdown to switch to their accessible namespace (e.g., `kuadrant-test`)
5. URL updates to `/kuadrant/ns/kuadrant-test/overview`
6. Sees namespace-scoped data (gateways, policies, routes, and traffic metrics)
7. Cannot select "All namespaces" (option not shown due to lack of cluster-wide permissions)

### Namespace-Scoped User (Multi-Namespace)

1. Clicks "Overview" in navigation
2. Redirects to `/kuadrant/ns/default/overview` (fallback namespace) or `/kuadrant/ns/{activeNamespace}/overview` if already scoped
3. Sees NamespaceBar with accessible namespaces
4. Can switch between accessible namespaces via dropdown
5. Cannot select "All namespaces" (option not shown due to lack of cluster-wide permissions)

### Direct URL Access

Users can bookmark and share namespace-specific views:
- `/kuadrant/overview` - cluster-wide view (if permitted, otherwise redirects)
- `/kuadrant/ns/production/overview` - production namespace view
- `/kuadrant/ns/staging/overview` - staging namespace view

## Backward Compatibility

**Navigation Links:**
- Navigation links remain at `/kuadrant/overview` (smart redirect handles routing)
- Users with cluster-wide permissions stay on `/kuadrant/overview` (cluster-wide view)
- Namespace-scoped users get redirected to `/kuadrant/ns/default/overview`, then can switch to accessible namespace

**No Breaking Changes:**
- Cluster-admins see identical data by default (cluster-wide view on `/kuadrant/overview`)
- All existing functionality preserved
- No state/database migrations required
- Simpler routing structure than originally planned (2 routes instead of 3)

## Testing Scenarios

1. **Cluster-admin navigates to overview:**
   - Stays on `/kuadrant/overview`
   - NamespaceBar shows "All namespaces" + all accessible namespaces
   - All cards show cluster-wide data

2. **Namespace-scoped user navigates to overview:**
   - Redirects to `/kuadrant/ns/default/overview` (fallback)
   - NamespaceBar shows only accessible namespaces
   - User sees "Access Denied" initially (no permissions in default namespace)
   - User switches to accessible namespace (e.g., `kuadrant-test`) via NamespaceBar
   - URL updates to `/kuadrant/ns/kuadrant-test/overview`
   - Cards show namespace-scoped data

3. **User switches namespace:**
   - URL updates to `/kuadrant/ns/{new-namespace}/overview`
   - All resource watches re-execute with new namespace
   - Prometheus queries rebuild with new namespace filter
   - Cards refresh with new data (gateways, policies, routes, and traffic metrics)

4. **Direct URL access:**
   - Works as shareable link
   - No redirect on specific namespace URLs (e.g., `/kuadrant/ns/production/overview`)
   - Base URL `/kuadrant/overview` performs RBAC check and redirects namespace-scoped users

5. **Permission denied:**
   - Individual cards show "Access Denied" (existing behavior)
   - NamespaceBar automatically filters inaccessible namespaces
   - Cluster-wide users cannot access `/kuadrant/overview` with insufficient permissions

## Why This Approach

**Consistency:** Matches existing Policies page pattern (uses NamespaceBar + URL routing)

**Simplicity:**
- No custom namespace watching logic needed
- OpenShift SDK handles RBAC filtering automatically
- Minimal code changes
- Two routes instead of three (removed `/kuadrant/all-namespaces/overview`)
- No Project resource discovery required (reviewer feedback)

**Performance:**
- No upfront namespace discovery required
- NamespaceBar handles lazy loading
- Resource watches only for selected namespace
- Prometheus queries filtered by namespace (reduces metric cardinality and query time)
- Metrics query utilities with PromQL injection protection

**UX:**
- Standard OpenShift pattern (familiar to users)
- Shareable URLs
- Clear, predictable behavior
- Smart redirect based on RBAC
- Users can bookmark specific namespace views

**Implementation Notes:**
- Originally designed with three routes (`/overview`, `/all-namespaces/overview`, `/ns/:ns/overview`)
- Simplified to two routes during implementation per reviewer feedback
- Cluster-wide users stay on `/kuadrant/overview` instead of redirecting to separate `/all-namespaces` route
- Namespace-scoped users redirect to `'default'` fallback, then switch to accessible namespace via NamespaceBar
- This reduces complexity and maintains consistent URL structure with the rest of the console

## Alternatives Considered

### Multi-Namespace Selection
**Rejected because:**
- Adds significant complexity (watching multiple namespaces)
- Performance concerns with many namespaces
- Not supported by NamespaceBar component
- Not needed for Policies page, not needed here

### Custom Namespace Picker
**Rejected because:**
- Would require watching all Namespace resources
- Duplicate work (OpenShift SDK already provides this)
- Inconsistent with Policies page pattern

### No Namespace Picker (Global Console Picker Only)
**Rejected because:**
- Would require URL structure without namespace parameter
- Less clear separation between cluster-wide and namespace-scoped views
- No shareable URLs

## Success Criteria

✅ Namespace-scoped users can view Overview page without errors
✅ Gateway health card shows accurate data for selected namespace
✅ All resource lists respect namespace selection
✅ Prometheus traffic metrics filter by namespace (verified by result count changes)
✅ RBAC checks work correctly for both cluster-wide and namespace-scoped
✅ Cluster-admins see identical experience by default
✅ Consistent with Policies page UX pattern
✅ Build passes without errors
