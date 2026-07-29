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

test.describe('Gateway CRUD', () => {
  let namespace = '';

  test.beforeEach(async () => {
    namespace = `e2e-gw-${uid()}`;
    kubectl(['create', 'namespace', namespace]);
  });

  test.afterEach(async () => {
    deleteNamespace(namespace);
  });

  test('creates a Gateway via the form', { tag: '@nightly' }, async ({ page }) => {
    const gatewayName = `e2e-gateway-${uid()}`;
    await gotoPage(page, `/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~Gateway/~new`);

    await expect(page.getByRole('heading', { name: 'Create Gateway' })).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.locator('#create-type-radio-form')).toBeChecked();

    await page.locator('#gateway-name').fill(gatewayName);
    await page.locator('#gateway-class').selectOption('istio');

    const addListenerButton = page.getByRole('button', { name: 'Add Listener' });
    await addListenerButton.click();

    await page.locator('#listener-name-0').fill('http');
    await page.locator('#listener-port-0').fill('80');
    await page.locator('#listener-protocol-0').selectOption('HTTP');

    const createButton = page.getByRole('button', { name: 'Create', exact: true });
    await expect(createButton).toBeEnabled();
    await createButton.click();

    await expect(page).toHaveURL(
      new RegExp(`/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~Gateway/${gatewayName}`),
      { timeout: 15_000 },
    );

    expect(resourceExists('gateway', gatewayName, namespace)).toBe(true);

    expect(
      kubectl([
        'get',
        'gateway',
        gatewayName,
        '-n',
        namespace,
        '-o',
        'jsonpath={.spec.gatewayClassName}',
      ]),
    ).toBe('istio');
  });

  test('edits an existing Gateway', { tag: '@nightly' }, async ({ page }) => {
    const gatewayName = `e2e-gateway-${uid()}`;
    applyResource(`
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: ${gatewayName}
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

    await gotoPage(
      page,
      `/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~Gateway/${gatewayName}/edit`,
    );

    await expect(page.getByRole('heading', { name: 'Edit Gateway' })).toBeVisible({
      timeout: 15_000,
    });

    const nameInput = page.locator('#gateway-name');
    await expect(nameInput).toHaveValue(gatewayName, { timeout: 15_000 });
    await expect(nameInput).toBeDisabled();
    await expect(page.locator('#gateway-class')).toHaveValue('istio');

    await expect(page.locator('#listener-name-0')).toHaveValue('http');
    await expect(page.locator('#listener-port-0')).toHaveValue('80');

    await page.locator('#listener-port-0').fill('8080');

    const saveButton = page.getByRole('button', { name: 'Save', exact: true });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(page).toHaveURL(
      new RegExp(`/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~Gateway/${gatewayName}`),
      { timeout: 15_000 },
    );

    expect(
      kubectl([
        'get',
        'gateway',
        gatewayName,
        '-n',
        namespace,
        '-o',
        'jsonpath={.spec.listeners[0].port}',
      ]),
    ).toBe('8080');
  });

  test('form↔YAML sync preserves data', { tag: '@nightly' }, async ({ page }) => {
    const gatewayName = `e2e-gateway-${uid()}`;
    await gotoPage(page, `/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~Gateway/~new`);

    await expect(page.getByRole('heading', { name: 'Create Gateway' })).toBeVisible({
      timeout: 15_000,
    });

    await page.locator('#gateway-name').fill(gatewayName);
    await page.locator('#gateway-class').selectOption('istio');

    const addListenerButton = page.getByRole('button', { name: 'Add Listener' });
    await addListenerButton.click();

    await page.locator('#listener-name-0').fill('https');
    await page.locator('#listener-port-0').fill('443');
    await page.locator('#listener-protocol-0').selectOption('HTTPS');

    await page.locator('#create-type-radio-yaml').click();

    await expectEditorContains(page, gatewayName);
    await expectEditorContains(page, 'istio');
    await expectEditorContains(page, 'https');
    await expectEditorContains(page, '443');
    await expectEditorContains(page, 'HTTPS');

    await page.locator('#create-type-radio-form').click();

    await expect(page.locator('#gateway-name')).toHaveValue(gatewayName);
    await expect(page.locator('#gateway-class')).toHaveValue('istio');
    await expect(page.locator('#listener-name-0')).toHaveValue('https');
    await expect(page.locator('#listener-port-0')).toHaveValue('443');
    await expect(page.locator('#listener-protocol-0')).toHaveValue('HTTPS');
  });
});
