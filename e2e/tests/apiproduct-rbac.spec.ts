import { test, expect } from '@playwright/test';
import {
  impersonateUser,
  stopImpersonation,
  navigateToAPIProducts,
  TEST_NAMESPACE,
} from './helpers';

// test-dev: no API Management permissions.
test.describe('APIProduct RBAC - no permission user', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await impersonateUser(page, 'test-dev');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('list page shows no-permission view', async ({ page }) => {
    await navigateToAPIProducts(page);
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).toBeVisible({ timeout: 15_000 });

    // should show the specific permission message, not a generic error
    await expect(page.locator('text=Error loading API Products')).not.toBeVisible();
  });

  test('definition tab shows no-permission view', async ({ page }) => {
    await page.evaluate((ns: string) => {
      window.history.pushState(
        {},
        '',
        `/k8s/ns/${ns}/devportal.kuadrant.io~v1alpha1~APIProduct/any-product`,
      );
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, TEST_NAMESPACE);
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('policies tab shows no-permission view', async ({ page }) => {
    await page.evaluate((ns: string) => {
      window.history.pushState(
        {},
        '',
        `/k8s/ns/${ns}/devportal.kuadrant.io~v1alpha1~APIProduct/any-product/policies`,
      );
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, TEST_NAMESPACE);
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('text=You do not have permission to view API Products'),
    ).toBeVisible({ timeout: 15_000 });
  });
});
