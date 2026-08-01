import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import { dismissConsoleTour } from './helpers';

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function kubectl(args: string[], input?: string): string {
  return execFileSync('kubectl', args, {
    encoding: 'utf-8',
    ...(input !== undefined ? { input } : {}),
  }).trim();
}

function applyResource(manifest: string): void {
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
      console.error(`Failed to delete namespace ${namespace}:`, error);
    }
  }
}

async function gotoPage(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await dismissConsoleTour(page);
}

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

async function addRuleViaWizard(
  page: Page,
  opts: { pathValue: string; serviceName: string; servicePort?: string; isEdit?: boolean },
): Promise<void> {
  const { pathValue, serviceName, servicePort = '8080', isEdit = false } = opts;

  // Step 1: Matches — add a match
  await page.getByRole('button', { name: 'Add match' }).click();
  await page.locator('#path-type-0').selectOption('PathPrefix');
  await page.locator('#path-value-0').fill(pathValue);
  await page.locator('#http-method-0').selectOption('GET');

  // Next → Filters (skip)
  await page.getByRole('button', { name: 'Next' }).click();
  // Next → Backend Services
  await page.getByRole('button', { name: 'Next' }).click();

  await page.locator('#service-name').fill(serviceName);
  await page.locator('#service-port').clear();
  await page.locator('#service-port').fill(servicePort);

  // Next → Review
  await page.getByRole('button', { name: 'Next' }).click();

  // Save/Create the rule inside the wizard
  const wizardButton = page
    .locator('.pf-v6-c-modal-box')
    .getByRole('button', { name: isEdit ? 'Save' : 'Create' });
  await wizardButton.click();

  // Wait for wizard modal to close
  await expect(page.locator('.pf-v6-c-modal-box')).not.toBeVisible({ timeout: 5_000 });
}

test.describe('HTTPRoute CRUD', () => {
  let namespace = '';
  let gateway = '';

  test.beforeEach(async () => {
    namespace = `e2e-route-${uid()}`;
    gateway = `e2e-gw-${uid()}`;
    kubectl(['create', 'namespace', namespace]);
    applyResource(`
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: ${gateway}
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
`);
  });

  test.afterEach(async () => {
    deleteNamespace(namespace);
  });

  test('creates an HTTPRoute via the form', { tag: '@nightly' }, async ({ page }) => {
    const routeName = `e2e-httproute-${uid()}`;
    await gotoPage(page, `/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~HTTPRoute/~new`);

    await expect(page.getByRole('heading', { name: 'Create HTTPRoute' })).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.locator('#create-type-radio-form')).toBeChecked();

    // Fill route name
    await page.locator('#httproute-name').fill(routeName);

    // Add parent reference
    await page.getByRole('button', { name: 'Add parent reference' }).click();

    const gatewayOption = page.locator(`#parent-gateway-0 option[value="${gateway}"]`);
    await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
    await page.locator('#parent-gateway-0').selectOption(gateway);

    const sectionOption = page.locator('#parent-section-0 option[value="http"]');
    await expect(sectionOption).toBeAttached({ timeout: 15_000 });
    await page.locator('#parent-section-0').selectOption('http');

    // Add rule via wizard
    await page.getByRole('button', { name: 'Add rule' }).click();
    await addRuleViaWizard(page, { pathValue: '/api', serviceName: 'example-svc' });

    // Submit the form
    const createButton = page.getByRole('button', { name: 'Create', exact: true });
    await expect(createButton).toBeEnabled();
    await createButton.click();

    await expect(page).toHaveURL(
      new RegExp(`/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~HTTPRoute/${routeName}`),
      { timeout: 15_000 },
    );

    expect(resourceExists('httproute', routeName, namespace)).toBe(true);

    expect(
      kubectl([
        'get',
        'httproute',
        routeName,
        '-n',
        namespace,
        '-o',
        'jsonpath={.spec.parentRefs[0].name}',
      ]),
    ).toBe(gateway);
  });

  test('edits an existing HTTPRoute', { tag: '@nightly' }, async ({ page }) => {
    const routeName = `e2e-httproute-${uid()}`;
    applyResource(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: ${routeName}
  namespace: ${namespace}
spec:
  parentRefs:
  - name: ${gateway}
    sectionName: http
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /api
    backendRefs:
    - name: example-svc
      port: 8080
`);

    await gotoPage(
      page,
      `/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~HTTPRoute/${routeName}/edit`,
    );

    await expect(page.getByRole('heading', { name: 'Edit HTTPRoute' })).toBeVisible({
      timeout: 15_000,
    });

    // Verify form is populated
    const nameInput = page.locator('#httproute-name');
    await expect(nameInput).toHaveValue(routeName, { timeout: 15_000 });
    await expect(nameInput).toBeDisabled();

    await expect(page.locator('#parent-gateway-0')).toHaveValue(gateway);
    await expect(page.locator('#parent-section-0')).toHaveValue('http');

    // Verify rule is shown in the table
    await expect(page.getByText('/api')).toBeVisible({ timeout: 15_000 });

    // Edit the rule via wizard
    await page.getByRole('button', { name: 'Edit rule' }).click();

    // In the wizard, change the path value
    await expect(page.locator('#path-value-0')).toHaveValue('/api', { timeout: 15_000 });
    await page.locator('#path-value-0').fill('/v2/api');

    // Navigate through wizard to save
    await page.getByRole('button', { name: 'Next' }).click(); // Filters
    await page.getByRole('button', { name: 'Next' }).click(); // Backend
    await page.getByRole('button', { name: 'Next' }).click(); // Review

    const wizardSaveButton = page
      .locator('.pf-v6-c-modal-box')
      .getByRole('button', { name: 'Save' });
    await wizardSaveButton.click();
    await expect(page.locator('.pf-v6-c-modal-box')).not.toBeVisible({ timeout: 5_000 });

    // Save the form
    const saveButton = page.getByRole('button', { name: 'Save', exact: true });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(page).toHaveURL(
      new RegExp(`/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~HTTPRoute/${routeName}`),
      { timeout: 15_000 },
    );

    expect(
      kubectl([
        'get',
        'httproute',
        routeName,
        '-n',
        namespace,
        '-o',
        'jsonpath={.spec.rules[0].matches[0].path.value}',
      ]),
    ).toBe('/v2/api');
  });

  test('form↔YAML sync preserves data', { tag: '@nightly' }, async ({ page }) => {
    const routeName = `e2e-httproute-${uid()}`;
    await gotoPage(page, `/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~HTTPRoute/~new`);

    await expect(page.getByRole('heading', { name: 'Create HTTPRoute' })).toBeVisible({
      timeout: 15_000,
    });

    await page.locator('#httproute-name').fill(routeName);

    // Add parent reference
    await page.getByRole('button', { name: 'Add parent reference' }).click();

    const gatewayOption = page.locator(`#parent-gateway-0 option[value="${gateway}"]`);
    await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
    await page.locator('#parent-gateway-0').selectOption(gateway);

    // Add rule via wizard
    await page.getByRole('button', { name: 'Add rule' }).click();
    await addRuleViaWizard(page, { pathValue: '/test', serviceName: 'test-svc' });

    // Switch to YAML
    await page.locator('#create-type-radio-yaml').click();

    await expectEditorContains(page, routeName);
    await expectEditorContains(page, gateway);
    await expectEditorContains(page, '/test');

    // Switch back to form
    await page.locator('#create-type-radio-form').click();

    await expect(page.locator('#httproute-name')).toHaveValue(routeName);
    await expect(page.locator('#parent-gateway-0')).toHaveValue(gateway);
    // Rule data is shown in the table, not as inputs
    await expect(page.getByText('/test')).toBeVisible();
  });
});
