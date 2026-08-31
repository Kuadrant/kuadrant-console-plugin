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

function createRoute(routeName: string): void {
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
}

async function openExternalWizard(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Register MCP Server' });
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  await toggle.click();

  const externalItem = page.getByRole('menuitem', { name: 'External' });
  await expect(externalItem).toBeVisible();
  await externalItem.click();

  await expect(page.getByText('Setup external MCP server')).toBeVisible({ timeout: 10_000 });
}

async function fillServiceEntryStep(
  page: Page,
  opts: { name: string; host: string },
): Promise<void> {
  const wizard = page.locator('.kuadrant-mcp-wizard');
  await wizard.locator('[data-test="service-entry-name"]').fill(opts.name);
  await wizard.locator('[data-test="service-entry-namespace"]').selectOption(TEST_NAMESPACE);
  await wizard.locator('[data-test="service-entry-hosts"]').fill(opts.host);
  await wizard.locator('[data-test="service-entry-port"]').fill('443');
}

async function fillDestinationRuleStep(
  page: Page,
  opts: { name: string; host: string },
): Promise<void> {
  const wizard = page.locator('.kuadrant-mcp-wizard');
  await wizard.locator('[data-test="destination-rule-name"]').fill(opts.name);
  await wizard.locator('[data-test="destination-rule-namespace"]').selectOption(TEST_NAMESPACE);
  await wizard.locator('[data-test="destination-rule-host"]').fill(opts.host);
}

async function fillCredentialStep(page: Page, opts: { name: string }): Promise<void> {
  const wizard = page.locator('.kuadrant-mcp-wizard');
  await wizard.locator('[data-test="credential-name"]').fill(opts.name);
  await wizard.locator('[data-test="credential-namespace"]').selectOption(TEST_NAMESPACE);
  await wizard.locator('[data-test="credential-token"]').fill('Bearer e2e-token');
}

async function fillRegisterServerStep(
  page: Page,
  opts: { name: string; prefix: string },
): Promise<void> {
  const wizard = page.locator('.kuadrant-mcp-wizard');
  await wizard.locator('[data-test="mcp-registration-name"]').fill(opts.name);
  await wizard.locator('[data-test="mcp-registration-namespace"]').selectOption(TEST_NAMESPACE);
  await wizard.locator('[data-test="mcp-registration-prefix"]').fill(opts.prefix);
}

async function clickNext(page: Page): Promise<void> {
  const next = page
    .locator('.kuadrant-mcp-wizard')
    .getByRole('button', { name: 'Next', exact: true });
  await expect(next).toBeEnabled({ timeout: 10_000 });
  await next.click();
}

test.describe('MCP External Registration Wizard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissConsoleTour(page);
    await navigateToMCPOverview(page, TEST_NAMESPACE);
    await waitForPermissionsLoaded(page);
  });

  test(
    'opens external wizard from Register MCP Server dropdown',
    { tag: '@smoke' },
    async ({ page }) => {
      await openExternalWizard(page);

      const wizard = page.locator('.kuadrant-mcp-wizard');
      await expect(wizard.getByRole('button', { name: 'Create Service Entry' })).toBeVisible();
      await expect(wizard.getByRole('button', { name: 'Create Destination Rule' })).toBeVisible();
      await expect(wizard.getByRole('button', { name: 'Create HTTP route' })).toBeVisible();
      await expect(wizard.getByRole('button', { name: 'Add access credentials' })).toBeVisible();
      await expect(
        wizard.getByRole('button', { name: 'Create MCP server registration' }),
      ).toBeVisible();
      await expect(wizard.getByRole('button', { name: 'Verify configuration' })).toBeVisible();
    },
  );

  test('walks all steps and creates resources', { tag: '@smoke' }, async ({ page }) => {
    const routeName = `e2e-ext-route-${uid()}`;
    const seName = `e2e-se-${uid()}`;
    const drName = `e2e-dr-${uid()}`;
    const credName = `e2e-cred-${uid()}`;
    const regName = `e2e-ext-reg-${uid()}`;
    const host = 'api.external.example.com';

    try {
      createRoute(routeName);
      await openExternalWizard(page);
      const wizard = page.locator('.kuadrant-mcp-wizard');

      // Step 1: Service Entry
      await fillServiceEntryStep(page, { name: seName, host });
      await clickNext(page);

      // Step 2: Destination Rule
      await expect(wizard.locator('[data-test="destination-rule-name"]')).toBeVisible({
        timeout: 10_000,
      });
      await fillDestinationRuleStep(page, { name: drName, host });
      await clickNext(page);

      // Step 3: HTTP route (existing)
      await wizard.locator('[data-test="mcp-external-route-select"]').selectOption(routeName);
      await clickNext(page);

      // Step 4: Credentials
      await expect(wizard.locator('[data-test="credential-name"]')).toBeVisible({
        timeout: 10_000,
      });
      await fillCredentialStep(page, { name: credName });
      await clickNext(page);

      // Step 5: Register MCP server
      await expect(wizard.locator('[data-test="mcp-registration-name"]')).toBeVisible({
        timeout: 10_000,
      });
      await fillRegisterServerStep(page, { name: regName, prefix: 'e2eext' });
      await clickNext(page);

      // Step 6: Verify — resources are created on entry
      await expect(
        page
          .getByText('MCPServerRegistration created successfully')
          .or(page.getByText('Error creating resources')),
      ).toBeVisible({ timeout: 30_000 });

      // Verify all four resources exist on cluster
      expect(resourceExists('serviceentry', seName, TEST_NAMESPACE)).toBe(true);
      expect(resourceExists('destinationrule', drName, TEST_NAMESPACE)).toBe(true);
      expect(resourceExists('secret', credName, TEST_NAMESPACE)).toBe(true);
      expect(resourceExists('mcpserverregistration', regName, TEST_NAMESPACE)).toBe(true);

      // Registration should target the chosen route with the given prefix
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
      ).toBe('e2eext');
    } finally {
      deleteResource('mcpserverregistration', regName, TEST_NAMESPACE);
      deleteResource('secret', credName, TEST_NAMESPACE);
      deleteResource('destinationrule', drName, TEST_NAMESPACE);
      deleteResource('serviceentry', seName, TEST_NAMESPACE);
      deleteResource('httproute', routeName, TEST_NAMESPACE);
    }
  });

  test('step 1 has Form and YAML tabs that stay in sync', { tag: '@nightly' }, async ({ page }) => {
    const seName = `e2e-se-${uid()}`;
    await openExternalWizard(page);
    const wizard = page.locator('.kuadrant-mcp-wizard');

    await fillServiceEntryStep(page, { name: seName, host: 'api.external.example.com' });

    await expect(wizard.getByRole('tab', { name: 'Form' })).toBeVisible({ timeout: 10_000 });
    await wizard.getByRole('tab', { name: 'YAML' }).click();

    // Editor mounts and reflects the form input
    await expect(wizard.locator('.monaco-editor')).toBeVisible({ timeout: 15_000 });
    await expect(wizard.locator('.monaco-editor')).toContainText(seName, { timeout: 10_000 });
  });

  test(
    'step 1 Next is disabled until required fields are filled',
    { tag: '@nightly' },
    async ({ page }) => {
      await openExternalWizard(page);
      const wizard = page.locator('.kuadrant-mcp-wizard');

      const next = wizard.getByRole('button', { name: 'Next', exact: true });
      await expect(next).toBeDisabled();

      await fillServiceEntryStep(page, {
        name: `e2e-se-${uid()}`,
        host: 'api.external.example.com',
      });
      await expect(next).toBeEnabled({ timeout: 5_000 });
    },
  );

  test('Cancel closes the external wizard', { tag: '@nightly' }, async ({ page }) => {
    await openExternalWizard(page);
    await page.locator('.kuadrant-mcp-wizard').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Setup external MCP server')).toBeHidden({ timeout: 5_000 });
  });

  test('Back returns from step 2 to step 1', { tag: '@nightly' }, async ({ page }) => {
    await openExternalWizard(page);
    const wizard = page.locator('.kuadrant-mcp-wizard');

    await fillServiceEntryStep(page, { name: `e2e-se-${uid()}`, host: 'api.external.example.com' });
    await clickNext(page);

    await expect(wizard.locator('[data-test="destination-rule-name"]')).toBeVisible({
      timeout: 10_000,
    });
    await wizard.getByRole('button', { name: 'Back' }).click();

    await expect(wizard.getByRole('button', { name: 'Create Service Entry' })).toHaveAttribute(
      'aria-current',
      'step',
      { timeout: 5_000 },
    );
  });
});
