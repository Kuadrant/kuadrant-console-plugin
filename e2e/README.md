# E2E Tests

## Prerequisites

1. **oinc** (OpenShift in a Container) - creates local OpenShift cluster with console
2. **Playwright browsers** - for running the tests
3. **Kuadrant controller** - for API key approval and status updates

## Installation

### Install oinc
```bash
OINC_VERSION="v0.4.3"
curl -fL -o oinc "https://github.com/jasonmadigan/oinc/releases/download/${OINC_VERSION}/oinc-linux-amd64"
chmod +x oinc
./oinc version
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
npx playwright test --config=e2e/playwright.config.ts e2e/tests/apikey-lifecycle.spec.ts

# 6. Run only smoke tests
npx playwright test --config=e2e/playwright.config.ts --grep @smoke

# 7. Run only nightly tests
npx playwright test --config=e2e/playwright.config.ts --grep @nightly

# 8. Run with headed browser (visible UI)
npx playwright test --config=e2e/playwright.config.ts e2e/tests/apikey-lifecycle.spec.ts --headed

# 9. Run with debug mode
npx playwright test --config=e2e/playwright.config.ts e2e/tests/apikey-lifecycle.spec.ts --debug
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

See [Test Tags](#test-tags) and [CI Pipeline](#ci-pipeline) for how these are selected and filtered in CI.

## Test Tags 

Every test must be tagged with exactly one of `@smoke` or `@nightly`:

  ```typescript
  test('approve request', { tag: '@smoke' }, async ({ page }) => { ... })
  test('validate empty title shows error', { tag: '@nightly' }, async ({ page }) => { ... })
  ```

  | Tag | When it runs | What to tag |
  |---|---|---|
  | `@smoke` | Every PR (via suite router) | Critical-path flows that are fast and reliable |
  | `@nightly` | Daily at 02:00 UTC (full suite) | Edge cases, validation, slower flows, duplicate coverage, UI |

  **Rules:**
  - Every test must have exactly one tag — untagged tests are skipped during smoke runs
  - Default to `@nightly` when adding a new test; only use `@smoke` for critical, reliable flows

## CI Pipeline

  Three GitHub Actions workflows manage e2e testing:

  | Workflow | Trigger | What runs |
  |---|---|---|
  | `e2e.yaml` | PRs to `main`/`release-*` | Runs the suite router, then calls `e2e-common.yaml` with `suite: smoke` |
  | `e2e-nightly.yaml` | Cron daily at 02:00 UTC | Calls `e2e-common.yaml` with `suite: full` (all specs, all tags) |
  | `e2e-common.yaml` | Called by the above two | Reusable workflow that does the actual work (see below) |

### What `e2e-common.yaml` does

  1. Checks out the repo, sets up Node 22, installs `oinc` and Helm
  2. Runs `yarn install` and installs Playwright's Chromium
  3. Starts the plugin dev server (`yarn start`) in the background
  4. Runs `./e2e/setup.sh` — creates the oinc cluster with addons (gateway-api, cert-manager, MetalLB, Istio, Kuadrant), applies RBAC and test fixtures
  5. Waits up to 60s for the dev server to be ready
  6. Runs Playwright tests (see suite router below for how specs are selected)
  7. Uploads `playwright-report/` and `playwright-results.json` as artifacts
  8. Tears down the cluster

  On nightly failures, `e2e-nightly.yaml` automatically opens a GitHub issue with the
  failed test names extracted from `playwright-results.json`.

### Suite Router (`build/suite-router.sh`)

  The suite router optimises PR CI by running only the e2e specs relevant to changed
  files instead of the full suite. It diffs against `origin/main` and produces **two
  separate lists**:

  | Output | Contains | How it runs in CI |
  |---|---|---|
  | `specs` | Spec files mapped from changed **source** components | `--grep @smoke` (smoke tests only) |
  | `test_specs` | Spec files that were **directly edited** | No `--grep` filter (all tags run) |

  **Why two lists?** If you edited a test file, you want all its tests to run —
  including any `@nightly` tests you may have just written. But if you only touched
  source code, running `@smoke` is enough to validate nothing broke.

  Files that appear in both lists are removed from `specs` to avoid running them twice.

### Component mapping 
  
  The router maps source paths to spec files:

  | Changed path | Spec files triggered |
  |---|---|
  | `src/components/apikey/` | `apikey-lifecycle`, `apikey-approvals`, `apiproduct-apikeys-tab` |
  | `src/components/apiproduct/APIProductsListPage` | `api-product-list` |
  | `src/components/apiproduct/APIProductAPIKeysTab` | `apiproduct-apikeys-tab` |
  | `src/components/apiproduct/APIProductDefinitionTab` or `APIProductPoliciesTab` | `apiproduct-details-tabs` |
  | `src/components/apiproduct/APIProductOverviewTab`, `ContactInfoEdit`, etc. | `apiproduct-overview-tab` |
  | `src/components/apiproduct/` (catch-all) | `apiproduct-crud`, `apiproduct-overview-tab`, `api-product-list`, `apiproduct-rbac` |
  | `src/components/topology/` | `topology`, `rbac` |
  | `src/components/gateway/` | `gateway-crud`, `overview`, `rbac` |
  | `src/components/(dnspolicy\|tlspolicy\|ratelimitpolicy\|authpolicy)/` | `policy-forms`, `rbac` |
  | `src/components/(httproute\|issuer)/` | `rbac`, `httproute-crud` |
  | `src/components/NoPermissionsView` | `apiproduct-rbac`, `rbac` |

  **Shared-file fallback** — if any of these paths changed, the router outputs empty
  lists and CI falls back to running **all** `@smoke` tests:

  `src/utils/`, `src/hooks/`, `src/constants/`, `e2e/tests/helpers.ts`,
  `e2e/manifests/`, `e2e/setup.sh`, `e2e/teardown.sh`, `scripts/`, `package.json`,
  `yarn.lock`, `.github/workflows/`

  If nothing matches at all (unrecognised paths, no component mapping hit), it also
  falls back to the full smoke suite.

### Spec Map Check (`build/check-spec-map.sh`)

  This script verifies that every `*.spec.ts` file in `e2e/tests/` is referenced
  somewhere in `suite-router.sh`. It runs as a CI gate (the `check-spec-map` job in
  `e2e.yaml`) and locally via:

  ```bash
  yarn check:spec-map
  ```

  Prevents new spec files from silently dodging the suite router.

### Adding new components

  - Tag the test with exactly one of `@smoke` or `@nightly` (default to `@nightly`)
  - Add an `if` block in `build/suite-router.sh` mapping the relevant component
  - Run `yarn check:spec-map` to verify that the spec is referenced by `suite-router.sh`
  - Verify separately that the new component path matches the intended router mapping
  - Add the file to the [Test Files](#test-files) list above
  - **Run locally** to verify: `npx playwright test e2e/tests/your-file.spec.ts --config=e2e/playwright.config.ts`

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
6. CI may run the full smoke suite when:
  - The changed files do not match any `component-to-spec` mapping, which triggers the full smoke fallback
  - Modifications to shared modules (`src/utils/`, `src/hooks/`, `src/constants/`, etc.) trigger the full smoke fallback