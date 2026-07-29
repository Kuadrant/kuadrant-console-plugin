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

    await page.locator('#httproute-name').fill(routeName);

    const addParentButton = page.getByRole('button', { name: 'Add Parent Reference' });
    await addParentButton.click();

    const gatewayOption = page.locator(`#parent-gateway-0 option[value="${namespace}/${gateway}"]`);
    await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
    await page.locator('#parent-gateway-0').selectOption(`${namespace}/${gateway}`);

    const sectionOption = page.locator('#parent-section-0 option[value="http"]');
    await expect(sectionOption).toBeAttached({ timeout: 15_000 });
    await page.locator('#parent-section-0').selectOption('http');

    const addRuleButton = page.getByRole('button', { name: 'Add Rule' });
    await addRuleButton.click();

    await page.locator('#rule-path-0').fill('/api');

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

    const nameInput = page.locator('#httproute-name');
    await expect(nameInput).toHaveValue(routeName, { timeout: 15_000 });
    await expect(nameInput).toBeDisabled();

    await expect(page.locator('#parent-gateway-0')).toHaveValue(`${namespace}/${gateway}`);
    await expect(page.locator('#parent-section-0')).toHaveValue('http');

    await expect(page.locator('#rule-path-0')).toHaveValue('/api');

    await page.locator('#rule-path-0').fill('/v2/api');

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

    const addParentButton = page.getByRole('button', { name: 'Add Parent Reference' });
    await addParentButton.click();

    const gatewayOption = page.locator(`#parent-gateway-0 option[value="${namespace}/${gateway}"]`);
    await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
    await page.locator('#parent-gateway-0').selectOption(`${namespace}/${gateway}`);

    const addRuleButton = page.getByRole('button', { name: 'Add Rule' });
    await addRuleButton.click();

    await page.locator('#rule-path-0').fill('/test');

    await page.locator('#create-type-radio-yaml').click();

    await expectEditorContains(page, routeName);
    await expectEditorContains(page, gateway);
    await expectEditorContains(page, '/test');

    await page.locator('#create-type-radio-form').click();

    await expect(page.locator('#httproute-name')).toHaveValue(routeName);
    await expect(page.locator('#parent-gateway-0')).toHaveValue(`${namespace}/${gateway}`);
    await expect(page.locator('#rule-path-0')).toHaveValue('/test');
  });
});
