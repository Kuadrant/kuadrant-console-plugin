# Kuadrant Console Plugin Codebase Guide

## Overview

This is an OpenShift Console dynamic plugin for managing Kuadrant resources. It's built on top of the [console-plugin-template](https://github.com/openshift/console-plugin-template) but significantly extended with domain-specific functionality for gateway and policy management.

## Project Structure

```
kuadrant-console-plugin/
├── src/
│   ├── components/         # React components
│   │   ├── authpolicy/    # AuthPolicy components and types
│   │   ├── dnspolicy/     # DNSPolicy components and types
│   │   ├── gateway/       # Gateway components
│   │   ├── httproute/     # HTTPRoute components
│   │   ├── issuer/        # Certificate issuer components
│   │   ├── ratelimitpolicy/ # RateLimitPolicy components
│   │   ├── tlspolicy/     # TLSPolicy components
│   │   └── apimanagement/ # API Management portal components
│   ├── utils/             # Utility functions
│   └── constants/         # Configuration constants
├── charts/                # Helm chart for deployment
├── locales/              # i18n translation files
├── config/
│   ├── crd/              # Custom Resource Definitions
│   └── rbac/             # RBAC role definitions
└── docs/                 # Documentation and images
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
8. **APIProduct** (`extensions.kuadrant.io/v1alpha1`) - Published API catalog entries
9. **APIKeyRequest** (`extensions.kuadrant.io/v1alpha1`) - Consumer requests for API access

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
- **ApiManagementPage**: API catalog and access request management (see API Management section)

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

Currently limited testing infrastructure:
- TypeScript provides type safety
- Linting with ESLint and Stylelint
- i18n file consistency check via `test-frontend.sh`

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

## Contributing

When adding new features:
1. Follow existing component patterns
2. Add types for new resources
3. Update `console-extensions.json` for new routes
4. Add i18n keys for new strings
5. Test with a local OpenShift console instance

