import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import { dismissConsoleTour, spaNavigate } from './helpers';

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function kubectl(args: string[], input?: string): string {
  return execFileSync('kubectl', args, {
    encoding: 'utf-8',
    ...(input !== undefined ? { input } : {}),
  }).trim();
}

function resourceExists(kind: string, name: string, namespace: string): boolean {
  return kubectl(['get', kind, name, '-n', namespace, '--ignore-not-found', '-o', 'name']) !== '';
}

function deleteResource(kind: string, name: string, namespace: string): void {
  try {
    kubectl(['delete', kind, name, '-n', namespace, '--ignore-not-found', '--wait=false']);
  } catch {
    // ignore
  }
}

function deleteNamespace(namespace: string): void {
  try {
    kubectl(['delete', 'namespace', namespace, '--ignore-not-found', '--wait=false']);
  } catch {
    // ignore
  }
}

async function addListenerViaWizard(
  page: Page,
  opts: { name: string; port: string; protocol: string },
): Promise<void> {
  const { name, port, protocol } = opts;

  await page.locator('#listener-name').fill(name);
  await page.locator('#listener-port').clear();
  await page.locator('#listener-port').fill(port);

  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('#listener-protocol').selectOption(protocol);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  const addButton = page
    .locator('.pf-v6-c-modal-box')
    .getByRole('button', { name: 'Add' });
  await expect(addButton).toBeEnabled({ timeout: 5_000 });
  await addButton.click();

  await page.waitForSelector('.pf-v6-c-modal-box', { state: 'detached', timeout: 10_000 });
}

test.describe('MCP Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissConsoleTour(page);
  });

  test.describe('Overview page', () => {
    test('renders the MCP overview empty state', { tag: '@smoke' }, async ({ page }) => {
      await spaNavigate(page, '/kuadrant/mcp/overview');

      await expect(page.getByRole('heading', { name: 'MCP Management' })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole('heading', { name: 'Get started' })).toBeVisible();
    });

    test('shows setup wizard button', { tag: '@smoke' }, async ({ page }) => {
      await spaNavigate(page, '/kuadrant/mcp/overview');

      await expect(page.getByTestId('mcp-setup-wizard-button')).toBeVisible({ timeout: 15_000 });
    });

    test('setup wizard button navigates to wizard', { tag: '@smoke' }, async ({ page }) => {
      await spaNavigate(page, '/kuadrant/mcp/overview');

      await page.getByTestId('mcp-setup-wizard-button').click();
      await expect(page).toHaveURL(/\/kuadrant\/mcp\/setup-wizard/);
    });
  });

  test.describe('Setup wizard', () => {
    test('renders the wizard with 4 steps', { tag: '@smoke' }, async ({ page }) => {
      await spaNavigate(page, '/kuadrant/mcp/setup-wizard');

      await expect(page.getByRole('heading', { name: 'MCP Gateway Setup' })).toBeVisible({
        timeout: 15_000,
      });

      await expect(page.getByRole('button', { name: '1. Create Gateway' })).toBeVisible();
      await expect(page.getByRole('button', { name: '2. Route for Gateway' })).toBeVisible();
      await expect(page.getByRole('button', { name: '3. MCP Extension' })).toBeVisible();
      await expect(page.getByRole('button', { name: '4. Verify configuration' })).toBeVisible();
    });

    test('step 1 shows choose and create radio options', { tag: '@smoke' }, async ({ page }) => {
      await spaNavigate(page, '/kuadrant/mcp/setup-wizard');

      await expect(page.getByText('Choose or create a Gateway')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel('Choose a Gateway')).toBeChecked();
      await expect(page.getByLabel('Create a new Gateway')).not.toBeChecked();
    });

    test('step 1 gateway dropdown is present', { tag: '@smoke' }, async ({ page }) => {
      await spaNavigate(page, '/kuadrant/mcp/setup-wizard');

      await expect(page.getByTestId('mcp-gateway-select')).toBeVisible({ timeout: 15_000 });
    });

    test('steps 2-4 are disabled until step 1 is complete', { tag: '@nightly' }, async ({ page }) => {
      await spaNavigate(page, '/kuadrant/mcp/setup-wizard');

      await expect(page.getByRole('heading', { name: 'MCP Gateway Setup' })).toBeVisible({
        timeout: 15_000,
      });

      await expect(page.getByRole('button', { name: '2. Route for Gateway' })).toBeDisabled();
      await expect(page.getByRole('button', { name: '3. MCP Extension' })).toBeDisabled();
      await expect(page.getByRole('button', { name: '4. Verify configuration' })).toBeDisabled();
    });

    test('next is disabled until a gateway is selected', { tag: '@nightly' }, async ({ page }) => {
      await spaNavigate(page, '/kuadrant/mcp/setup-wizard');

      await expect(page.getByTestId('mcp-gateway-select')).toBeVisible({ timeout: 15_000 });

      const nextButton = page.getByRole('button', { name: 'Next', exact: true });
      await expect(nextButton).toBeDisabled();

      await page.getByTestId('mcp-gateway-select').selectOption({ index: 1 });
      await expect(nextButton).toBeEnabled();
    });

    test('create new gateway radio expands embedded form', { tag: '@smoke' }, async ({ page }) => {
      await spaNavigate(page, '/kuadrant/mcp/setup-wizard');

      await expect(page.getByLabel('Choose a Gateway')).toBeChecked({ timeout: 15_000 });

      await page.getByLabel('Create a new Gateway').click();

      await expect(page.locator('#gateway-name')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('#gateway-class')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add listener' })).toBeVisible();
    });
  });

  test.describe('Happy path: existing resources', () => {
    let namespace = '';
    const gatewayName = `e2e-mcp-gw-${uid()}`;
    const routeName = `e2e-mcp-route-${uid()}`;

    test.beforeAll(() => {
      namespace = `e2e-mcp-existing-${uid()}`;
      kubectl(['create', 'namespace', namespace]);
      kubectl(
        ['apply', '-f', '-'],
        `
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
`,
      );
      kubectl(
        ['apply', '-f', '-'],
        `
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: ${routeName}
  namespace: ${namespace}
spec:
  parentRefs:
  - name: ${gatewayName}
  rules:
  - backendRefs:
    - name: test-svc
      port: 80
`,
      );
    });

    test.afterAll(() => {
      deleteResource('mcpgatewayextension', 'e2e-mcp-ext', namespace);
      deleteNamespace(namespace);
    });

    test(
      'wizard flow with existing gateway and route',
      { tag: '@smoke' },
      async ({ page }) => {
        await page.goto(`/kuadrant/mcp/setup-wizard`);
        await page.waitForLoadState('networkidle');
        await dismissConsoleTour(page);

        // Step 1: Select existing gateway
        await expect(page.getByTestId('mcp-gateway-select')).toBeVisible({ timeout: 15_000 });
        await page.getByTestId('mcp-gateway-select').selectOption(gatewayName);

        const nextButton = page.getByRole('button', { name: 'Next', exact: true });
        await expect(nextButton).toBeEnabled();
        await nextButton.click();

        // Step 2: Select existing route
        await expect(page.getByTestId('mcp-route-select')).toBeVisible({ timeout: 15_000 });
        await page.getByTestId('mcp-route-select').selectOption(routeName);
        await nextButton.click();

        // Step 3: Fill MCP Extension form
        await expect(page.getByTestId('mcp-extension-name')).toBeVisible({ timeout: 15_000 });
        await page.getByTestId('mcp-extension-name').fill('e2e-mcp-ext');

        // Select listener from dropdown (gateway has 'http' listener)
        const sectionSelect = page.getByTestId('mcp-section-name');
        if (await sectionSelect.isVisible().catch(() => false)) {
          await sectionSelect.selectOption('http');
        } else {
          await page.getByTestId('mcp-section-name-input').fill('http');
        }

        await nextButton.click();

        // Step 4: Verify — MCPGatewayExtension should be created
        await expect(page.getByText('Create MCPGatewayExtension')).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText('MCPGatewayExtension created successfully')).toBeVisible({
          timeout: 30_000,
        });

        expect(resourceExists('mcpgatewayextension', 'e2e-mcp-ext', namespace)).toBe(true);
      },
    );
  });

  test.describe('Happy path: create new resources', () => {
    let namespace = '';
    const routeName = `e2e-mcp-route-new-${uid()}`;

    test.beforeAll(() => {
      namespace = `e2e-mcp-new-${uid()}`;
      kubectl(['create', 'namespace', namespace]);
      kubectl(
        ['apply', '-f', '-'],
        `
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: ${routeName}
  namespace: ${namespace}
spec:
  parentRefs:
  - name: placeholder-gw
  rules:
  - backendRefs:
    - name: test-svc
      port: 80
`,
      );
    });

    test.afterAll(() => {
      deleteNamespace(namespace);
    });

    test(
      'wizard flow creating new gateway and route',
      { tag: '@smoke' },
      async ({ page }) => {
        const gwName = `e2e-new-gw-${uid()}`;
        const extName = `e2e-new-ext-${uid()}`;

        await page.goto(`/kuadrant/mcp/setup-wizard`);
        await page.waitForLoadState('networkidle');
        await dismissConsoleTour(page);

        // Step 1: Create new gateway
        await expect(page.getByLabel('Choose a Gateway')).toBeChecked({ timeout: 15_000 });
        await page.getByLabel('Create a new Gateway').click();

        await expect(page.locator('#gateway-name')).toBeVisible({ timeout: 15_000 });
        await page.locator('#gateway-name').fill(gwName);

        // Add listener via the embedded form's wizard
        await page.getByRole('button', { name: 'Add listener' }).click();
        await addListenerViaWizard(page, { name: 'mcp', port: '8080', protocol: 'HTTP' });

        // Next should be enabled now
        const nextButton = page.getByRole('button', { name: 'Next', exact: true });
        await expect(nextButton).toBeEnabled({ timeout: 5_000 });
        await nextButton.click();

        // Step 2: Select the pre-created route
        await expect(page.getByLabel('Choose a Route')).toBeChecked({ timeout: 15_000 });
        await page.getByTestId('mcp-route-select').selectOption(routeName);
        await nextButton.click();

        // Step 3: Fill MCP Extension
        await expect(page.getByTestId('mcp-extension-name')).toBeVisible({ timeout: 15_000 });
        await page.getByTestId('mcp-extension-name').fill(extName);
        await page.getByTestId('mcp-section-name-input').fill('mcp');
        await nextButton.click();

        // Step 4: Verify
        await expect(page.getByText('Create Gateway')).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText('Gateway created successfully')).toBeVisible({
          timeout: 30_000,
        });
        await expect(page.getByText('MCPGatewayExtension created successfully')).toBeVisible({
          timeout: 30_000,
        });

        expect(resourceExists('gateway', gwName, 'default')).toBe(true);
        expect(resourceExists('mcpgatewayextension', extName, 'default')).toBe(true);

        // Cleanup
        deleteResource('mcpgatewayextension', extName, 'default');
        deleteResource('gateway', gwName, 'default');
      },
    );
  });
});
