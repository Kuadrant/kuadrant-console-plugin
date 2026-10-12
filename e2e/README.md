# E2E Tests

## Test an installed Console plugin or RC

Use a dedicated OpenShift test cluster. The runner leaves fixtures, including
the `test-admin-kuadrant` RBAC grants, in place until you run teardown. Install
dependencies with `yarn install` and Chromium with
`npx playwright install chromium`.

The cluster needs an Accepted `istio` GatewayClass, working LoadBalancer
services, cert-manager, Kuadrant, and the Developer Portal controller and CRDs.
The active `oc` and `kubectl` contexts must point to the same cluster, and the
account running setup must be allowed to create the fixtures. The Console user
must be allowed to impersonate the test users.

`yarn test:e2e:installed` discovers the Console route for the active kubeconfig
context, prompts for Console credentials, applies fixtures when they are absent,
and runs Playwright against the installed plugin. It reuses fixtures only after
setup has marked them complete. It does not start a local plugin development
server or remove fixtures automatically.

```bash
yarn test:e2e:installed
yarn test:e2e:installed e2e/tests/overview.spec.ts
yarn test:e2e:installed --grep @smoke
E2E_USE_EXISTING_CLUSTER=true yarn test:e2e:teardown
```

For clusters with an untrusted Console HTTPS certificate and multiple login
providers, set both options:

```bash
E2E_IGNORE_HTTPS_ERRORS=true E2E_CONSOLE_IDENTITY_PROVIDER=HTPasswd yarn test:e2e:installed
```

`HTPasswd` is an example. Use the provider name shown on the selected cluster's
Console login page. For noninteractive runs, provide both
`E2E_CONSOLE_USERNAME` and `E2E_CONSOLE_PASSWORD`, or set
`PLAYWRIGHT_STORAGE_STATE` to an existing storage-state file. Supplied state is
left active and traces are disabled so reports do not retain its session
cookie. Runs using generated credentials log out after testing. `CONSOLE_URL`
overrides route discovery.

### Test this checkout against an existing cluster

Set `E2E_USE_EXISTING_CLUSTER=true` in each terminal used for setup,
`yarn start-console`, Playwright, and teardown. Prefix each command as needed:

```bash
E2E_USE_EXISTING_CLUSTER=true yarn test:e2e:setup
yarn start # separate terminal: plugin development server
E2E_USE_EXISTING_CLUSTER=true yarn start-console # another terminal
E2E_USE_EXISTING_CLUSTER=true yarn test:e2e
E2E_USE_EXISTING_CLUSTER=true yarn test:e2e:teardown
```

If setup stops partway, inspect the fixture namespaces and run teardown before
retrying. The installed-Console runner refuses to reuse incomplete or unowned
fixtures.

## Prerequisites

1. **oinc** (OpenShift in a Container) - creates local OpenShift cluster with console
2. **Playwright browsers** - for running the tests
3. **Kuadrant controller** - for API key approval and status updates

## Installation

### Install oinc
```bash
OINC_VERSION="v0.2.2"
curl -L -o oinc "https://github.com/jasonmadigan/oinc/releases/download/${OINC_VERSION}/oinc-linux-amd64"
chmod +x oinc
sudo mv oinc /usr/local/bin/
```

### Install Playwright browsers
```bash
npx playwright install chromium --with-deps
# If you get sudo errors, install without system deps:
npx playwright install chromium
```

## Running E2E Tests

### Full Setup (First Time)

```bash
# 1. Setup cluster with console, Kuadrant, and test fixtures
./e2e/setup.sh

# 2. Start the plugin development server (in another terminal or background)
yarn start

# 3. Wait for both servers to be ready
curl http://localhost:9000  # Console should respond
curl http://localhost:9001  # Plugin dev server should respond

# 4. Run all e2e tests
npx playwright test --config=e2e/playwright.config.ts

# 5. Run specific test file
npx playwright test e2e/tests/apikey-lifecycle.spec.ts --config=e2e/playwright.config.ts

# 6. Run with headed browser (visible UI)
npx playwright test e2e/tests/apikey-lifecycle.spec.ts --config=e2e/playwright.config.ts --headed

# 7. Run with debug mode
npx playwright test e2e/tests/apikey-lifecycle.spec.ts --config=e2e/playwright.config.ts --debug
```

### Quick Start (If Already Set Up)

```bash
# Check if cluster is running
oinc list

# Check if servers are running
curl http://localhost:9000  # Console
curl http://localhost:9001  # Plugin

# If not running, start plugin dev server
yarn start

# Run tests
npx playwright test --config=e2e/playwright.config.ts
```

## Test Files

- `e2e/tests/apikey-approvals.spec.ts` - API key request approval and rejection
- `e2e/tests/apikey-lifecycle.spec.ts` - Full API key lifecycle (request, reveal, delete)
- `e2e/tests/apiproduct-apikeys-tab.spec.ts` - API product API keys tab
- `e2e/tests/apiproduct-crud.spec.ts` - API product CRUD operations
- `e2e/tests/apiproduct-details-tabs.spec.ts` - API product details tabs
- `e2e/tests/apiproduct-overview-tab.spec.ts` - API product overview tab
- `e2e/tests/apiproduct-rbac.spec.ts` - API product RBAC
- `e2e/tests/api-product-list.spec.ts` - API product list page
- `e2e/tests/overview.spec.ts` - Overview dashboard cards, stats, and navigation
- `e2e/tests/policy-forms.spec.ts` - Policy creation forms (DNS, TLS, Auth, RateLimit, etc.)
- `e2e/tests/rbac.spec.ts` - RBAC permission tests
- `e2e/tests/topology.spec.ts` - Policy topology rendering, filtering, and navigation

PR CI runs the smoke subset listed in `.github/workflows/e2e-common.yaml`; the nightly
run executes every spec in `e2e/tests/`.

## Test Environment

- **Console URL**: http://localhost:9000 (created by oinc)
- **Plugin Dev Server**: http://localhost:9001 (created by yarn start)
- **Test Namespace**: kuadrant-test
- **Test Fixtures**:
  - `e2e/manifests/test-rbac.yaml` - Test users and permissions
  - `e2e/manifests/test-resources.yaml` - API products, PlanPolicy
  - `e2e/manifests/test-apiproduct-fixtures.yaml` - Additional API products

## Troubleshooting

### Tests fail with "Cannot navigate to invalid URL"
- Make sure you use `--config=e2e/playwright.config.ts`
- Check that console is running: `curl http://localhost:9000`

### Tests timeout looking for elements
- Check that plugin dev server is running: `curl http://localhost:9001`
- Check test screenshots in `test-results/` directory

### API key not approved automatically
- Check if Kuadrant controller is running:
  ```bash
  kubectl get pods -n kuadrant-system
  ```
- Check if payment-api has `discoveredPlans`:
  ```bash
  kubectl get apiproduct payment-api -n kuadrant-test -o jsonpath='{.status.discoveredPlans}'
  ```

### View test results
```bash
# Open HTML report
npx playwright show-report

# View screenshots
ls -la test-results/*/test-failed-*.png
```

## Cleanup

```bash
# Teardown test environment
./e2e/teardown.sh

# Or destroy entire oinc cluster
oinc destroy
```

## Important Notes

1. **Always use `--config=e2e/playwright.config.ts`** when running tests manually
2. The Kuadrant controller must be running to approve API keys and populate status.discoveredPlans
3. Tests use automatic approval via payment-api (approvalMode: automatic)
4. Each test run creates unique resource names to avoid conflicts
5. Tests run with retries=1 (will retry once if failed)
