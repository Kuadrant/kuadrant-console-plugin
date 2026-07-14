import { test, expect } from '@playwright/test';
import {
  TEST_NAMESPACE,
  dismissConsoleTour,
  spaNavigate,
  waitForPermissionsLoaded,
} from './helpers';

// read-only tests against fixtures from e2e/manifests/test-resources.yaml.
// namespace-scoped so resources seeded elsewhere by parallel specs are not
// visible; the overview page reads the namespace from the URL param.
test.describe('Overview dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissConsoleTour(page);
    await spaNavigate(page, `/kuadrant/overview/ns/${TEST_NAMESPACE}`);
    await waitForPermissionsLoaded(page);
  });

  test('renders the dashboard cards', { tag: '@smoke' }, async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Kuadrant Overview' })).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.locator('text=Getting started resources')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gateways', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gateways - Traffic Analysis' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Policies', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'HTTPRoutes', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'GRPCRoutes', exact: true })).toBeVisible();
  });

  test('gateway summary shows health stats', { tag: '@smoke' }, async ({ page }) => {
    await expect(page.locator('span:text-is("Total Gateways")')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('span:text-is("Healthy Gateways")')).toBeVisible();
    await expect(page.locator('span:text-is("Unhealthy Gateways")')).toBeVisible();

    // at least the fixture gateway is counted
    const totalCount = page
      .locator('span:text-is("Total Gateways")')
      .locator('xpath=preceding-sibling::strong');
    await expect(totalCount).toHaveText(/^[1-9]\d*$/, { timeout: 15_000 });
  });

  test('traffic analysis card lists gateways with metric columns', { tag: '@nightly' }, async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Gateways - Traffic Analysis' })).toBeVisible({
      timeout: 15_000,
    });

    for (const column of ['Total Requests', 'Successful Requests', 'Error Rate', 'Error Codes']) {
      await expect(page.locator(`text=${column}`).first()).toBeVisible();
    }

    await expect(page.locator('a[data-test="test-gateway"]').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('policies card lists fixture policies', { tag: '@smoke' }, async ({ page }) => {
    await expect(page.locator('a[data-test="test-auth-policy"]').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('a[data-test="test-plan-policy"]').first()).toBeVisible();
  });

  test('navigates to gateway details from the traffic analysis card', { tag: '@smoke' }, async ({ page }) => {
    const gatewayLink = page.locator('a[data-test="test-gateway"]').first();
    await expect(gatewayLink).toBeVisible({ timeout: 15_000 });
    await gatewayLink.click();

    await expect(page).toHaveURL(
      /\/k8s\/ns\/kuadrant-test\/gateway\.networking\.k8s\.io~v1~Gateway\/test-gateway/,
      { timeout: 15_000 },
    );
  });

  test('navigates to policy details from the policies card', { tag: '@smoke' }, async ({ page }) => {
    const policyLink = page.locator('a[data-test="test-auth-policy"]').first();
    await expect(policyLink).toBeVisible({ timeout: 15_000 });
    await policyLink.click();

    await expect(page).toHaveURL(
      /\/k8s\/ns\/kuadrant-test\/kuadrant\.io~v1~AuthPolicy\/test-auth-policy/,
      { timeout: 15_000 },
    );
  });

  test('navigates to HTTPRoute details from the routes card', { tag: '@smoke' }, async ({ page }) => {
    const routeLink = page.locator('a[data-test="test-route"]').first();
    await expect(routeLink).toBeVisible({ timeout: 15_000 });
    await routeLink.click();

    await expect(page).toHaveURL(
      /\/k8s\/ns\/kuadrant-test\/gateway\.networking\.k8s\.io~v1~HTTPRoute\/test-route/,
      { timeout: 15_000 },
    );
  });
});
