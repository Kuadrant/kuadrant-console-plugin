import { test, expect } from '@playwright/test';
import { impersonateUser, stopImpersonation, TEST_NAMESPACE } from './helpers';

// Impersonation is stored in Redux (not cookies), so page.goto resets it.
// The pattern that works:
//   1. Navigate to the target URL as admin (pre-loads the plugin into React memory)
//   2. Impersonate test-dev → console redirects to Projects (Redux is still set)
//   3. SPA navigate (pushState+popstate) back to target — plugin already loaded,
//      React Router re-renders our component, useAccessReview fires as test-dev

async function impersonateAndNavigate(
  page: import('@playwright/test').Page,
  startUrl: string,
  targetUrl: string,
): Promise<void> {
  await page.goto(startUrl);
  await page.waitForLoadState('networkidle');
  await impersonateUser(page, 'test-dev');
  // now on Projects page, impersonated as test-dev
  await page.evaluate((url: string) => {
    window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, targetUrl);
  await page.waitForLoadState('networkidle');
}

// test-dev: no API Management permissions.
test.describe('APIProduct RBAC - no permission user', () => {
  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('list page shows no-permission view', { tag: '@smoke' }, async ({ page }) => {
    const url = `/kuadrant/apiproducts/ns/${TEST_NAMESPACE}`;
    await impersonateAndNavigate(page, url, url);

    await expect(page.locator('text=You do not have permission to view API Products')).toBeVisible({
      timeout: 15_000,
    });

    // generic error alert must NOT appear
    await expect(page.locator('text=Error loading API Products')).not.toBeVisible();
  });

  test('definition tab shows access denied', { tag: '@smoke' }, async ({ page }) => {
    // Start at the list page to pre-load the Kuadrant plugin into React memory,
    // then impersonate and SPA navigate to the tab URL.
    await impersonateAndNavigate(
      page,
      `/kuadrant/apiproducts/ns/${TEST_NAMESPACE}`,
      `/k8s/ns/${TEST_NAMESPACE}/devportal.kuadrant.io~v1alpha1~APIProduct/any-product`,
    );

    // Two gates can fire:
    // 1. Console's own "Restricted access" — when user lacks `get` on apiproducts
    //    (our plugin tabs never mount; console shows its own restriction page)
    // 2. Our NoPermissionsView — when user has `get` but not `list` on apiproducts
    //    (our tab component mounts and gates with useAccessReview)
    // test-dev lacks both, so the console gate fires first.
    await expect(
      page
        .locator('text=Restricted access')
        .or(page.locator('text=You do not have permission to view API Products')),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('policies tab shows access denied', { tag: '@smoke' }, async ({ page }) => {
    await impersonateAndNavigate(
      page,
      `/kuadrant/apiproducts/ns/${TEST_NAMESPACE}`,
      `/k8s/ns/${TEST_NAMESPACE}/devportal.kuadrant.io~v1alpha1~APIProduct/any-product/policies`,
    );

    await expect(
      page
        .locator('text=Restricted access')
        .or(page.locator('text=You do not have permission to view API Products')),
    ).toBeVisible({ timeout: 15_000 });
  });
});
