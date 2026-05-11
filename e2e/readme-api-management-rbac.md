# API Management RBAC Testing Guide

This guide explains how to test the different RBAC personas for API Management features in the Kuadrant console plugin.

## Overview

The API Management RBAC system has three main personas:

1. **Consumer** - Developers who browse APIs and request access via API keys
2. **Owner** - API owners who publish APIProducts and approve access requests  
3. **Admin** - Platform administrators with full access for troubleshooting

## Test Setup

### Prerequisites

- Running OpenShift cluster with the console
- Kuadrant operator installed
- Developer Portal controller installed (for CRDs)

### Install RBAC Test Personas

```bash
# From the project root
yarn test:e2e:setup
```

This creates test users with the following permissions:

| User | Persona | Permissions |
|------|---------|-------------|
| `test-consumer` | Consumer | Read APIProducts, CRUD APIKeys |
| `test-owner` | Owner | CRUD APIProducts, manage APIKeyApprovals/Requests |
| `test-admin` | Admin | Full access to all API Management resources |
| `test-dev` | None | No API Management permissions (baseline) |
| `test-viewer` | None | Read-only policies, no API Management |

## Manual Testing (Browser)

1. **Start the console:**
   ```bash
   yarn start-console
   ```

2. **Open http://localhost:9000 in your browser**

3. **Impersonate a test user:**
   - Click user dropdown (top right) → "Impersonate User"
   - Enter username: `test-consumer`, `test-owner`, or `test-admin`
   - Submit

4. **Navigate to API Management pages and verify permissions:**
   - `/kuadrant/ns/kuadrant-test/apiproducts` - API Products list
   - `/kuadrant/ns/kuadrant-test/apikeys` - API Keys (consumer view)
   - `/kuadrant/ns/kuadrant-test/apikey-approvals` - Approval workflow (owner view)
   - `/kuadrant/ns/kuadrant-test/apikey-requests` - Request queue (owner view)

5. **Stop impersonation:**
   - Click "Stop impersonating" in the blue banner at the top

### Expected Behaviors by Persona

#### Consumer (`test-consumer`)
✅ Can view APIProducts list  
✅ Can view their API Keys page  
❌ Cannot access approval workflows  
❌ Cannot view API Key requests queue  

#### Owner (`test-owner`)
✅ Can view APIProducts list  
✅ Can approve/reject API Keys  
✅ Can view API Key requests  
❌ Cannot view consumer API Keys directly  

#### Admin (`test-admin`)
✅ Full access to all pages  
✅ Can troubleshoot any persona's resources  

#### No Permissions (`test-dev`, `test-viewer`)
❌ All API Management pages show "You do not have permission" message  

## Automated E2E Tests

### Run All API Management RBAC Tests

```bash
yarn test:e2e --grep "API Management RBAC"
```

### Run Specific Persona Tests

```bash
# Consumer tests only
yarn test:e2e --grep "Consumer Persona"

# Owner tests only
yarn test:e2e --grep "Owner Persona"

# Admin tests only  
yarn test:e2e --grep "Admin User"

# No-permission tests (baseline)
yarn test:e2e --grep "No Permissions"
```

### Test Structure

The E2E tests are in `e2e/tests/api-management-rbac.spec.ts` and cover:

1. **Permission gates** - Verify correct users see content, others see permission errors
2. **Loading states** - Ensure RBAC checks complete before showing content
3. **Detail pages** - Test permission checks on nested routes (APIProduct tabs)

Each test suite:
- Impersonates the appropriate user
- Navigates to a page using SPA navigation (preserves impersonation state)
- Waits for RBAC permission checks to complete
- Verifies expected content or permission error is shown
- Stops impersonation after the test

## RBAC Permission Matrix

Based on `e2e/manifests/api-management-rbac.yaml`:

### Consumer Permissions (Namespace-scoped)
```yaml
- apiGroups: ["extensions.kuadrant.io"]
  resources: ["apiproducts"]
  verbs: ["get", "list"]
- apiGroups: ["devportal.kuadrant.io"]
  resources: ["apikeys"]
  verbs: ["get", "list", "create", "update", "delete"]
```

### Owner Permissions (Namespace-scoped)
```yaml
- apiGroups: ["extensions.kuadrant.io"]
  resources: ["apiproducts"]
  verbs: ["get", "list", "create", "update", "delete"]
- apiGroups: ["devportal.kuadrant.io"]
  resources: ["apikeyapprovals", "apikeyrequests"]
  verbs: ["get", "list", "create", "update", "delete"]
```

### Admin Permissions (Cluster-wide)
```yaml
- apiGroups: ["extensions.kuadrant.io"]
  resources: ["apiproducts"]
  verbs: ["get", "list", "create", "update", "delete"]
- apiGroups: ["devportal.kuadrant.io"]
  resources: ["apikeys", "apikeyapprovals", "apikeyrequests"]
  verbs: ["get", "list", "create", "update", "delete"]
```

## Troubleshooting

### Tests failing with "permission denied"
- Check test user RBAC is installed: `kubectl get role test-consumer -n kuadrant-test`
- Verify CRDs exist: `kubectl get crd apiproducts.extensions.kuadrant.io`

### Impersonation not working
- Ensure you're using SPA navigation (`spaNavigate()` helper) not `page.goto()`
- Full page reloads destroy impersonation state

### Permission checks never complete
- Check browser console for errors
- Verify `useAPIManagementRBAC` hook is being called in the component

## Adding New Personas

To add a new test persona:

1. Add RBAC role/binding to `e2e/manifests/api-management-rbac.yaml`
2. Add test suite to `e2e/tests/api-management-rbac.spec.ts`
3. Run `yarn test:e2e:setup` to apply new RBAC
4. Test manually and via E2E

## Related Files

- `e2e/manifests/api-management-rbac.yaml` - RBAC role definitions
- `e2e/manifests/test-rbac.yaml` - Base policy RBAC (extended by API Management)
- `e2e/tests/api-management-rbac.spec.ts` - E2E tests
- `e2e/tests/helpers.ts` - Impersonation and navigation helpers
- `src/utils/apiManagementRBAC.tsx` - Frontend RBAC hook
