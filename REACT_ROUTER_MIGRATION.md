# React Router v6/v7 Migration Plan

> [!IMPORTANT]
> This document is intended to guide incremental migration and should be executed in small, reviewable PRs.

This document outlines the detailed upgrade path to migrate the Kuadrant Console Plugin from the `react-router-dom-v5-compat` layer to the native React Router v6/v7 routing architecture.

## 1. Current State
- The plugin uses `react-router-dom-v5-compat` to bridge old React Router v5 usage with v6.
- All navigation hooks (`useNavigate`, `useParams`, `useLocation`) are already imported from the compat layer.
- Routes still rely on the compatibility layer.

## 2. Target State
- Completely replace the compatibility package with native `react-router-dom` v6/v7.
- Migrate to use the new `<Routes>` and `element` API.
- Remove `react-router-dom-v5-compat` from `package.json`.

## 3. Step-by-Step Transition Plan

### Phase 1: Audit & Identify
- Audit all files for any lingering v5 imports or usage.
- Ensure exact alignment across exposed components.

### Phase 2: Migrate Route Definitions
- Transition root route definitions to the native `<Routes>` component.
- Switch the `component` and `render` props to use the `element` prop.

### Phase 3: Update Navigation & Context
- Transition the `NavigateFunction` and hooks directly to the native `react-router-dom` package.

### Phase 4: Remove Compat Layer
- Remove the dependency from `package.json`.
- Perform full validation and end-to-end routing testing.

## 4. Candidate Areas for Migration
- `src/components/DropdownWithKebab.tsx` (Update navigation logic)
- `src/components/*Page.tsx` (Transition route usage)
- `console-extensions.json` (Update route definitions)

## 5. Risks & Mitigation
- **Navigation breakage:** Incorrect route migration can break user workflows. Mitigate by doing phased changes.
- **Inconsistent behavior:** Partial migration may lead to unexpected routing. Mitigate via comprehensive testing.
- **Integration issues:** Changes need validation against OpenShift console dynamic plugin context.

## 6. Suggested First Step
- Migrate a single low-risk route from compat to native v6 to validate the approach before broader changes.

## 7. Example Migration Diff

### Before:
```tsx
import { Switch, Route } from 'react-router-dom';

<Switch>
  <Route path="/example" component={ExamplePage} />
</Switch>
```

### After:
```tsx
import { Routes, Route } from 'react-router-dom';

<Routes>
  <Route path="/example" element={<ExamplePage />} />
</Routes>
```
