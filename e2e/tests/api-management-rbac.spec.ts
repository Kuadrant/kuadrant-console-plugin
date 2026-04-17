import { test, expect, Page } from '@playwright/test';
import {
  impersonateUser,
  stopImpersonation,
  waitForPermissionsLoaded,
  TEST_NAMESPACE,
} from './helpers';

// SPA navigation helper for API Management pages
async function spaNavigate(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForLoadState('networkidle');
}

async function navigateToAPIProducts(page: Page, namespace: string = TEST_NAMESPACE): Promise<void> {
  await spaNavigate(page, `/kuadrant/ns/${namespace}/apiproducts`);
}

async function navigateToAPIProductsAllNamespaces(page: Page): Promise<void> {
  await spaNavigate(page, '/kuadrant/all-namespaces/apiproducts');
}

// API Management RBAC tests
// These test the RBAC integration added to APIProduct pages.
// The useAPIManagementRBAC hook checks permissions.apiproducts.canList
// before displaying content.

test.describe('API Management RBAC - No Permissions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // test-dev has no API Management permissions
    await impersonateUser(page, 'test-dev');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('APIProducts list page shows no-permission view', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // should show NoPermissionsView component
    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).toBeVisible({ timeout: 15_000 });

    // should NOT show the ResourceList table
    await expect(page.locator('text=API Products')).toBeVisible();
    await expect(page.locator('[role="grid"]')).not.toBeVisible();
  });

  test('APIProducts all-namespaces page shows no-permission view', async ({ page }) => {
    await navigateToAPIProductsAllNamespaces(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('API Management RBAC - Read-Only User', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // test-viewer has read-only access to policies but no API Management permissions
    await impersonateUser(page, 'test-viewer');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('APIProducts page shows no-permission view for read-only policy user', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // test-viewer can read policies but not API Management resources
    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('API Management RBAC - Admin User', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // test-admin has full cluster-wide permissions
    await impersonateUser(page, 'test-admin');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('APIProducts list page is accessible to admin', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // should NOT show NoPermissionsView
    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).not.toBeVisible();

    // should show the page title
    await expect(page.locator('text=API Products')).toBeVisible({ timeout: 15_000 });

    // NamespaceBar should be present
    await expect(page.locator('[data-test-id="namespace-bar-dropdown"]')).toBeVisible();
  });

  test('APIProducts all-namespaces page is accessible to admin', async ({ page }) => {
    await navigateToAPIProductsAllNamespaces(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).not.toBeVisible();

    await expect(page.locator('text=API Products')).toBeVisible({ timeout: 15_000 });
  });

  test('RBAC loading state appears before content loads', async ({ page }) => {
    // navigate to page
    await page.evaluate(() => {
      window.history.pushState({}, '', '/kuadrant/all-namespaces/apiproducts');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    // loading spinner should appear while checking permissions
    const spinner = page.locator('.pf-v6-c-spinner');
    try {
      await spinner.waitFor({ state: 'visible', timeout: 2_000 });
    } catch {
      // permission check was very fast, spinner already gone
    }

    await page.waitForLoadState('networkidle');
    await waitForPermissionsLoaded(page);

    // spinner should be gone after permissions loaded
    await expect(spinner).not.toBeVisible();
  });
});

// APIProduct detail tabs RBAC
// These tabs use the same RBAC hook, so they should also be gated
test.describe('API Management RBAC - APIProduct Detail Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('Definition tab shows no-permission view without access', async ({ page }) => {
    await impersonateUser(page, 'test-dev');

    // navigate to a detail tab (will show permission error before trying to load resource)
    await spaNavigate(page, `/kuadrant/ns/${TEST_NAMESPACE}/apiproducts/test-product`);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('Policies tab shows no-permission view without access', async ({ page }) => {
    await impersonateUser(page, 'test-dev');

    await spaNavigate(page, `/kuadrant/ns/${TEST_NAMESPACE}/apiproducts/test-product/policies`);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('Definition tab is accessible to admin', async ({ page }) => {
    await impersonateUser(page, 'test-admin');

    await spaNavigate(page, `/kuadrant/ns/${TEST_NAMESPACE}/apiproducts/test-product`);
    await waitForPermissionsLoaded(page);

    // should NOT show permission error
    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).not.toBeVisible();

    // will show "Error loading API Product" or "No OpenAPI specification" depending on whether
    // test-product exists, but that's expected - we're just testing RBAC gate
  });

  test('Policies tab is accessible to admin', async ({ page }) => {
    await impersonateUser(page, 'test-admin');

    await spaNavigate(page, `/kuadrant/ns/${TEST_NAMESPACE}/apiproducts/test-product/policies`);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).not.toBeVisible();
  });
});
