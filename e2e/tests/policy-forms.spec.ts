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
import { execFileSync } from 'child_process';
import { TEST_NAMESPACE, dismissConsoleTour } from './helpers';

// unique suffix per call so parallel workers and repeated runs never collide
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function kubectl(args: string[], input?: string): string {
  return execFileSync('kubectl', args, {
    encoding: 'utf-8',
    ...(input !== undefined ? { input } : {}),
  }).trim();
}

function applyManifest(manifest: string): void {
  kubectl(['apply', '-f', '-'], manifest);
}

function resourceExists(kind: string, name: string, namespace: string): boolean {
  return kubectl(['get', kind, name, '-n', namespace, '--ignore-not-found', '-o', 'name']) !== '';
}

function deleteNamespace(namespace: string): void {
  if (namespace) {
    try {
      kubectl(['delete', 'namespace', namespace, '--ignore-not-found', '--wait=false']);
    } catch (error) {
      // cleanup failure must not fail the test from afterEach
      console.error(`Failed to delete namespace ${namespace}:`, error);
    }
  }
}

const gatewayManifest = (name: string, namespace: string) => `
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: ${name}
  namespace: ${namespace}
spec:
  gatewayClassName: istio
  listeners:
  - name: http
    port: 80
    protocol: HTTP
    allowedRoutes:
      namespaces:
        from: Same
`;

// full page navigation so the console derives the active namespace from the
// URL (pushState does not update the console's namespace state)
async function gotoPage(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await dismissConsoleTour(page);
}

const createPagePath = (namespace: string, gvk: string) => `/k8s/ns/${namespace}/${gvk}/~new`;

test.describe('DNSPolicy form', () => {
  test('create form renders with required fields', { tag: '@smoke' }, async ({ page }) => {
    await gotoPage(page, createPagePath(TEST_NAMESPACE, 'kuadrant.io~v1~DNSPolicy'));

    await expect(page.getByRole('heading', { name: 'Create DNS Policy' })).toBeVisible({
      timeout: 15_000,
    });

    // form view is the default
    await expect(page.locator('#create-type-radio-form')).toBeChecked();

    await expect(page.locator('#policy-name')).toBeVisible();
    await expect(page.locator('#httproute-select')).toBeVisible();

    // at least one plan card should be present with tier and predicate fields
    await expect(page.locator('#plan-tier-0')).toBeVisible();
    await expect(page.locator('#plan-predicate-0')).toBeVisible();
    await expect(page.locator('#gateway-select')).toBeVisible();
    await expect(page.locator('#provider-ref')).toBeVisible();

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

  test('create button enables only when required fields are set', { tag: '@smoke' }, async ({ page }) => {
    await gotoPage(page, createPagePath(TEST_NAMESPACE, 'kuadrant.io~v1~DNSPolicy'));

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
    await page.locator('#policy-name').fill(`e2e-dns-${uid()}`);
    await expect(createButton).toBeDisabled();

    // fixture gateway from e2e/manifests/test-resources.yaml (read-only use)
    const gatewayOption = page.locator(
      `#gateway-select option[value="${TEST_NAMESPACE}/test-gateway"]`,
    );
    await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
    await page.locator('#gateway-select').selectOption(`${TEST_NAMESPACE}/test-gateway`);
    await expect(createButton).toBeDisabled();

    await page.locator('#provider-ref').fill('e2e-provider-secret');
    await expect(createButton).toBeEnabled();

    // clearing a required field disables it again
    await page.locator('#policy-name').fill('');
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
    let gateway = '';

    test.beforeEach(async () => {
      namespace = `e2e-dnsp-${uid()}`;
      gateway = `e2e-gw-${uid()}`;
      kubectl(['create', 'namespace', namespace]);
      applyManifest(gatewayManifest(gateway, namespace));
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
    test('creates a DNSPolicy via the form', { tag: '@smoke' }, async ({ page }) => {
      const policyName = `e2e-dns-${uid()}`;
      await gotoPage(page, createPagePath(namespace, 'kuadrant.io~v1~DNSPolicy'));

      await expect(page.getByRole('heading', { name: 'Create DNS Policy' })).toBeVisible({
        timeout: 15_000,
      });

      await page.locator('#policy-name').fill(policyName);

      await selectHTTPRoute(page, `${namespace}/${httproute}`);

      await page.locator('#plan-tier-0').fill('gold');
      await page.locator('#plan-predicate-0').fill(
        'has(auth.identity) && auth.identity.metadata.annotations["secret.kuadrant.io/plan-id"] == "gold"',
      );
      await page.locator('#plan-limit-0').fill('100');
      const gatewayOption = page.locator(`#gateway-select option[value="${namespace}/${gateway}"]`);
      await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
      await page.locator('#gateway-select').selectOption(`${namespace}/${gateway}`);

      await page.locator('#provider-ref').fill('e2e-provider-secret');

      const createButton = page.getByRole('button', { name: 'Create', exact: true });
      await expect(createButton).toBeEnabled();
      await createButton.click();

      // successful creation redirects to the Plan tab of the policies page
      await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/plan`), {
        timeout: 15_000,
      });

      expect(resourceExists('planpolicy', policyName, namespace)).toBe(true);

      // successful creation redirects to the DNS tab of the policies page
      await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/dns`), {
        timeout: 15_000,
      });

      expect(resourceExists('dnspolicy', policyName, namespace)).toBe(true);

      // created policy appears in the list
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
    test('edits an existing DNSPolicy (name immutable, provider ref persisted)', { tag: '@smoke' }, async ({
      page,
    }) => {
      const policyName = `e2e-dns-${uid()}`;
      applyManifest(`
apiVersion: kuadrant.io/v1
kind: DNSPolicy
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
    kind: Gateway
    name: ${gateway}
  providerRefs:
  - name: e2e-provider-a
`);

      await gotoPage(page, `/k8s/ns/${namespace}/dnspolicy/name/${policyName}/edit`);

      await expect(page.getByRole('heading', { name: 'Edit DNS Policy' })).toBeVisible({
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
      await expect(page.locator('#gateway-select')).toHaveValue(`${namespace}/${gateway}`);
      await expect(page.locator('#provider-ref')).toHaveValue('e2e-provider-a');

      await page.locator('#provider-ref').fill('e2e-provider-b');

      const saveButton = page.getByRole('button', { name: 'Save', exact: true });
      await expect(saveButton).toBeEnabled();
      await saveButton.click();

      await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/plan`), {
      await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/dns`), {
        timeout: 15_000,
      });

      expect(
        kubectl([
          'get',
          'planpolicy',
          'dnspolicy',
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
          'jsonpath={.spec.providerRefs[0].name}',
        ]),
      ).toBe('e2e-provider-b');
    });
  });
});

test.describe('TLSPolicy form', () => {
  test('create form renders with required fields', { tag: '@smoke' }, async ({ page }) => {
    await gotoPage(page, createPagePath(TEST_NAMESPACE, 'kuadrant.io~v1~TLSPolicy'));

    await expect(page.getByRole('heading', { name: 'Create TLS Policy' })).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.locator('#simple-form-policy-name-01')).toBeVisible();
    await expect(page.locator('#gateway-select')).toBeVisible();

    // cluster issuer is the default issuer type
    await expect(page.locator('#cluster-issuer')).toBeChecked();
    await expect(page.locator('#clusterissuer-select')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('create button enables only when required fields are set', { tag: '@smoke' }, async ({ page }) => {
    await gotoPage(page, createPagePath(TEST_NAMESPACE, 'kuadrant.io~v1~TLSPolicy'));

    const createButton = page.getByRole('button', { name: 'Create', exact: true });
    await expect(createButton).toBeDisabled();

    await page.locator('#simple-form-policy-name-01').fill(`e2e-tls-${uid()}`);
    await expect(createButton).toBeDisabled();

    const gatewayOption = page.locator(
      `#gateway-select option[value="${TEST_NAMESPACE}/test-gateway"]`,
    );
    await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
    await page.locator('#gateway-select').selectOption(`${TEST_NAMESPACE}/test-gateway`);
    await expect(createButton).toBeDisabled();

    // fixture ClusterIssuer from e2e/manifests/test-resources.yaml (read-only use)
    const issuerOption = page.locator('#clusterissuer-select option[value="test-selfsigned"]');
    await expect(issuerOption).toBeAttached({ timeout: 15_000 });
    await page.locator('#clusterissuer-select').selectOption('test-selfsigned');
    await expect(createButton).toBeEnabled();
  });

  test.describe('with seeded namespace', () => {
    let namespace = '';
    let gateway = '';

    test.beforeEach(async () => {
      namespace = `e2e-tlsp-${uid()}`;
      gateway = `e2e-gw-${uid()}`;
      kubectl(['create', 'namespace', namespace]);
      applyManifest(gatewayManifest(gateway, namespace));
    });

    test.afterEach(async () => {
      deleteNamespace(namespace);
    });

    test('creates a TLSPolicy via the form', { tag: '@smoke' }, async ({ page }) => {
      const policyName = `e2e-tls-${uid()}`;
      await gotoPage(page, createPagePath(namespace, 'kuadrant.io~v1~TLSPolicy'));

      await expect(page.getByRole('heading', { name: 'Create TLS Policy' })).toBeVisible({
        timeout: 15_000,
      });

      await page.locator('#simple-form-policy-name-01').fill(policyName);

      const gatewayOption = page.locator(`#gateway-select option[value="${namespace}/${gateway}"]`);
      await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
      await page.locator('#gateway-select').selectOption(`${namespace}/${gateway}`);

      const issuerOption = page.locator('#clusterissuer-select option[value="test-selfsigned"]');
      await expect(issuerOption).toBeAttached({ timeout: 15_000 });
      await page.locator('#clusterissuer-select').selectOption('test-selfsigned');

      const createButton = page.getByRole('button', { name: 'Create', exact: true });
      await expect(createButton).toBeEnabled();
      await createButton.click();

      await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/tls`), {
        timeout: 15_000,
      });

      expect(resourceExists('tlspolicy', policyName, namespace)).toBe(true);
      expect(
        kubectl([
          'get',
          'tlspolicy',
          policyName,
          '-n',
          namespace,
          '-o',
          'jsonpath={.spec.issuerRef.name}',
        ]),
      ).toBe('test-selfsigned');
    });

    test('edits an existing TLSPolicy (retarget gateway persisted)', { tag: '@smoke' }, async ({ page }) => {
      const policyName = `e2e-tls-${uid()}`;
      const secondGateway = `e2e-gw-b-${uid()}`;
      applyManifest(gatewayManifest(secondGateway, namespace));
      applyManifest(`
apiVersion: kuadrant.io/v1
kind: TLSPolicy
metadata:
  name: ${policyName}
  namespace: ${namespace}
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: Gateway
    name: ${gateway}
  issuerRef:
    name: test-selfsigned
    kind: ClusterIssuer
`);

      await gotoPage(page, `/k8s/ns/${namespace}/tlspolicy/name/${policyName}/edit`);

      await expect(page.getByRole('heading', { name: 'Edit TLS Policy' })).toBeVisible({
        timeout: 15_000,
      });

      const nameInput = page.locator('#simple-form-policy-name-01');
      await expect(nameInput).toHaveValue(policyName, { timeout: 15_000 });
      await expect(nameInput).toBeDisabled();
      await expect(page.locator('#gateway-select')).toHaveValue(`${namespace}/${gateway}`);

      const secondGatewayOption = page.locator(
        `#gateway-select option[value="${namespace}/${secondGateway}"]`,
      );
      await expect(secondGatewayOption).toBeAttached({ timeout: 15_000 });
      await page.locator('#gateway-select').selectOption(`${namespace}/${secondGateway}`);

      const saveButton = page.getByRole('button', { name: 'Save', exact: true });
      await expect(saveButton).toBeEnabled();
      await saveButton.click();

      await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/tls`), {
        timeout: 15_000,
      });

      expect(
        kubectl([
          'get',
          'tlspolicy',
          policyName,
          '-n',
          namespace,
          '-o',
          'jsonpath={.spec.targetRef.name}',
        ]),
      ).toBe(secondGateway);
    });
  });
});

// AuthPolicy and RateLimitPolicy create pages are YAML-editor only, prefilled
// with an example resource. Creating with the default YAML uses the example
// name, so each creation test runs in its own namespace for isolation.
test.describe('YAML-based policy create pages', () => {
  // wait for the monaco editor to render the given text
  async function expectEditorContains(page: Page, text: string): Promise<void> {
    await page.waitForSelector('.monaco-editor .view-lines', {
      state: 'visible',
      timeout: 15_000,
    });
    await page.waitForFunction(
      (expected) => {
        const lines = document.querySelector('.monaco-editor .view-lines');
        return (lines?.textContent || '').includes(expected);
      },
      text,
      { timeout: 15_000 },
    );
  }

  test('AuthPolicy create page renders YAML editor with example resource', { tag: '@smoke' }, async ({ page }) => {
    await gotoPage(page, createPagePath(TEST_NAMESPACE, 'kuadrant.io~v1~AuthPolicy'));

    await expect(page.locator('text=Create AuthPolicy').first()).toBeVisible({ timeout: 15_000 });
    await expectEditorContains(page, 'example-authpolicy');
    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('RateLimitPolicy create page renders YAML editor with example resource', { tag: '@smoke' }, async ({
    page,
  }) => {
    await gotoPage(page, createPagePath(TEST_NAMESPACE, 'kuadrant.io~v1~RateLimitPolicy'));

    await expect(page.locator('text=Create RateLimit Policy').first()).toBeVisible({
      timeout: 15_000,
    });
    await expectEditorContains(page, 'example-ratelimitpolicy');
    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeVisible();
  });

  test.describe('with seeded namespace', () => {
    let namespace = '';

    test.beforeEach(async () => {
      namespace = `e2e-yamlp-${uid()}`;
      kubectl(['create', 'namespace', namespace]);
    });

    test.afterEach(async () => {
      deleteNamespace(namespace);
    });

    test('creates an AuthPolicy from the default YAML', { tag: '@smoke' }, async ({ page }) => {
      await gotoPage(page, createPagePath(namespace, 'kuadrant.io~v1~AuthPolicy'));

      await expect(page.locator('text=Create AuthPolicy').first()).toBeVisible({
        timeout: 15_000,
      });
      // active namespace propagated from the URL into the example resource
      await expectEditorContains(page, namespace);

      await page.getByRole('button', { name: 'Create', exact: true }).click();

      await expect
        .poll(() => resourceExists('authpolicy', 'example-authpolicy', namespace), {
          timeout: 15_000,
        })
        .toBe(true);
    });

    test('creates a RateLimitPolicy from the default YAML', { tag: '@smoke' }, async ({ page }) => {
      await gotoPage(page, createPagePath(namespace, 'kuadrant.io~v1~RateLimitPolicy'));

      await expect(page.locator('text=Create RateLimit Policy').first()).toBeVisible({
        timeout: 15_000,
      });
      await expectEditorContains(page, namespace);

      await page.getByRole('button', { name: 'Create', exact: true }).click();

      await expect
        .poll(() => resourceExists('ratelimitpolicy', 'example-ratelimitpolicy', namespace), {
          timeout: 15_000,
        })
        .toBe(true);
    });
  });
});

test.describe('other policy create pages render', () => {
  test('OIDCPolicy create form renders', { tag: '@smoke' }, async ({ page }) => {
    await gotoPage(
      page,
      createPagePath(TEST_NAMESPACE, 'extensions.kuadrant.io~v1alpha1~OIDCPolicy'),
    );

    await expect(page.getByRole('heading', { name: 'Create OIDC Policy' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('#policy-name')).toBeVisible();
    await expect(page.locator('#client-id')).toBeVisible();
    await expect(page.locator('#issuer-url')).toBeVisible();
  });

  test('PlanPolicy create page renders YAML editor', { tag: '@smoke' }, async ({ page }) => {
    await gotoPage(
      page,
      createPagePath(TEST_NAMESPACE, 'extensions.kuadrant.io~v1alpha1~PlanPolicy'),
    );

    await expect(page.locator('text=Create Plan Policy').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 15_000 });
  });

  test('TokenRateLimitPolicy create page renders YAML editor', { tag: '@smoke' }, async ({ page }) => {
    await gotoPage(
      page,
      createPagePath(TEST_NAMESPACE, 'kuadrant.io~v1alpha1~TokenRateLimitPolicy'),
    );

    await expect(page.locator('text=Create TokenRateLimit Policy').first()).toBeVisible({
      timeout: 15_000,
    });
    await page.locator('#create-type-radio-yaml').click();
    await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('policies page create dropdown', () => {
  test('lists all policy types and navigates to the DNSPolicy form', { tag: '@smoke' }, async ({ page }) => {
    await gotoPage(page, `/kuadrant/policies/ns/${TEST_NAMESPACE}`);

    const createButton = page.locator('button:has-text("Create Policy")');
    await expect(createButton).toBeVisible({ timeout: 15_000 });
    await expect(createButton).toBeEnabled();
    await createButton.click();

    for (const policy of [
      'AuthPolicy',
      'RateLimitPolicy',
      'TokenRateLimitPolicy',
      'OIDCPolicy',
      'PlanPolicy',
      'DNSPolicy',
      'TLSPolicy',
    ]) {
      await expect(page.getByRole('menuitem', { name: policy, exact: true })).toBeVisible();
    }

    await page.getByRole('menuitem', { name: 'DNSPolicy', exact: true }).click();

    // namespace resolution depends on console state; the destination form is what matters
    await expect(page).toHaveURL(/\/k8s\/ns\/[^/]+\/kuadrant\.io~v1~DNSPolicy\/~new/, {
      timeout: 15_000,
    });
    await expect(page.getByRole('heading', { name: 'Create DNS Policy' })).toBeVisible({
      timeout: 15_000,
    });
  });
});
