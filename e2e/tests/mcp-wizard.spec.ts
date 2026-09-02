import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import {
  TEST_NAMESPACE,
  dismissConsoleTour,
  navigateToMCPOverview,
  waitForPermissionsLoaded,
} from './helpers';

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function kubectl(args: string[], input?: string): string {
  return execFileSync('kubectl', args, {
    encoding: 'utf-8',
    timeout: 30_000,
    ...(input !== undefined ? { input } : {}),
  }).trim();
}

function applyResource(manifest: string): void {
  kubectl(['apply', '-f', '-'], manifest);
}

function resourceExists(kind: string, name: string, namespace: string): boolean {
  return kubectl(['get', kind, name, '-n', namespace, '--ignore-not-found', '-o', 'name']) !== '';
}

function deleteResource(kind: string, name: string, namespace: string): void {
  try {
    kubectl(['delete', kind, name, '-n', namespace, '--ignore-not-found', '--wait=false']);
  } catch {
    // ignore cleanup failures
  }
}

async function openWizard(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Register MCP Server' });
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  await toggle.click();

  const internalItem = page.getByRole('menuitem', { name: 'Internal' });
  await expect(internalItem).toBeVisible();
  await internalItem.click();

  await expect(page.getByText('Setup MCP server')).toBeVisible({ timeout: 10_000 });
}

async function fillStep1UsingExisting(
  page: Page,
  opts: {
    routeName: string;
  },
): Promise<void> {
  const wizard = page.locator('.kuadrant-mcp-wizard');

  // Existing route should already be selected by default
  // Just select it from the dropdown
  const routeSelect = wizard.locator('#route-select');
  await expect(routeSelect).toBeVisible({ timeout: 15_000 });
  await expect(routeSelect.locator(`option[value="${opts.routeName}"]`)).toBeAttached({
    timeout: 15_000,
  });
  await routeSelect.selectOption(opts.routeName);
  await page.waitForTimeout(300);
}

// Helper that creates HTTPRoute first then selects it
async function fillStep1ViaYAML(
  page: Page,
  opts: {
    routeName: string;
    namespace: string;
  },
): Promise<void> {
  // Create HTTPRoute via kubectl
  applyResource(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: ${opts.routeName}
  namespace: ${opts.namespace}
spec:
  parentRefs:
    - name: test-gateway
  rules:
    - backendRefs:
        - name: test-service
          port: 8080
`);

  // Then select it in the wizard
  await fillStep1UsingExisting(page, { routeName: opts.routeName });
}

async function fillStep2(
  page: Page,
  opts: {
    registrationName: string;
    namespace: string;
    toolPrefix: string;
  },
): Promise<void> {
  const wizard = page.locator('.kuadrant-mcp-wizard');

  await wizard.locator('#registration-name').fill(opts.registrationName);
  await wizard.locator('#server-namespace').selectOption(opts.namespace);
  await wizard.locator('#tool-prefix').fill(opts.toolPrefix);
}

test.describe('MCP Registration Wizard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await dismissConsoleTour(page);
    await navigateToMCPOverview(page, TEST_NAMESPACE);
    await waitForPermissionsLoaded(page);
  });

  test('opens wizard from Register MCP Server dropdown', { tag: '@smoke' }, async ({ page }) => {
    await openWizard(page);

    const wizard = page.locator('.kuadrant-mcp-wizard');

    // Verify wizard step nav buttons
    await expect(wizard.getByRole('button', { name: 'HTTPRoute for MCP server' })).toBeVisible();
    await expect(wizard.getByRole('button', { name: 'Register MCP server' })).toBeVisible();
    await expect(wizard.getByRole('button', { name: 'Verify MCP server' })).toBeVisible();
  });

  test('navigates through all wizard steps', { tag: '@smoke' }, async ({ page }) => {
    const routeName = `e2e-route-${uid()}`;
    const regName = `e2e-reg-${uid()}`;

    // Create HTTPRoute first
    applyResource(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: ${routeName}
  namespace: ${TEST_NAMESPACE}
spec:
  parentRefs:
    - name: test-gateway
  rules:
    - backendRefs:
        - name: test-service
          port: 8080
`);

    await openWizard(page);

    // Step 1: Select existing route
    await fillStep1UsingExisting(page, {
      routeName,
    });

    const wizard = page.locator('.kuadrant-mcp-wizard');

    // Wait for Next button to be enabled
    const nextButton = wizard.getByRole('button', { name: 'Next' });
    await expect(nextButton).toBeEnabled({ timeout: 10_000 });

    // Click Next to go to step 2
    await nextButton.click();

    // Verify step 2 is active
    await expect(wizard.locator('#registration-name')).toBeVisible({ timeout: 10_000 });

    // Step 2: Fill registration form
    await fillStep2(page, {
      registrationName: regName,
      namespace: TEST_NAMESPACE,
      toolPrefix: 'test',
    });

    // Verify target HTTPRoute is auto-populated from step 1
    await expect(wizard.locator('#target-httproute')).toHaveValue(routeName);

    // Click Next to go to step 3
    await wizard.getByRole('button', { name: 'Next' }).click();

    try {
      // Verify step 3 shows progress content
      await expect(
        page.getByText('MCP server is ready').or(page.getByText('Create HTTPRoute')).first(),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      // Clean up resources that were created
      deleteResource('mcpserverregistration', regName, TEST_NAMESPACE);
      deleteResource('httproute', routeName, TEST_NAMESPACE);
    }
  });

  test('step 2 namespace can be selected', { tag: '@nightly' }, async ({ page }) => {
    await openWizard(page);

    const routeName = `e2e-route-${uid()}`;

    // Fill step 1 by selecting existing route
    await fillStep1ViaYAML(page, {
      routeName,
      namespace: TEST_NAMESPACE,
    });

    const wizard = page.locator('.kuadrant-mcp-wizard');

    // Navigate to step 2
    await wizard.getByRole('button', { name: 'Next' }).click();

    // Step 2 namespace select should be visible and can be set
    const namespaceSelect = wizard.locator('#server-namespace');
    await expect(namespaceSelect).toBeVisible({ timeout: 10_000 });
    await namespaceSelect.selectOption(TEST_NAMESPACE);
    await expect(namespaceSelect).toHaveValue(TEST_NAMESPACE);
  });

  test('step 2 has Form and YAML tabs', { tag: '@nightly' }, async ({ page }) => {
    await openWizard(page);

    await fillStep1ViaYAML(page, {
      routeName: `e2e-route-${uid()}`,
      namespace: TEST_NAMESPACE,
    });

    const wizard = page.locator('.kuadrant-mcp-wizard');

    // Wait for Next button to be enabled
    const nextButton = wizard.getByRole('button', { name: 'Next' });
    await expect(nextButton).toBeEnabled({ timeout: 10_000 });
    await nextButton.click();

    // Verify tabs exist on step 2
    await expect(wizard.getByRole('tab', { name: 'Form' })).toBeVisible({ timeout: 10_000 });
    await expect(wizard.getByRole('tab', { name: 'YAML' })).toBeVisible();

    // Switch to YAML
    await wizard.getByRole('tab', { name: 'YAML' }).click();
    await expect(wizard.locator('.monaco-editor')).toBeVisible({ timeout: 15_000 });
  });

  test('creates resources on step 3 and shows progress', { tag: '@smoke' }, async ({ page }) => {
    const routeName = `e2e-wiz-${uid()}`;
    const regName = `e2e-reg-${uid()}`;

    // Create HTTPRoute first
    applyResource(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: ${routeName}
  namespace: ${TEST_NAMESPACE}
spec:
  parentRefs:
    - name: test-gateway
  rules:
    - backendRefs:
        - name: test-service
          port: 8080
`);

    await openWizard(page);

    // Step 1: Select existing route
    await fillStep1UsingExisting(page, {
      routeName,
    });

    const wizard = page.locator('.kuadrant-mcp-wizard');

    // Wait for Next button to be enabled
    const nextButton = wizard.getByRole('button', { name: 'Next' });
    await expect(nextButton).toBeEnabled({ timeout: 10_000 });
    await nextButton.click();

    // Step 2
    await fillStep2(page, {
      registrationName: regName,
      namespace: TEST_NAMESPACE,
      toolPrefix: 'e2etest',
    });

    await wizard.getByRole('button', { name: 'Next' }).click();

    try {
      // Step 3: Wait for resources to be created (creating spinner or watching phase)
      await expect(
        page.getByText('MCP server is ready').or(page.getByText('Error creating resources')),
      ).toBeVisible({ timeout: 30_000 });

      // Verify resources were actually created on cluster
      expect(resourceExists('httproute', routeName, TEST_NAMESPACE)).toBe(true);
      expect(resourceExists('mcpserverregistration', regName, TEST_NAMESPACE)).toBe(true);

      // Verify HTTPRoute fields
      // Verify HTTPRoute was created with correct backend
      expect(
        kubectl([
          'get',
          'httproute',
          routeName,
          '-n',
          TEST_NAMESPACE,
          '-o',
          'jsonpath={.spec.rules[0].backendRefs[0].name}',
        ]),
      ).toBe('test-service');

      // Verify MCPServerRegistration fields
      expect(
        kubectl([
          'get',
          'mcpserverregistration',
          regName,
          '-n',
          TEST_NAMESPACE,
          '-o',
          'jsonpath={.spec.prefix}',
        ]),
      ).toBe('e2etest');

      expect(
        kubectl([
          'get',
          'mcpserverregistration',
          regName,
          '-n',
          TEST_NAMESPACE,
          '-o',
          'jsonpath={.spec.targetRef.name}',
        ]),
      ).toBe(routeName);
    } finally {
      // Cleanup
      deleteResource('mcpserverregistration', regName, TEST_NAMESPACE);
      deleteResource('httproute', routeName, TEST_NAMESPACE);
    }
  });

  test('Cancel closes the wizard', { tag: '@nightly' }, async ({ page }) => {
    await openWizard(page);

    const cancelButton = page
      .locator('.kuadrant-mcp-wizard')
      .getByRole('button', { name: 'Cancel' });
    await cancelButton.click();

    await expect(page.getByText('Setup MCP server')).toBeHidden({ timeout: 5_000 });
  });

  test('Back button returns to previous step', { tag: '@nightly' }, async ({ page }) => {
    await openWizard(page);

    await fillStep1ViaYAML(page, {
      routeName: `e2e-route-${uid()}`,
      namespace: TEST_NAMESPACE,
    });

    const wizard = page.locator('.kuadrant-mcp-wizard');

    // Wait for Next button to be enabled
    const nextButton = wizard.getByRole('button', { name: 'Next' });
    await expect(nextButton).toBeEnabled({ timeout: 10_000 });
    await nextButton.click();

    // On step 2, click Back
    await expect(wizard.locator('#registration-name')).toBeVisible({ timeout: 10_000 });
    await wizard.getByRole('button', { name: 'Back' }).click();

    // Should be back on step 1
    await expect(wizard.getByRole('button', { name: 'HTTPRoute for MCP server' })).toHaveAttribute(
      'aria-current',
      'step',
      { timeout: 5_000 },
    );
  });

  test('step 2 validates required fields', { tag: '@nightly' }, async ({ page }) => {
    await openWizard(page);

    await fillStep1ViaYAML(page, {
      routeName: `e2e-route-${uid()}`,
      namespace: TEST_NAMESPACE,
    });

    const wizard = page.locator('.kuadrant-mcp-wizard');

    // Wait for Next button to be enabled
    const nextButton = wizard.getByRole('button', { name: 'Next' });
    await expect(nextButton).toBeEnabled({ timeout: 10_000 });
    await nextButton.click();

    // On step 2 - Next should be disabled without required fields
    const step2NextButton = wizard.getByRole('button', { name: 'Next' });

    // Clear auto-populated namespace to test validation
    await wizard.locator('#server-namespace').selectOption('');
    await expect(step2NextButton).toBeDisabled();

    // Fill required fields
    await fillStep2(page, {
      registrationName: `e2e-reg-${uid()}`,
      namespace: TEST_NAMESPACE,
      toolPrefix: 'test',
    });

    await expect(step2NextButton).toBeEnabled({ timeout: 5_000 });
  });
});
