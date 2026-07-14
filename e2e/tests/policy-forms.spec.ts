import { test, expect, Page } from '@playwright/test';
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
    await expect(page.locator('#gateway-select')).toBeVisible();
    await expect(page.locator('#provider-ref')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('create button enables only when required fields are set', { tag: '@smoke' }, async ({ page }) => {
    await gotoPage(page, createPagePath(TEST_NAMESPACE, 'kuadrant.io~v1~DNSPolicy'));

    const createButton = page.getByRole('button', { name: 'Create', exact: true });
    await expect(createButton).toBeDisabled();

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

    test('creates a DNSPolicy via the form', { tag: '@smoke' }, async ({ page }) => {
      const policyName = `e2e-dns-${uid()}`;
      await gotoPage(page, createPagePath(namespace, 'kuadrant.io~v1~DNSPolicy'));

      await expect(page.getByRole('heading', { name: 'Create DNS Policy' })).toBeVisible({
        timeout: 15_000,
      });

      await page.locator('#policy-name').fill(policyName);

      const gatewayOption = page.locator(`#gateway-select option[value="${namespace}/${gateway}"]`);
      await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
      await page.locator('#gateway-select').selectOption(`${namespace}/${gateway}`);

      await page.locator('#provider-ref').fill('e2e-provider-secret');

      const createButton = page.getByRole('button', { name: 'Create', exact: true });
      await expect(createButton).toBeEnabled();
      await createButton.click();

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
      await expect(page.locator('#gateway-select')).toHaveValue(`${namespace}/${gateway}`);
      await expect(page.locator('#provider-ref')).toHaveValue('e2e-provider-a');

      await page.locator('#provider-ref').fill('e2e-provider-b');

      const saveButton = page.getByRole('button', { name: 'Save', exact: true });
      await expect(saveButton).toBeEnabled();
      await saveButton.click();

      await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/dns`), {
        timeout: 15_000,
      });

      expect(
        kubectl([
          'get',
          'dnspolicy',
          policyName,
          '-n',
          namespace,
          '-o',
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
