import { test, expect } from '@playwright/test';
import {
  TEST_NAMESPACE,
  dismissConsoleTour,
  navigateToMCPOverview,
  waitForPermissionsLoaded,
} from './helpers';

test.describe('MCP Overview dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissConsoleTour(page);
    await navigateToMCPOverview(page, TEST_NAMESPACE);
    await waitForPermissionsLoaded(page);
  });

  // --- @smoke: critical path ---

  test('renders page heading and summary cards', { tag: '@smoke' }, async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'MCP management overview' })).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByRole('heading', { name: 'MCP Gateways', exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'MCP Servers', exact: true }).first(),
    ).toBeVisible();
  });

  test('renders all table sections', { tag: '@smoke' }, async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'MCP Gateway Extensions', exact: true }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('heading', { name: 'Reference grants', exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Policies attached to MCP gateways or servers' }),
    ).toBeVisible();
  });

  test('shows fixture resources in tables', { tag: '@smoke' }, async ({ page }) => {
    await expect(page.locator('text=mcp-gateway-extension').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('text=test-mcp-server').first()).toBeVisible();
    await expect(page.locator('text=allow-mcp-gateway').first()).toBeVisible();
  });

  test('shows only policies targeting MCP gateways or servers', { tag: '@smoke' }, async ({ page }) => {
    const policiesCard = page.locator('.pf-v6-c-card', {
      has: page.getByRole('heading', { name: 'Policies attached to MCP gateways or servers' }),
    });
    await expect(policiesCard).toBeVisible({ timeout: 15_000 });

    await expect(policiesCard.locator('text=mcp-gateway-auth').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('Create extension button navigates to YAML creation', { tag: '@smoke' }, async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Create MCPGatewayExtension' });
    await expect(btn).toBeVisible({ timeout: 15_000 });
    await btn.click();

    await expect(page).toHaveURL(
      /\/k8s\/ns\/kuadrant-test\/mcp\.kuadrant\.io~v1alpha1~MCPGatewayExtension\/~new/,
      { timeout: 15_000 },
    );
  });

  test('Register MCP Server dropdown navigates Internal to YAML', { tag: '@smoke' }, async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'Register MCP Server' });
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await toggle.click();

    const internalItem = page.getByRole('menuitem', { name: 'Internal' });
    await expect(internalItem).toBeVisible();
    await internalItem.click();

    await expect(page).toHaveURL(
      /\/k8s\/ns\/kuadrant-test\/mcp\.kuadrant\.io~v1alpha1~MCPServerRegistration\/~new/,
      { timeout: 15_000 },
    );
  });

  test('Create policy dropdown shows all policy types', { tag: '@smoke' }, async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'Create Policy' });
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await toggle.click();

    for (const policy of ['AuthPolicy', 'RateLimitPolicy', 'TLSPolicy', 'DNSPolicy']) {
      await expect(page.getByRole('menuitem', { name: policy })).toBeVisible();
    }
  });

  test('Create reference grant button navigates to YAML creation', { tag: '@smoke' }, async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Create ReferenceGrant' });
    await expect(btn).toBeVisible({ timeout: 15_000 });
    await btn.click();

    await expect(page).toHaveURL(
      /\/k8s\/ns\/kuadrant-test\/gateway\.networking\.k8s\.io~v1beta1~ReferenceGrant\/~new/,
      { timeout: 15_000 },
    );
  });

  // --- @nightly: additional checks ---

  test('Getting Started alert can be dismissed', { tag: '@nightly' }, async ({ page }) => {
    const alert = page.locator('text=Getting started with');
    await expect(alert).toBeVisible({ timeout: 15_000 });

    const kebab = page.locator('[aria-label="Getting started actions"]');
    await kebab.click();

    const hideItem = page.getByRole('menuitem', { name: 'Hide for session' });
    await hideItem.click();

    await expect(alert).toBeHidden();
  });

  test('summary cards show correct counts', { tag: '@nightly' }, async ({ page }) => {
    await expect(page.locator('span:text-is("Total")').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('span:text-is("Healthy")').first()).toBeVisible();
    await expect(page.locator('span:text-is("Unhealthy")').first()).toBeVisible();
    await expect(page.locator('span:text-is("Types")').first()).toBeVisible();
    await expect(page.locator('span:text-is("Online")').first()).toBeVisible();
    await expect(page.locator('span:text-is("Offline")').first()).toBeVisible();
  });

  test('Gateway name filter filters extensions table', { tag: '@nightly' }, async ({ page }) => {
    await expect(page.locator('text=mcp-gateway-extension').first()).toBeVisible({
      timeout: 15_000,
    });

    const extensionsCard = page.locator('.pf-v6-c-card', {
      has: page.getByRole('heading', { name: 'MCP Gateway Extensions', exact: true }),
    });

    const filterToggle = extensionsCard.locator('.pf-v6-c-menu-toggle').first();
    await filterToggle.click();
    await page.getByRole('option', { name: 'Gateway name' }).click();

    const filterSelect = extensionsCard.locator('.pf-v6-c-menu-toggle').nth(1);
    await filterSelect.click();
    await page.getByRole('option', { name: 'mcp-gateway' }).click();

    await expect(page.locator('text=mcp-gateway-extension').first()).toBeVisible();
  });

  test('Status filter filters servers table', { tag: '@nightly' }, async ({ page }) => {
    await expect(page.locator('text=test-mcp-server').first()).toBeVisible({
      timeout: 15_000,
    });

    const serversCard = page.locator('.pf-v6-c-card', {
      has: page.getByRole('button', { name: 'Register MCP Server' }),
    });

    const toolbar = serversCard.locator('.pf-v6-c-toolbar');
    const filterToggle = toolbar.locator('.pf-v6-c-menu-toggle').first();
    await filterToggle.click();
    await page.getByRole('option', { name: 'Status' }).click();

    const filterSelect = toolbar.locator('.pf-v6-c-menu-toggle').nth(1);
    await filterSelect.click();
    await page.getByRole('option', { name: 'Offline' }).click();

    await expect(serversCard.locator('text=test-mcp-server').first()).toBeVisible();
  });

  test('External registration option is disabled', { tag: '@nightly' }, async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'Register MCP Server' });
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await toggle.click();

    const externalItem = page.getByRole('menuitem', { name: 'External' });
    await expect(externalItem).toBeVisible();
    await expect(externalItem).toHaveAttribute('aria-disabled', 'true');
  });

  test('navigates to extension details from table', { tag: '@nightly' }, async ({ page }) => {
    const link = page.locator('text=mcp-gateway-extension').first();
    await expect(link).toBeVisible({ timeout: 15_000 });
    await link.click();

    await expect(page).toHaveURL(
      /\/k8s\/ns\/kuadrant-test\/mcp\.kuadrant\.io~v1alpha1~MCPGatewayExtension\/mcp-gateway-extension/,
      { timeout: 15_000 },
    );
  });
});
