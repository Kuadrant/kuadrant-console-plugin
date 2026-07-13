# Kuadrant Console Plugin Codebase Guide

## Overview

This is an OpenShift Console dynamic plugin for managing Kuadrant resources. It's built on top of the [console-plugin-template](https://github.com/openshift/console-plugin-template) but significantly extended with domain-specific functionality for gateway and policy management.

## Project Structure

```
kuadrant-console-plugin/
├── src/
│   ├── components/         # React components
│   │   ├── apikey/        # API Key request and approval components
│   │   ├── apiproduct/    # API Product catalog components
│   │   ├── dnspolicy/     # DNSPolicy components and types
│   │   ├── gateway/       # Gateway components
│   │   ├── httproute/     # HTTPRoute components
│   │   ├── issuer/        # Certificate issuer components
│   │   ├── ratelimitpolicy/ # RateLimitPolicy components
│   │   ├── tlspolicy/     # TLSPolicy components
│   │   └── topology/      # Topology visualization components
│   ├── hooks/             # Custom React hooks
│   │   └── topology/      # Topology-specific hooks
│   ├── utils/             # Utility functions
│   │   └── topology/      # Topology utilities and parsers
│   └── constants/         # Configuration constants
├── charts/                # Helm chart for deployment
├── locales/               # i18n translation files
├── config/
│   └── rbac/             # RBAC role definitions
├── e2e/                   # End-to-end Playwright tests
├── docs/                  # Documentation and images
└── scripts/               # Build and deployment scripts
```

## Key Technologies

- **React + TypeScript**: Core UI framework
- **PatternFly 6**: Red Hat's design system
- **OpenShift Console SDK**: Dynamic plugin integration
- **Kubernetes Client**: For resource management
- **webpack**: Build tooling
- **i18next**: Internationalisation

## Kuadrant Resources

The plugin manages these Custom Resource Definitions (CRDs):

### Gateway & Policy Resources
1. **AuthPolicy** (`kuadrant.io/v1`) - Authentication and authorisation policies
2. **RateLimitPolicy** (`kuadrant.io/v1`) - Rate limiting configurations
3. **DNSPolicy** (`kuadrant.io/v1`) - DNS management for gateways
4. **TLSPolicy** (`kuadrant.io/v1`) - TLS certificate configurations
5. **Gateway** (`gateway.networking.k8s.io/v1`) - Kubernetes Gateway API
6. **HTTPRoute** (`gateway.networking.k8s.io/v1`) - HTTP routing rules

### API Management Resources
7. **PlanPolicy** (`extensions.kuadrant.io/v1alpha1`) - Rate limiting plans with tiers
8. **APIProduct** (`devportal.kuadrant.io/v1alpha1`) - Published API catalog entries
9. **APIKeyRequest** (`devportal.kuadrant.io/v1alpha1`) - Consumer requests for API access
10. **APIKey** (`devportal.kuadrant.io/v1alpha1`) - API key credentials for consumers
11. **APIKeyApproval** (`devportal.kuadrant.io/v1alpha1`) - Approval records for API key requests

## Common Patterns

### 1. Resource Watching
```typescript
// use this pattern for real-time updates
const resource = {
  groupVersionKind: { group: 'kuadrant.io', version: 'v1', kind: 'AuthPolicy' },
  isList: true,
  namespace: activeNamespace
};
const [data, loaded, error] = useK8sWatchResource(resource);
```

### 2. Form Creation Pattern
All policy creation forms follow a similar structure:
- Toggle between Form and YAML views
- Form validation before submission
- Use `KuadrantCreateUpdate` component for save operations
- Redirect to list view after success

### 3. Error Handling
```typescript
const [errorAlertMsg, setErrorAlertMsg] = React.useState('');
try {
  await k8sCreate({ model, data: resource });
  history.push(redirectUrl);
} catch (error) {
  setErrorAlertMsg(error.message);
}
```

### 4. RBAC Checks
```typescript
const accessReviews = useAccessReviews(resourceAttributes);
const canRead = accessReviews[0];
```

### 5. Configuration

The plugin supports configurable Topology and Prometheus metrics for gateway traffic monitoring. This allows the console to work with different Gateway API implementations (OpenShift 4.19+, OSSM, etc.).

**Configuration is managed through:**
- `src/utils/configLoader.ts` - Configuration schema and defaults
- `src/utils/metricsQueries.ts` - Query utilities
- Environment variables in deployment manifests

**Example ENV Configuration:**
```yaml
TOPOLOGY_CONFIGMAP_NAME: "topology"
TOPOLOGY_CONFIGMAP_NAMESPACE: "kuadrant-system"
METRICS_WORKLOAD_SUFFIX: "-openshift-default"
```

## Key Components

- **KuadrantOverviewPage**: Main dashboard with gateway health status
- **PolicyTopologyPage**: Visual representation of gateway/route/policy relationships (refactored into modular components)
  - `CustomNode`: Renders topology nodes with icons and context menus
  - `ResourceFilterToolbar`: Manages resource type filtering
  - `TopologyControls`: Zoom/pan control buttons
  - `useVisualizationController`: Hook managing visualisation lifecycle
  - `useTopologyData`: Hook processing ConfigMap data into nodes/edges
  - `graphParser`: DOT string parsing and transitive edge preservation
- **ResourceList**: Generic component for displaying K8s resources
- **KuadrantCreateUpdate**: Handles create/update operations for all policy types
- **APIProductsListPage**: API product catalog browsing and management
- **APIProductCreatePage**: Form for creating/editing API products with metadata
- **APIProductOverviewTab**: Overview tab for API product details page
- **APIProductDefinitionTab**: Definition/OpenAPI spec tab for API product details
- **APIProductPoliciesTab**: Policies tab showing associated rate limit policies
- **APIProductAPIKeysTab**: API keys tab showing approved keys for the product
- **APIKeyApprovalPage**: Admin interface for reviewing and approving API key requests
- **MyAPIKeysPage**: User interface for requesting and managing API keys

## Policy Topology Architecture

The Policy Topology view is built on PatternFly React Topology and visualises relationships between Gateways, HTTPRoutes, and Kuadrant Policies.

### Key Design Decisions

**1. View State Preservation**
- `useTopologyData` distinguishes between three scenarios:
  - **Initial load**: Fit to screen
  - **Filter changes** (user interaction): Refit to screen to show newly visible nodes
  - **Data updates** (ConfigMap changes): **Preserve zoom/pan** to avoid jarring view resets
- This prevents the "odd shifting" behaviour where the user's focus would unexpectedly move during topology updates

**2. Resource Metadata Management**
- All resource metadata (GVK, plural names, `showInTopologyByDefault`) comes from the centralized `src/utils/resources.ts` registry
- Uses static registry instead of dynamic API discovery for instant controller creation
- Single source of truth prevents inconsistencies and reduces complexity

**3. Controller Lifecycle**
- `useVisualizationController` creates the controller once on mount using `useRef` with initialisation flag
- Controller is never recreated during the component lifecycle, preventing view resets
- Component factory and layout factory are registered once at creation time

**4. State Management**
- GVK mapping and selected resource types use React state (`useState`), not module-level variables
- Module-level object mutations don't trigger React re-renders, causing initialisation failures
- Always use state for values that affect rendering or hook dependencies

## Development Commands

```bash
# start development server
yarn start

# build for production
yarn build

# run linting
yarn lint

# build i18n files
yarn i18n

# start local OpenShift console
yarn start-console
```

## Testing

The project uses multiple testing approaches:
- **TypeScript**: Type safety and compile-time checks
- **ESLint & Stylelint**: Code quality and style enforcement
- **i18n validation**: Translation file consistency check via `test-frontend.sh`
- **Playwright E2E tests**: End-to-end browser testing for critical user flows

### E2E Testing

End-to-end tests are located in the `e2e/` directory and use Playwright:

```bash
# Run all e2e tests
yarn test:e2e

# Run a single test file
npx playwright test --config=e2e/playwright.config.ts e2e/tests/apikey-approvals.spec.ts

# Run a specific test by name (using grep filter)
npx playwright test --config=e2e/playwright.config.ts e2e/tests/apikey-approvals.spec.ts -g "reject request with reason shows success toast"

# Setup test environment
yarn test:e2e:setup

# Teardown test environment
yarn test:e2e:teardown
```

E2E tests cover key workflows including:
- API Product creation and management
- API Key request and approval flows
- Gateway and policy management
- Topology visualization

### E2E Test Tags

Every test must be tagged with exactly one of:

- **`@smoke`** — fast, critical path tests; run on every PR (~11 min total). Tag tests that cover the most important user flows and are reliable.
- **`@nightly`** — slower or edge-case tests; run on a nightly schedule. Tag validation edge cases, duplicate coverage, and slower flows.

```typescript
// smoke — runs on every PR
test('approve request', { tag: '@smoke' }, async ({ page }) => { ... })

// nightly — runs on schedule only
test('validate empty title shows error', { tag: '@nightly' }, async ({ page }) => { ... })
```

**Rules:**
- Every test must have exactly one tag (`@smoke` or `@nightly`) — untagged tests are skipped in smoke runs but do run in nightly (full suite has no `--grep` filter)
- When adding a new test, default to `@nightly`; only use `@smoke` for critical, reliable flows
- When adding a new spec file, add it to the mapping in `build/suite-router.sh` (see below)

### Suite Router (`build/suite-router.sh`)

The suite router maps changed source files to relevant e2e spec files so PRs only run tests for the components they touch.

**How it works:**
1. Runs `git diff origin/main...HEAD` to get the list of changed files
2. If any **shared file** changed (`src/utils/`, `src/hooks/`, `src/constants/`, `e2e/tests/helpers.ts`, workflow files, etc.) → runs all `@smoke` tests (safe fallback)
3. Otherwise, matches changed paths against `COMPONENT_MAP` → runs only the relevant spec files with `--grep @smoke`
4. If no mapping matches → runs all `@smoke` tests (safe fallback)

**Fallback behaviour:**

| Changed files | Tests run |
|---|---|
| `src/components/apikey/` | 3 apikey spec files × @smoke |
| `src/utils/` (shared) | all @smoke |
| Unrecognised path | all @smoke |

**When adding a new spec file**, add an `if` block in `build/suite-router.sh`:
```bash
if echo "$CHANGED" | grep -qE "^src/components/myfeature/"; then
  SPECS="$SPECS myfeature.spec.ts"
fi
```

If you forget, the suite router falls back to running all smoke tests — no tests will be skipped incorrectly, but the optimisation won't apply.

## Important Notes

1. **Real-time Updates**: Always use `useK8sWatchResource` instead of `k8sList` for resources that need to update automatically

2. **Gateway Health Logic**: A gateway is considered healthy when it has both:
   - `Accepted` condition with status `True`
   - `Programmed` condition with status `True`

3. **Form Validation**: Each policy type has specific validation rules in its form component

4. **Namespace Handling**: The plugin supports both single namespace and all-namespaces mode (#ALL_NS#)

5. **Downstream Builds**: Special tooling exists for Red Hat downstream builds (RHCL - Red Hat Connectivity Link)

## Code Style Guidelines

- Use PatternFly CSS variables (e.g., `var(--pf-v6-global--primary-color--100)`)
- Prefix custom CSS classes with plugin name to avoid conflicts
- Follow existing patterns for consistency
- Use the `useTranslation` hook for all user-facing strings
- Keep components focused and create sub-components when needed

### CSS Scoping Rules
**IMPORTANT**: Always scope CSS rules with kuadrant-specific prefixes to prevent bleeding into other parts of the console. Global selectors like `.ReactVirtualized__Table__rowColumn` or `.pf-*` classes should always be prefixed with a kuadrant container class (e.g., `.kuadrant-overview-page .ReactVirtualized__Table__rowColumn`). This is critical for plugin isolation and preventing unintended side effects on the host console or other plugins.

## Common Issues and Solutions

1. **Gateway counts not updating**: Ensure using `useK8sWatchResource` instead of one-time fetches
2. **Form validation failing**: Check that all required fields are properly validated
3. **RBAC errors**: Verify the user has appropriate permissions for the resource type
4. **Build errors**: Run `yarn clean` before building
5. **Page layout issues in console**: Don't wrap content in `Page` component - OpenShift console provides the page structure
6. **Topology view resetting on updates**: Preserve zoom/pan state by checking `isInitialLoad`
7. **Dark theme text visibility**: Use theme-aware CSS selectors (`.pf-theme-dark`, `.pf-v6-theme-dark`)
8. **Race conditions in React hooks**: Use `useRef` with initialisation flags to prevent re-creation of expensive objects
9. **Dynamic values in factory functions**: Pass getter functions instead of values to ensure current state is accessed
10. **Topology fit-to-screen not working**: Check for controller recreation due to changing dependencies
11. **Topology not rendering after refactor**: CRITICAL - GVK mapping must be stored in React state (`useState`), not module-level variables. Module-level object mutations don't trigger React re-renders, causing the controller to never initialize when the mapping is populated asynchronously

## PatternFly 6 Upgrade Notes

The plugin was upgraded from PatternFly 5 to PatternFly 6. Key changes include:

### Component Changes
- `Text/TextContent` replaced with `Content`
- `PageSection` variant only accepts "default" or "secondary" (not "light")
- `EmptyState` structure simplified (EmptyStateIcon removed, header moved to props)
- Modal imports moved from `@patternfly/react-core/deprecated` to `@patternfly/react-core`

### CSS Variable Updates
- `--pf-global--` → `--pf-v6-global--`
- `--pf-v5-` → `--pf-v6-`
- `.pf-v5-c-` → `.pf-v6-c-`

### Layout Patterns
- Don't use `Page` wrapper in plugin components - OpenShift console provides the page structure
- Use `PageSection` directly as the top-level component
- Removed unnecessary `Flex`/`FlexItem` wrappers around single items

### Dark Theme Support for Topology
To ensure text visibility in both light and dark themes:
- Use theme-specific CSS selectors (`.pf-theme-dark`, `.pf-v6-theme-dark`)
- Apply contrasting colours: white text (#ffffff) for dark theme, dark text (#151515) for light theme
- Policy nodes use light blue backgrounds with theme-appropriate opacity
- Always test components in both light and dark themes

## Planning New Work

When planning a new feature, enhancement, or significant change:

1. **Interview relentlessly**: Ask questions about every aspect of the plan until reaching a shared understanding with the user
2. **Walk the design tree**: Go down each branch of the design tree, resolving dependencies between decisions one-by-one
3. **Ask questions one at a time**: Don't overwhelm with multiple questions at once
4. **Provide recommendations**: For each question, provide a recommended answer based on codebase patterns
5. **Explore first**: If a question can be answered by exploring the codebase, do that instead of asking

This ensures alignment before implementation and prevents wasted effort on incorrect assumptions.

## Contributing

When adding new features:
1. Follow existing component patterns
2. Add types for new resources
3. Update `console-extensions.json` for new routes
4. Add i18n keys for new strings
5. Test with a local OpenShift console instance

