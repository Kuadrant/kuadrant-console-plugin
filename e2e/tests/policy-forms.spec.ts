import { test, expect, Page } from '@playwright/test';
import { execSync } from 'child_process';
import { TEST_NAMESPACE, dismissConsoleTour } from './helpers';

// ── local helpers ──────────────────────────────────────────────────

let uidCounter = 0;
function uid(): string {
  return `${Date.now()}-${uidCounter++}`;
}
  
function kubectl(args: string[]): string {
  return execSync(`kubectl ${args.join(' ')}`, { encoding: 'utf-8' }).trim();
}

function applyManifest(yaml: string): void {
  execSync('kubectl apply -f -', { input: yaml, stdio: ['pipe', 'ignore', 'ignore'] });
}

function deleteNamespace(ns: string): void {
  execSync(`kubectl delete namespace ${ns} --ignore-not-found=true`, { stdio: 'ignore' });
}

function resourceExists(kind: string, name: string, ns: string): boolean {
  try {
    execSync(`kubectl get ${kind} ${name} -n ${ns}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function createPagePath(namespace: string, gvk: string): string {
  return `/k8s/ns/${namespace}/${gvk}/~new`;
}

// SPA navigation using pushState — preserves redux state
async function gotoPage(page: Page, path: string): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await dismissConsoleTour(page);

  // If the path contains a namespace, we should do a full page load there first
  // so that the console sets the activeNamespace correctly before SPA navigating
  const match = path.match(/\/k8s\/ns\/([^/]+)/);
  if (match) {
    await page.goto(`/k8s/ns/${match[1]}`);
    await page.waitForLoadState('networkidle');
  }

  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForLoadState('networkidle');
}

// Select an HTTPRoute from the PatternFly MenuToggle dropdown
async function selectHTTPRoute(page: Page, routeValue: string): Promise<void> {
  const toggle = page.locator('#httproute-select');
  await toggle.click();
  const menuItem = page.locator(`[role="menuitem"]:has-text("${routeValue}")`);
  await expect(menuItem).toBeVisible({ timeout: 15_000 });
  await menuItem.click();
}

// ── smoke test: update the outdated YAML editor test ──────────────

test.describe('other policy create pages render', () => {
  test('PlanPolicy create form renders with required fields', { tag: '@smoke' }, async ({ page }) => {
    await gotoPage(
      page,
      createPagePath(TEST_NAMESPACE, 'extensions.kuadrant.io~v1alpha1~PlanPolicy'),
    );

    await expect(page.getByRole('heading', { name: 'Create Plan Policy' })).toBeVisible({
      timeout: 15_000,
    });

    // form view is the default
    await expect(page.locator('#create-type-radio-form')).toBeChecked();

    await expect(page.locator('#policy-name')).toBeVisible();
    await expect(page.locator('#httproute-select')).toBeVisible();

    // at least one plan card should be present with tier and predicate fields
    await expect(page.locator('#plan-tier-0')).toBeVisible();
    await expect(page.locator('#plan-predicate-0')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });
});

// ── full PlanPolicy form test suite ───────────────────────────────

test.describe('PlanPolicy form', () => {
  test('create button enables only when required fields are set', { tag: '@smoke' }, async ({ page }) => {
    await gotoPage(
      page,
      createPagePath(TEST_NAMESPACE, 'extensions.kuadrant.io~v1alpha1~PlanPolicy'),
    );

    const createButton = page.getByRole('button', { name: 'Create', exact: true });
    await expect(createButton).toBeDisabled();

    await page.locator('#policy-name').fill(`e2e-plan-${uid()}`);
    await expect(createButton).toBeDisabled();

    // fixture HTTPRoute from e2e/manifests/test-resources.yaml (read-only use)
    await selectHTTPRoute(page, `${TEST_NAMESPACE}/test-route`);
    await expect(createButton).toBeDisabled();

    // tier is required
    await page.locator('#plan-tier-0').fill('gold');
    await expect(createButton).toBeDisabled();

    // predicate is required
    await page.locator('#plan-predicate-0').fill('auth.identity.tier == "gold"');
    await expect(createButton).toBeEnabled();

    // clearing a required field disables it again
    await page.locator('#plan-tier-0').fill('');
    await expect(createButton).toBeDisabled();
  });

  test.describe('with seeded namespace', () => {
    let namespace = '';
    let httproute = '';

    const httprouteManifest = (name: string, ns: string) => `
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: ${name}
  namespace: ${ns}
spec:
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /
`;

    test.beforeEach(async () => {
      namespace = `e2e-planp-${uid()}`;
      httproute = `e2e-route-${uid()}`;
      kubectl(['create', 'namespace', namespace]);
      applyManifest(httprouteManifest(httproute, namespace));
    });

    test.afterEach(async () => {
      deleteNamespace(namespace);
    });

    test('creates a PlanPolicy via the form', { tag: '@smoke' }, async ({ page }) => {
      const policyName = `e2e-plan-${uid()}`;
      await gotoPage(
        page,
        createPagePath(namespace, 'extensions.kuadrant.io~v1alpha1~PlanPolicy'),
      );

      await expect(page.getByRole('heading', { name: 'Create Plan Policy' })).toBeVisible({
        timeout: 15_000,
      });

      await page.locator('#policy-name').fill(policyName);

      await selectHTTPRoute(page, `${namespace}/${httproute}`);

      await page.locator('#plan-tier-0').fill('gold');
      await page.locator('#plan-predicate-0').fill(
        'has(auth.identity) && auth.identity.metadata.annotations["secret.kuadrant.io/plan-id"] == "gold"',
      );
      await page.locator('#plan-limit-0').fill('100');

      const createButton = page.getByRole('button', { name: 'Create', exact: true });
      await expect(createButton).toBeEnabled();
      await createButton.click();

      // successful creation redirects to the Plan tab of the policies page
      await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/plan`), {
        timeout: 15_000,
      });

      expect(resourceExists('planpolicy', policyName, namespace)).toBe(true);

      await expect(page.locator(`a[data-test="${policyName}"]`)).toBeVisible({
        timeout: 15_000,
      });
    });

    test('edits an existing PlanPolicy (name immutable, plan tier persisted)', { tag: '@smoke' }, async ({
      page,
    }) => {
      const policyName = `e2e-plan-${uid()}`;
      applyManifest(`
apiVersion: extensions.kuadrant.io/v1alpha1
kind: PlanPolicy
metadata:
  name: ${policyName}
  namespace: ${namespace}
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: ${httproute}
  plans:
  - tier: gold
    predicate: 'auth.identity.tier == "gold"'
    limits:
      daily: 100
`);

      await gotoPage(page, `/k8s/ns/${namespace}/planpolicy/name/${policyName}/edit`);

      await expect(page.getByRole('heading', { name: 'Edit Plan Policy' })).toBeVisible({
        timeout: 15_000,
      });

      // form prefilled from the existing resource; name is immutable
      const nameInput = page.locator('#policy-name');
      await expect(nameInput).toHaveValue(policyName, { timeout: 15_000 });
      await expect(nameInput).toBeDisabled();
      await expect(page.locator('#httproute-select')).toContainText(`${namespace}/${httproute}`);
      await expect(page.locator('#plan-tier-0')).toHaveValue('gold');
      await expect(page.locator('#plan-predicate-0')).toHaveValue('auth.identity.tier == "gold"');
      await expect(page.locator('#plan-limit-0')).toHaveValue('100');

      // update the daily limit
      await page.locator('#plan-limit-0').fill('200');

      const saveButton = page.getByRole('button', { name: 'Save', exact: true });
      await expect(saveButton).toBeEnabled();
      await saveButton.click();

      await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/plan`), {
        timeout: 15_000,
      });

      expect(
        kubectl([
          'get',
          'planpolicy',
          policyName,
          '-n',
          namespace,
          '-o',
          'jsonpath={.spec.plans[0].limits.daily}',
        ]),
      ).toBe('200');
    });

    test('add and remove plans dynamically', { tag: '@smoke' }, async ({ page }) => {
      await gotoPage(
        page,
        createPagePath(namespace, 'extensions.kuadrant.io~v1alpha1~PlanPolicy'),
      );

      // only one plan card initially, Remove Plan is disabled
      await expect(page.locator('#plan-tier-0')).toBeVisible();
      await expect(page.locator('#plan-tier-1')).not.toBeVisible();
      await expect(page.getByRole('button', { name: 'Remove Plan' }).first()).toBeDisabled();

      // add a second plan
      await page.getByRole('button', { name: 'Add Plan' }).click();
      await expect(page.locator('#plan-tier-1')).toBeVisible();

      // now both Remove Plan buttons are enabled
      await expect(page.getByRole('button', { name: 'Remove Plan' }).first()).toBeEnabled();

      // remove the second plan
      await page.getByRole('button', { name: 'Remove Plan' }).nth(1).click();
      await expect(page.locator('#plan-tier-1')).not.toBeVisible();

      // back to one plan — Remove Plan disabled again
      await expect(page.getByRole('button', { name: 'Remove Plan' }).first()).toBeDisabled();
    });
  });
});
