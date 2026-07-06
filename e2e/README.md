# E2E Tests

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
sudo ./e2e/setup.sh

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

- `e2e/tests/apikey-lifecycle.spec.ts` - Full API key lifecycle (request, reveal, delete)
- `e2e/tests/apiproduct-crud.spec.ts` - API product CRUD operations
- `e2e/tests/api-product-list.spec.ts` - API product list page
- `e2e/tests/rbac.spec.ts` - RBAC permission tests

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
sudo ./e2e/teardown.sh

# Or destroy entire oinc cluster
oinc destroy
```

## Important Notes

1. **Always use `--config=e2e/playwright.config.ts`** when running tests manually
2. The Kuadrant controller must be running to approve API keys and populate status.discoveredPlans
3. Tests use automatic approval via payment-api (approvalMode: automatic)
4. Each test run creates unique resource names to avoid conflicts
5. Tests run with retries=1 (will retry once if failed)
