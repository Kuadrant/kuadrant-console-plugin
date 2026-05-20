import { test, expect } from '@playwright/test';
import { impersonateUser, stopImpersonation, dismissConsoleTour } from './helpers';

// Test the API Keys tab in the API Product details page
// Uses test-approval-product APIProduct from test-apikey-fixtures.yaml
// Dedicated consumers for this test suite:
//   - alice/bob: View tests (non-destructive)
//   - carol: Approve test (will be approved)
//   - dave: Reject test (will be rejected)

const TEST_NAMESPACE = 'kuadrant-test';
const API_PRODUCT_NAME = 'test-approval-product';

async function navigateToAPIProductAPIKeysTab(
  page: Parameters<typeof impersonateUser>[0],
  namespace = TEST_NAMESPACE,
  productName = API_PRODUCT_NAME,
) {
  // Mock the OpenShift user endpoint — in auth-disabled oinc it returns an error,
  // which sets userError=true and disables approve/reject actions.
  await page.route('**/api/kubernetes/apis/user.openshift.io/v1/users/~', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ metadata: { name: 'test-api-owner' } }),
    }),
  );

  // Wait for Kuadrant plugin to load
  await page.getByRole('button', { name: 'Kuadrant', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });

  // Navigate using SPA navigation to preserve impersonation
  await page.evaluate(
    ({ ns, name }) => {
      window.history.pushState({}, '', `/k8s/ns/${ns}/devportal.kuadrant.io~v1alpha1~APIProduct/${name}/apikeys`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
    { ns: namespace, name: productName },
  );
  await page.waitForLoadState('networkidle');

  // Wait for the tab content to load - either the table header or empty state
  await expect(
    page.locator('th:has-text("Name"), th:has-text("Requester")').first()
  ).toBeVisible({ timeout: 30_000 });
}

async function navigateAsOwner(page: Parameters<typeof impersonateUser>[0]) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await dismissConsoleTour(page);
  await impersonateUser(page, 'test-api-owner');
  await navigateToAPIProductAPIKeysTab(page);
  await page.waitForLoadState('networkidle');
}

// ── View API Keys Tab ─────────────────────────────────────────────────────────

test.describe('APIProduct API Keys Tab - View and Actions', () => {
  test.beforeEach(async ({ page }) => {
    await navigateAsOwner(page);
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('should display pending API key requests', async ({ page }) => {
    // Verify the API Keys tab is loaded - use specific selector to avoid ambiguity
    await expect(page.locator('[data-test-id="horizontal-link-API keys"]')).toBeVisible({ timeout: 15_000 });

    // Verify both alice and bob requests are visible (searching by userId, not email)
    await expect(page.locator('tr:has-text("alice-api-key")')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('tr:has-text("bob-api-key")')).toBeVisible({ timeout: 15_000 });

    // Verify both requests are in Pending status
    const aliceRow = page.locator('tr:has-text("alice-api-key")');
    const bobRow = page.locator('tr:has-text("bob-api-key")');

    await expect(aliceRow.locator('text=Pending')).toBeVisible();
    await expect(bobRow.locator('text=Pending')).toBeVisible();
  });

  test('should show actionable items for pending requests', async ({ page }) => {
    // Wait for alice row to be visible
    const aliceRow = page.locator('tr:has-text("alice-api-key")');
    await expect(aliceRow).toBeVisible({ timeout: 15_000 });

    // Verify the kebab menu (actions) is available
    const actionsButton = aliceRow.locator('[aria-label="Actions"]');
    await expect(actionsButton).toBeVisible({ timeout: 10_000 });
    await expect(actionsButton).toBeEnabled();

    // Click to open the actions menu
    await actionsButton.click();

    // Verify both Approve and Reject actions are available
    await expect(page.locator('[role="menuitem"]:has-text("Approve")')).toBeVisible();
    await expect(page.locator('[role="menuitem"]:has-text("Reject")')).toBeVisible();

    // Close the menu by clicking elsewhere
    await page.locator('body').click();
  });

  test('should show use case info icon when use case exists', async ({ page }) => {
    // Wait for alice row to be visible
    const aliceRow = page.locator('tr:has-text("alice-api-key")');
    await expect(aliceRow).toBeVisible({ timeout: 15_000 });

    // Check that the use case column has the info icon (InfoCircleIcon)
    // The icon should be in a cell with the use case data
    const infoIcon = aliceRow.locator('svg').first();

    await expect(infoIcon).toBeVisible();
  });
});

// ── Approve Request ───────────────────────────────────────────────────────────

test.describe('APIProduct API Keys Tab - Approve Request', () => {
  test.beforeEach(async ({ page }) => {
    await navigateAsOwner(page);
    await expect(page.locator('tr:has-text("carol-api-key")')).toBeVisible({ timeout: 15_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('should approve a pending request and update status', async ({ page }) => {
    const carolRow = page.locator('tr:has-text("carol-api-key")');

    // Open actions menu and click Approve
    const actionsButton = carolRow.locator('[aria-label="Actions"]');
    await expect(actionsButton).toBeEnabled({ timeout: 30_000 });
    await actionsButton.click();
    await page.locator('[role="menuitem"]:has-text("Approve")').click();

    // Verify approval modal appears
    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await expect(page.locator('.pf-v6-c-modal-box').locator('text=carol')).toBeVisible();

    // Click Approve button in modal
    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Approve")').click();

    // Wait for modal to close
    await expect(page.locator('.pf-v6-c-modal-box')).not.toBeVisible({ timeout: 10_000 });

    // Verify approval was successful by checking the actions button is gone
    // The status update via watch may take time, so we rely on the absence of actions as confirmation
    await expect(carolRow.locator('[aria-label="Actions"]')).not.toBeVisible({ timeout: 30_000 });
  });
});

// ── Reject Request ────────────────────────────────────────────────────────────

test.describe('APIProduct API Keys Tab - Reject Request', () => {
  test.beforeEach(async ({ page }) => {
    await navigateAsOwner(page);
    await expect(page.locator('tr:has-text("dave-api-key")')).toBeVisible({ timeout: 15_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('should reject a pending request and update status', async ({ page }) => {
    const daveRow = page.locator('tr:has-text("dave-api-key")');

    // Open actions menu and click Reject
    const actionsButton = daveRow.locator('[aria-label="Actions"]');
    await expect(actionsButton).toBeEnabled({ timeout: 30_000 });
    await actionsButton.click();
    await page.locator('[role="menuitem"]:has-text("Reject")').click();

    // Verify rejection modal appears
    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await expect(page.locator('.pf-v6-c-modal-box').locator('text=dave')).toBeVisible();

    // Fill rejection reason
    await page.locator('#rejection-reason').fill('Does not meet usage requirements');

    // Click Reject button in modal
    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Reject")').click();

    // Wait for modal to close
    await expect(page.locator('.pf-v6-c-modal-box')).not.toBeVisible({ timeout: 10_000 });

    // Verify rejection was successful by checking the actions button is gone
    // The status update via watch may take time, so we rely on the absence of actions as confirmation
    await expect(daveRow.locator('[aria-label="Actions"]')).not.toBeVisible({ timeout: 30_000 });
  });
});
