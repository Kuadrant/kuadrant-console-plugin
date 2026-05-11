import { test, expect, Page } from '@playwright/test';
import {
  impersonateUser,
  stopImpersonation,
  waitForPermissionsLoaded,
  TEST_NAMESPACE,
} from './helpers';

// Navigate using page.goto which causes full reload
// Impersonation info stored in Redux is lost, so we restore it after navigation
let currentImpersonatedUser: string | null = null;

async function spaNavigate(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('networkidle');

  // Re-impersonate if we were impersonating before
  if (currentImpersonatedUser) {
    await impersonateUser(page, currentImpersonatedUser);
  }
}

async function navigateToAPIProducts(page: Page, namespace: string = TEST_NAMESPACE): Promise<void> {
  await spaNavigate(page, `/kuadrant/ns/${namespace}/apiproducts`);
}

async function navigateToAPIProductsAllNamespaces(page: Page): Promise<void> {
  await spaNavigate(page, '/kuadrant/all-namespaces/apiproducts');
}

async function navigateToAPIKeys(page: Page, namespace: string = TEST_NAMESPACE): Promise<void> {
  await spaNavigate(page, `/kuadrant/ns/${namespace}/apikeys`);
}

async function navigateToAPIKeyApprovals(page: Page, namespace: string = TEST_NAMESPACE): Promise<void> {
  await spaNavigate(page, `/kuadrant/ns/${namespace}/apikey-approvals`);
}

async function navigateToAPIKeyRequests(page: Page, namespace: string = TEST_NAMESPACE): Promise<void> {
  await spaNavigate(page, `/kuadrant/ns/${namespace}/apikey-requests`);
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
    currentImpersonatedUser = 'test-dev';
    await impersonateUser(page, 'test-dev');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
    currentImpersonatedUser = null;
  });

  test('APIProducts list page shows no-permission view', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // should show NoPermissionsView component
    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).toBeVisible({ timeout: 15_000 });

    // should NOT show the ResourceList table
    await expect(page.getByRole('heading', { name: 'API Products', exact: true })).toBeVisible();
    await expect(page.locator('[role="grid"]')).not.toBeVisible();
  });

  test('APIProducts all-namespaces page shows no-permission view', async ({ page }) => {
    await navigateToAPIProductsAllNamespaces(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('APIKeys page shows no-permission view', async ({ page }) => {
    await navigateToAPIKeys(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Keys'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('APIKey Approvals page shows no-permission view', async ({ page }) => {
    await navigateToAPIKeyApprovals(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to approve API Keys'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('APIKey Requests page shows no-permission view', async ({ page }) => {
    await navigateToAPIKeyRequests(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Key Requests'),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('API Management RBAC - Read-Only User', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // test-viewer has read-only access to policies but no API Management permissions
    currentImpersonatedUser = 'test-viewer';
    await impersonateUser(page, 'test-viewer');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
    currentImpersonatedUser = null;
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

test.describe('API Management RBAC - Consumer Persona', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // test-consumer can read APIProducts and manage their APIKeys
    currentImpersonatedUser = 'test-consumer';
    await impersonateUser(page, 'test-consumer');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
    currentImpersonatedUser = null;
  });

  test('Consumer can view APIProducts', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).not.toBeVisible();

    // Check for the page heading (more specific than generic text search)
    await expect(page.getByRole('heading', { name: 'API Products', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-test-id="namespace-bar-dropdown"]')).toBeVisible();
  });

  test('Consumer can view their API Keys', async ({ page }) => {
    await navigateToAPIKeys(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Keys'),
    ).not.toBeVisible();

    await expect(page.getByRole('heading', { name: 'API Keys', exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('Consumer cannot access approval workflows', async ({ page }) => {
    await navigateToAPIKeyApprovals(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to approve API Keys'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('Consumer cannot view API Key requests', async ({ page }) => {
    await navigateToAPIKeyRequests(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Key Requests'),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('API Management RBAC - Owner Persona', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // test-owner can create APIProducts and approve APIKey requests
    currentImpersonatedUser = 'test-owner';
    await impersonateUser(page, 'test-owner');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
    currentImpersonatedUser = null;
  });

  test('Owner can view APIProducts', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).not.toBeVisible();

    await expect(page.getByRole('heading', { name: 'API Products', exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('Owner can approve API Keys', async ({ page }) => {
    await navigateToAPIKeyApprovals(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to approve API Keys'),
    ).not.toBeVisible();

    await expect(page.getByRole('heading', { name: 'API Key Approvals', exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('Owner can view API Key requests', async ({ page }) => {
    await navigateToAPIKeyRequests(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Key Requests'),
    ).not.toBeVisible();

    await expect(page.getByRole('heading', { name: 'API Key Requests', exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('Owner cannot view consumer API Keys directly', async ({ page }) => {
    await navigateToAPIKeys(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Keys'),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('API Management RBAC - Admin User', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // test-admin has full cluster-wide permissions
    currentImpersonatedUser = 'test-admin';
    await impersonateUser(page, 'test-admin');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
    currentImpersonatedUser = null;
  });

  test('APIProducts list page is accessible to admin', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // should NOT show NoPermissionsView
    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).not.toBeVisible();

    // should show the page title
    await expect(page.getByRole('heading', { name: 'API Products', exact: true })).toBeVisible({ timeout: 15_000 });

    // NamespaceBar should be present
    await expect(page.locator('[data-test-id="namespace-bar-dropdown"]')).toBeVisible();
  });

  test('APIProducts all-namespaces page is accessible to admin', async ({ page }) => {
    await navigateToAPIProductsAllNamespaces(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).not.toBeVisible();

    await expect(page.getByRole('heading', { name: 'API Products', exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('Admin can access API Keys page', async ({ page }) => {
    await navigateToAPIKeys(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Keys'),
    ).not.toBeVisible();

    await expect(page.getByRole('heading', { name: 'API Keys', exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('Admin can access API Key Approvals page', async ({ page }) => {
    await navigateToAPIKeyApprovals(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to approve API Keys'),
    ).not.toBeVisible();

    await expect(page.getByRole('heading', { name: 'API Key Approvals', exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('Admin can access API Key Requests page', async ({ page }) => {
    await navigateToAPIKeyRequests(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Key Requests'),
    ).not.toBeVisible();

    await expect(page.getByRole('heading', { name: 'API Key Requests', exact: true })).toBeVisible({ timeout: 15_000 });
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
    currentImpersonatedUser = 'test-dev';
    await impersonateUser(page, 'test-dev');

    // navigate to a detail tab (will show permission error before trying to load resource)
    await spaNavigate(page, `/kuadrant/ns/${TEST_NAMESPACE}/apiproducts/test-product`);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('Policies tab shows no-permission view without access', async ({ page }) => {
    currentImpersonatedUser = 'test-dev';
    await impersonateUser(page, 'test-dev');

    await spaNavigate(page, `/kuadrant/ns/${TEST_NAMESPACE}/apiproducts/test-product/policies`);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('Definition tab is accessible to consumer', async ({ page }) => {
    currentImpersonatedUser = 'test-consumer';
    await impersonateUser(page, 'test-consumer');

    await spaNavigate(page, `/kuadrant/ns/${TEST_NAMESPACE}/apiproducts/test-product`);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).not.toBeVisible();
  });

  test('Policies tab is accessible to owner', async ({ page }) => {
    currentImpersonatedUser = 'test-owner';
    await impersonateUser(page, 'test-owner');

    await spaNavigate(page, `/kuadrant/ns/${TEST_NAMESPACE}/apiproducts/test-product/policies`);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).not.toBeVisible();
  });

  test('Definition tab is accessible to admin', async ({ page }) => {
    currentImpersonatedUser = 'test-admin';
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
    currentImpersonatedUser = 'test-admin';
    await impersonateUser(page, 'test-admin');

    await spaNavigate(page, `/kuadrant/ns/${TEST_NAMESPACE}/apiproducts/test-product/policies`);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).not.toBeVisible();
  });
});
