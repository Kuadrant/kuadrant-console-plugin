import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import { dismissConsoleTour, spaNavigate, TEST_NAMESPACE } from './helpers';

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
  kubectl(['delete', kind, name, '-n', namespace, '--ignore-not-found', '--wait=false']);
}

function deleteNamespace(namespace: string): void {
  kubectl(['delete', 'namespace', namespace, '--ignore-not-found', '--wait=false']);
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

  const addButton = page.locator('.pf-v6-c-modal-box').getByRole('button', { name: 'Add' });
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
    let emptyNs = '';

    test.beforeAll(() => {
      emptyNs = `e2e-mcp-empty-${uid()}`;
      kubectl(['create', 'namespace', emptyNs]);
    });

    test.afterAll(() => {
      deleteNamespace(emptyNs);
    });

    test('renders the MCP overview empty state', { tag: '@smoke' }, async ({ page }) => {
      await spaNavigate(page, `/kuadrant/mcp/overview/ns/${emptyNs}`);

      await expect(page.getByRole('heading', { name: 'MCP management' })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole('heading', { name: 'Get started' })).toBeVisible();
    });

    test('shows setup wizard button', { tag: '@nightly' }, async ({ page }) => {
      await spaNavigate(page, `/kuadrant/mcp/overview/ns/${emptyNs}`);

      await expect(page.locator('[data-test="mcp-setup-wizard-button"]')).toBeVisible({
        timeout: 15_000,
      });
    });

    test('setup wizard button navigates to wizard', { tag: '@nightly' }, async ({ page }) => {
      await spaNavigate(page, `/kuadrant/mcp/overview/ns/${emptyNs}`);

      await page.locator('[data-test="mcp-setup-wizard-button"]').click();
      await expect(page).toHaveURL(/\/kuadrant\/mcp\/setup-wizard/);
    });
  });

  test.describe('Setup wizard', () => {
    const setupGatewayName = `e2e-mcp-setup-gw-${uid()}`;

    test.beforeAll(() => {
      kubectl(
        ['apply', '-f', '-'],
        `
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: ${setupGatewayName}
  namespace: ${TEST_NAMESPACE}
spec:
  gatewayClassName: istio
  listeners:
  - name: http
    port: 80
    protocol: HTTP
`,
      );
    });

    test.afterAll(() => {
      deleteResource('gateway', setupGatewayName, TEST_NAMESPACE);
    });

    let manualRouteName = '';
    let manualExtensionName = '';

    test.afterEach(() => {
      if (manualExtensionName) {
        deleteResource('mcpgatewayextension', manualExtensionName, TEST_NAMESPACE);
        manualExtensionName = '';
      }
      if (manualRouteName) {
        deleteResource('httproute', manualRouteName, TEST_NAMESPACE);
        manualRouteName = '';
      }
    });

    test('renders the wizard with 3 steps', { tag: '@nightly' }, async ({ page }) => {
      await spaNavigate(page, '/kuadrant/mcp/setup-wizard');

      await expect(page.getByRole('heading', { name: 'MCP Gateway Setup' })).toBeVisible({
        timeout: 15_000,
      });

      await expect(page.getByRole('button', { name: '1. Create Gateway' })).toBeVisible();
      await expect(page.getByRole('button', { name: '2. MCP Extension' })).toBeVisible();
      await expect(page.getByRole('button', { name: '3. Verify configuration' })).toBeVisible();
    });

    test('step 1 shows choose and create radio options', { tag: '@nightly' }, async ({ page }) => {
      await spaNavigate(page, '/kuadrant/mcp/setup-wizard');

      await expect(page.getByText('Choose or create a Gateway')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel('Choose an existing Gateway')).toBeChecked();
      await expect(page.getByLabel('Create a new Gateway')).not.toBeChecked();
    });

    test('step 1 gateway dropdown is present', { tag: '@nightly' }, async ({ page }) => {
      await spaNavigate(page, '/kuadrant/mcp/setup-wizard');

      await expect(page.locator('[data-test="mcp-gateway-select"]')).toBeVisible({
        timeout: 15_000,
      });
    });

    test(
      'disabling automatic HTTPRoute management adds the route step',
      { tag: '@nightly' },
      async ({ page }) => {
        manualRouteName = `e2e-mcp-manual-route-${uid()}`;
        manualExtensionName = `e2e-mcp-manual-ext-${uid()}`;

        await page.goto(`/k8s/ns/${TEST_NAMESPACE}`);
        await page.waitForLoadState('networkidle');
        await dismissConsoleTour(page);
        await spaNavigate(page, '/kuadrant/mcp/setup-wizard');

        await expect(page.locator('[data-test="mcp-gateway-select"]')).toBeVisible({
          timeout: 15_000,
        });
        await page.locator('[data-test="mcp-gateway-select"]').selectOption({ index: 1 });
        const selectedGatewayName = await page
          .locator('[data-test="mcp-gateway-select"]')
          .inputValue();
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await page.getByText('Advanced broker settings').click();
        await expect(page.locator('[data-test="mcp-http-route-management"]')).not.toBeChecked();
        await page.getByLabel('Disable automatic HTTPRoute management').click();

        await expect(page.getByRole('button', { name: '3. HTTPRoute' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Configure MCP Extension' })).toBeVisible();
        await expect(page.getByRole('button', { name: '2. MCP Extension' })).toBeVisible();
        await expect(page.getByRole('button', { name: '4. Verify configuration' })).toBeVisible();

        await page.locator('[data-test="mcp-extension-name"]').fill(manualExtensionName);
        const sectionSelect = page.locator('[data-test="mcp-section-name"]');
        let selectedSectionName = 'http';
        if (await sectionSelect.isVisible().catch(() => false)) {
          await sectionSelect.selectOption({ index: 1 });
        } else {
          await page.locator('[data-test="mcp-section-name-input"]').fill('http');
        }
        if (await sectionSelect.isVisible().catch(() => false)) {
          selectedSectionName = await sectionSelect.inputValue();
        }
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(
          page.getByRole('heading', { name: 'Choose or create an HTTPRoute' }),
        ).toBeVisible();
        await expect(page.getByLabel('Create a new HTTPRoute')).toBeChecked();
        await expect(page.locator('#parent-gateway-0')).toHaveValue(selectedGatewayName);
        await expect(page.locator('#parent-gateway-0')).toBeDisabled();
        await expect(page.locator('#parent-section-0')).toHaveValue(selectedSectionName);

        await page.locator('#httproute-name').fill(manualRouteName);
        await page.getByRole('button', { name: 'Add rule', exact: true }).click();

        const ruleModal = page.locator('.pf-v6-c-modal-box');
        await expect(ruleModal).toBeVisible();
        await ruleModal.getByRole('button', { name: 'Next', exact: true }).click();
        await ruleModal.getByRole('button', { name: 'Next', exact: true }).click();
        await ruleModal.locator('#service-name').fill('test-svc');
        await ruleModal.getByRole('button', { name: 'Next', exact: true }).click();
        await ruleModal.getByRole('button', { name: 'Create', exact: true }).click();
        await page.waitForSelector('.pf-v6-c-modal-box', { state: 'detached', timeout: 10_000 });

        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(page.getByText('Create HTTPRoute', { exact: true })).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.getByText('HTTPRoute created successfully')).toBeVisible({
          timeout: 30_000,
        });
        await expect(page.getByText('MCPGatewayExtension created successfully')).toBeVisible({
          timeout: 30_000,
        });

        expect(resourceExists('httproute', manualRouteName, TEST_NAMESPACE)).toBe(true);
        expect(
          kubectl([
            'get',
            'httproute',
            manualRouteName,
            '-n',
            TEST_NAMESPACE,
            '-o',
            'jsonpath={.spec.parentRefs[0].name}',
          ]),
        ).toBe(selectedGatewayName);
      },
    );

    test(
      'steps 2-3 are disabled until step 1 is complete',
      { tag: '@nightly' },
      async ({ page }) => {
        await spaNavigate(page, '/kuadrant/mcp/setup-wizard');

        await expect(page.getByRole('heading', { name: 'MCP Gateway Setup' })).toBeVisible({
          timeout: 15_000,
        });

        await expect(page.getByRole('button', { name: '2. MCP Extension' })).toBeDisabled();
        await expect(page.getByRole('button', { name: '3. Verify configuration' })).toBeDisabled();
      },
    );

    test('next is disabled until a gateway is selected', { tag: '@nightly' }, async ({ page }) => {
      await page.goto(`/k8s/ns/${TEST_NAMESPACE}`);
      await page.waitForLoadState('networkidle');
      await spaNavigate(page, '/kuadrant/mcp/setup-wizard');

      await expect(page.locator('[data-test="mcp-gateway-select"]')).toBeVisible({
        timeout: 15_000,
      });

      const nextButton = page.getByRole('button', { name: 'Next', exact: true });
      await expect(nextButton).toBeDisabled();

      await page
        .locator('[data-test="mcp-gateway-select"]')
        .selectOption({ value: setupGatewayName });
      await expect(nextButton).toBeEnabled();
    });

    test(
      'create new gateway radio expands embedded form',
      { tag: '@nightly' },
      async ({ page }) => {
        await spaNavigate(page, '/kuadrant/mcp/setup-wizard');

        await expect(page.getByLabel('Choose an existing Gateway')).toBeChecked({
          timeout: 15_000,
        });

        await page.getByLabel('Create a new Gateway').click();

        await expect(page.locator('#gateway-name')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('#gateway-class')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Add listener' })).toBeVisible();
      },
    );
  });

  test.describe('Happy path: existing resources', () => {
    let namespace = '';
    const gatewayName = `e2e-mcp-gw-${uid()}`;

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
    });

    test.afterAll(() => {
      deleteResource('mcpgatewayextension', 'e2e-mcp-ext', namespace);
      deleteNamespace(namespace);
    });

    test('wizard flow with existing gateway', { tag: '@smoke' }, async ({ page }) => {
      // Set active namespace to the test namespace so the wizard watches resources there
      await page.goto(`/k8s/ns/${namespace}`);
      await page.waitForLoadState('networkidle');
      await dismissConsoleTour(page);
      await spaNavigate(page, '/kuadrant/mcp/setup-wizard');

      // Step 1: Select existing gateway
      await expect(page.locator('[data-test="mcp-gateway-select"]')).toBeVisible({
        timeout: 15_000,
      });
      await page.locator('[data-test="mcp-gateway-select"]').selectOption(gatewayName);

      const nextButton = page.getByRole('button', { name: 'Next', exact: true });
      await expect(nextButton).toBeEnabled();
      await nextButton.click();

      // Step 2: Fill MCP Extension form
      await expect(page.locator('[data-test="mcp-extension-name"]')).toBeVisible({
        timeout: 15_000,
      });
      await page.locator('[data-test="mcp-extension-name"]').fill('e2e-mcp-ext');

      // Select listener from dropdown (gateway has 'http' listener)
      const sectionSelect = page.locator('[data-test="mcp-section-name"]');
      if (await sectionSelect.isVisible().catch(() => false)) {
        await sectionSelect.selectOption('http');
      } else {
        await page.locator('[data-test="mcp-section-name-input"]').fill('http');
      }

      await nextButton.click();

      // Step 3: Verify — MCPGatewayExtension should be created
      await expect(page.getByText('Create MCPGatewayExtension')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('MCPGatewayExtension created successfully')).toBeVisible({
        timeout: 30_000,
      });

      expect(resourceExists('mcpgatewayextension', 'e2e-mcp-ext', namespace)).toBe(true);
    });
  });

  test.describe('Happy path: create new resources', () => {
    let namespace = '';

    test.beforeAll(() => {
      namespace = `e2e-mcp-new-${uid()}`;
      kubectl(['create', 'namespace', namespace]);
    });

    test.afterAll(() => {
      deleteNamespace(namespace);
    });

    test('wizard flow creating a new gateway', { tag: '@smoke' }, async ({ page }) => {
      const gwName = `e2e-new-gw-${uid()}`;
      const extName = `e2e-new-ext-${uid()}`;

      // Set active namespace to the test namespace so the wizard watches resources there
      await page.goto(`/k8s/ns/${namespace}`);
      await page.waitForLoadState('networkidle');
      await dismissConsoleTour(page);
      await spaNavigate(page, '/kuadrant/mcp/setup-wizard');

      // Step 1: Create new gateway
      await expect(page.getByLabel('Choose an existing Gateway')).toBeChecked({ timeout: 15_000 });
      await page.getByLabel('Create a new Gateway').click();

      await expect(page.locator('#gateway-name')).toBeVisible({ timeout: 15_000 });
      await page.locator('#gateway-name').fill(gwName);

      // Add listener via the embedded form's wizard
      await page.getByRole('button', { name: 'Add listener' }).click();
      await addListenerViaWizard(page, { name: 'mcp', port: '8080', protocol: 'HTTP' });

      // Next should be enabled now
      const nextButton = page.getByRole('button', { name: 'Next', exact: true });
      await expect(nextButton).toBeEnabled({ timeout: 15_000 });
      await nextButton.click();

      // Step 2: Fill MCP Extension
      await expect(page.locator('[data-test="mcp-extension-name"]')).toBeVisible({
        timeout: 15_000,
      });
      await page.locator('[data-test="mcp-extension-name"]').fill(extName);
      const sectionSelect = page.locator('[data-test="mcp-section-name"]');
      if (await sectionSelect.isVisible().catch(() => false)) {
        await sectionSelect.selectOption('mcp');
      } else {
        await page.locator('[data-test="mcp-section-name-input"]').fill('mcp');
      }
      await nextButton.click();

      // Step 3: Verify
      await expect(page.getByText('Create Gateway', { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText('Gateway created successfully')).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText('MCPGatewayExtension created successfully')).toBeVisible({
        timeout: 30_000,
      });

      expect(resourceExists('gateway', gwName, namespace)).toBe(true);
      expect(resourceExists('mcpgatewayextension', extName, namespace)).toBe(true);

      // Cleanup
      deleteResource('mcpgatewayextension', extName, namespace);
      deleteResource('gateway', gwName, namespace);
    });
  });

  test.describe('Happy path: advanced settings', () => {
    let namespace = '';
    const gatewayName = `e2e-mcp-adv-gw-${uid()}`;

    test.beforeAll(() => {
      namespace = `e2e-mcp-adv-${uid()}`;
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
    });

    test.afterAll(() => {
      deleteResource('mcpgatewayextension', 'e2e-adv-ext', namespace);
      deleteNamespace(namespace);
    });

    test('wizard flow with advanced broker settings', { tag: '@smoke' }, async ({ page }) => {
      // Set active namespace
      await page.goto(`/k8s/ns/${namespace}`);
      await page.waitForLoadState('networkidle');
      await dismissConsoleTour(page);
      await spaNavigate(page, '/kuadrant/mcp/setup-wizard');

      // Step 1: Select existing gateway
      await expect(page.locator('[data-test="mcp-gateway-select"]')).toBeVisible({
        timeout: 15_000,
      });
      await page.locator('[data-test="mcp-gateway-select"]').selectOption(gatewayName);
      const nextButton = page.getByRole('button', { name: 'Next', exact: true });
      await nextButton.click();

      // Step 2: Fill MCP Extension with advanced settings
      await expect(page.locator('[data-test="mcp-extension-name"]')).toBeVisible({
        timeout: 15_000,
      });
      await page.locator('[data-test="mcp-extension-name"]').fill('e2e-adv-ext');
      const sectionSelect = page.locator('[data-test="mcp-section-name"]');
      if (await sectionSelect.isVisible().catch(() => false)) {
        await sectionSelect.selectOption('http');
      } else {
        await page.locator('[data-test="mcp-section-name-input"]').fill('http');
      }

      // Expand advanced settings
      await page.getByRole('button', { name: 'Advanced broker settings' }).click();

      // Enable override hostnames
      await page.locator('label[for="override-hostnames"]').click();
      await page.locator('[data-test="mcp-public-host"]').fill('mcp.e2e-test.com');

      // Enable OAuth
      await page.locator('label[for="oauth-metadata"]').click();
      await page.locator('[data-test="mcp-oauth-auth-servers"]').fill('https://auth.e2e.com');

      await nextButton.click();

      // Step 3: Verify
      await expect(page.getByText('MCPGatewayExtension created successfully')).toBeVisible({
        timeout: 30_000,
      });

      // Verify on cluster
      expect(resourceExists('mcpgatewayextension', 'e2e-adv-ext', namespace)).toBe(true);

      // Verify advanced fields in the created resource
      const extYaml = kubectl([
        'get',
        'mcpgatewayextension',
        'e2e-adv-ext',
        '-n',
        namespace,
        '-o',
        'jsonpath={.spec.publicHost},{.spec.oauthProtectedResource.authorizationServers[0]}',
      ]);
      expect(extYaml).toContain('mcp.e2e-test.com');
      expect(extYaml).toContain('https://auth.e2e.com');
    });
  });

  test.describe('Happy path: cross-namespace ReferenceGrant', () => {
    let gwNamespace = '';
    let extNamespace = '';
    const gatewayName = `e2e-mcp-xns-gw-${uid()}`;

    test.beforeAll(() => {
      gwNamespace = `e2e-mcp-gw-ns-${uid()}`;
      extNamespace = `e2e-mcp-ext-ns-${uid()}`;
      kubectl(['create', 'namespace', gwNamespace]);
      kubectl(['create', 'namespace', extNamespace]);
      kubectl(
        ['apply', '-f', '-'],
        `
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: ${gatewayName}
  namespace: ${gwNamespace}
spec:
  gatewayClassName: istio
  listeners:
  - name: http
    port: 80
    protocol: HTTP
`,
      );
    });

    test.afterAll(() => {
      deleteResource('mcpgatewayextension', 'e2e-xns-ext', extNamespace);
      deleteResource('referencegrant', 'e2e-xns-ext-ref-grant', gwNamespace);
      deleteNamespace(gwNamespace);
      deleteNamespace(extNamespace);
    });

    test(
      'wizard creates ReferenceGrant for cross-namespace extension',
      { tag: '@smoke' },
      async ({ page }) => {
        // Set active namespace to gateway namespace so the wizard watches resources there
        await page.goto(`/k8s/ns/${gwNamespace}`);
        await page.waitForLoadState('networkidle');
        await dismissConsoleTour(page);
        await spaNavigate(page, '/kuadrant/mcp/setup-wizard');

        // Step 1: Select existing gateway
        await expect(page.locator('[data-test="mcp-gateway-select"]')).toBeVisible({
          timeout: 15_000,
        });
        await page.locator('[data-test="mcp-gateway-select"]').selectOption(gatewayName);
        const nextButton = page.getByRole('button', { name: 'Next', exact: true });
        await nextButton.click();

        // Step 2: Fill extension — set a DIFFERENT namespace to trigger ReferenceGrant
        await expect(page.locator('[data-test="mcp-extension-name"]')).toBeVisible({
          timeout: 15_000,
        });
        await page.locator('[data-test="mcp-extension-name"]').fill('e2e-xns-ext');
        await page.locator('[data-test="mcp-extension-namespace"]').fill(extNamespace);
        const sectionSelect = page.locator('[data-test="mcp-section-name"]');
        if (await sectionSelect.isVisible().catch(() => false)) {
          await sectionSelect.selectOption('http');
        } else {
          await page.locator('[data-test="mcp-section-name-input"]').fill('http');
        }
        await nextButton.click();

        // Step 3: Verify — should create ReferenceGrant + MCPGatewayExtension
        await expect(page.getByText('Create ReferenceGrant')).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText('ReferenceGrant created successfully')).toBeVisible({
          timeout: 30_000,
        });
        await expect(page.getByText('MCPGatewayExtension created successfully')).toBeVisible({
          timeout: 30_000,
        });

        // Verify resources on cluster
        expect(resourceExists('mcpgatewayextension', 'e2e-xns-ext', extNamespace)).toBe(true);
        expect(resourceExists('referencegrant', 'e2e-xns-ext-ref-grant', gwNamespace)).toBe(true);

        // Verify ReferenceGrant spec
        const refGrantFrom = kubectl([
          'get',
          'referencegrant',
          'e2e-xns-ext-ref-grant',
          '-n',
          gwNamespace,
          '-o',
          'jsonpath={.spec.from[0].namespace}',
        ]);
        expect(refGrantFrom).toBe(extNamespace);
      },
    );
  });
});
