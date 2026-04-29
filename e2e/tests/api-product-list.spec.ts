import { test, expect } from '@playwright/test';
import { impersonateUser, stopImpersonation, waitForPermissionsLoaded } from './helpers';

const navigateToAPIProducts = async (page, namespace = 'kuadrant-test') => {
  await page.evaluate((ns) => {
    window.history.pushState({}, '', `/k8s/ns/${ns}/devportal.kuadrant.io~v1alpha1~APIProduct`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, namespace);
  await page.waitForLoadState('networkidle');
};

test.describe('APIProduct List Page - Display and Filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await impersonateUser(page, 'test-admin');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('displays API Products list with correct columns', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Verify page title
    await expect(page.locator('h1:has-text("API Products")')).toBeVisible({ timeout: 15_000 });

    // Wait for table to load
    const table = page.locator('[data-ouia-component-id="OUIA-Generated-Table-1"]');
    await expect(table).toBeVisible({ timeout: 15_000 });

    // Verify column headers are present
    await expect(page.locator('th button div span:has-text("Name")').first()).toBeVisible();
    await expect(page.locator('th button div span:has-text("Version")')).toBeVisible();
    await expect(page.locator('th:has-text("Route")')).toBeVisible();
    await expect(page.locator('th:has-text("PlanPolicy")')).toBeVisible();
    await expect(page.locator('th button div span:has-text("Namespace")')).toBeVisible();
    await expect(page.locator('th button div span:has-text("Status")')).toBeVisible();
    await expect(page.locator('th:has-text("Tags")')).toBeVisible();
    await expect(page.locator('th button div span:has-text("Created")')).toBeVisible();
  });

  test('displays API Products from test fixtures', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for table rows to load
    for (const row of await page.locator('[data-test-rows="resource-row"]').all())
      await expect(row).toBeVisible({ timeout: 15_000 });

    // Verify our test API Products are displayed
    await expect(
      page.locator('div.kuadrant-resource-table a:has-text("gamestore-api")'),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('div.kuadrant-resource-table a:has-text("payment-api")')).toBeVisible(
      { timeout: 10_000 },
    );
    await expect(page.locator('div.kuadrant-resource-table a:has-text("draft-api")')).toBeVisible({
      timeout: 10_000,
    });

    // Verify we have at least 4 API Products
    const rows = page.locator('tbody tr[data-key]');
    await expect(rows).toHaveCount(5, { timeout: 10_000 });
  });

  test('displays correct status labels', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for Published status labels (green)
    const publishedLabels = await page
      .locator('.pf-v6-c-label.pf-m-green:has-text("Published")')
      .all();
    expect(publishedLabels).toHaveLength(2);

    // Wait for Draft status label (orange)
    const draftLabels = await page.locator('.pf-v6-c-label.pf-m-orange:has-text("Draft")').all();
    expect(draftLabels).toHaveLength(3);
  });

  test('displays PlanPolicy links correctly', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for table to load
    await page.waitForTimeout(2000); // Give time for PlanPolicy map to build

    // Find the row for gamestore-api (has a PlanPolicy)
    const gamestoreRow = page.locator('tr:has(a:has-text("gamestore-api"))');
    await expect(gamestoreRow).toBeVisible({ timeout: 15_000 });

    // Verify PlanPolicy link is present in the row
    const planPolicyLink = gamestoreRow.locator('a:has-text("test-plan-policy")');
    await expect(planPolicyLink).toBeVisible({ timeout: 10_000 });
  });

  test('displays tags with correct styling', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Find the row for gamestore-api (has a PlanPolicy)
    const gamestoreRow = page.locator('tr:has(a:has-text("gamestore-api"))');

    // Verify specific tags exist
    await expect(gamestoreRow.locator('.pf-v6-c-label:has-text("demo")').first()).toBeVisible();
    await expect(gamestoreRow.locator('.pf-v6-c-label:has-text("retail")').first()).toBeVisible();
    await expect(gamestoreRow.locator('.pf-v6-c-label:has-text("games")').first()).toBeVisible();
  });
});

test.describe('APIProduct List Page - Status Filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await impersonateUser(page, 'test-admin');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('filters by Published status', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("draft-api")')).toBeVisible({ timeout: 15_000 });

    // Open status filter dropdown
    const statusToggle = page.locator('button:has-text("Status")').first();
    await statusToggle.click();

    // Select "Published" option
    const publishedOption = page.locator('[role="option"]:has-text("Published")');
    await publishedOption.click();

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Verify filter label is shown
    await expect(page.locator('.pf-v6-c-label:has-text("Status: Published")')).toBeVisible();

    // Verify only Published products are shown
    await expect(page.locator('a:has-text("toystore-api")')).toBeVisible();
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible();
    await expect(page.locator('a:has-text("payment-api")')).toBeVisible();

    // Verify Draft product is NOT shown
    await expect(page.locator('a:has-text("draft-api")')).not.toBeVisible();
  });

  test('filters by Draft status', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Open status filter dropdown
    const statusToggle = page.locator('button:has-text("Status")').first();
    await statusToggle.click();

    // Select "Draft" option
    const draftOption = page.locator('[role="option"]:has-text("Draft")');
    await draftOption.click();

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Verify filter label is shown
    await expect(page.locator('.pf-v6-c-label:has-text("Status: Draft")')).toBeVisible();

    // Verify only Draft product is shown
    await expect(page.locator('a:has-text("draft-api")')).toBeVisible();

    // Verify Published products are NOT shown
    await expect(page.locator('a:has-text("gamestore-api")')).not.toBeVisible();
  });

  test('clears status filter when clicking X on filter label', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Apply Published filter
    const statusToggle = page.locator('button:has-text("Status")').first();
    await statusToggle.click();
    const publishedOption = page.locator('[role="option"]:has-text("Published")');
    await publishedOption.click();

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Verify filter is active
    const filterLabel = page.locator('.pf-v6-c-label:has-text("Status: Published")');
    await expect(filterLabel).toBeVisible();

    // Click the X button to clear filter
    const closeButton = filterLabel.locator('button[aria-label="Close Status,: ,Published"]');
    await closeButton.click();

    // Wait for filter to clear
    await page.waitForTimeout(1000);

    // Verify all products are shown again
    await expect(page.locator('a:has-text("toystore-api")')).toBeVisible();
    await expect(page.locator('a:has-text("draft-api")')).toBeVisible();

    // Verify filter label is gone
    await expect(filterLabel).not.toBeVisible();
  });
});

test.describe('APIProduct List Page - Name Filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await impersonateUser(page, 'test-admin');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('filters by name (partial match)', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Verify Name filter is selected by default
    const filterTypeToggle = page.locator('button:has-text("Name")').first();
    await expect(filterTypeToggle).toBeVisible();

    // Type into search input
    const searchInput = page.locator('input[aria-label="Resource search"]');
    await searchInput.fill('gamestore');

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Verify only gamestore-api is shown
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible();

    // Verify other products are NOT shown
    await expect(page.locator('a:has-text("draft-api")')).not.toBeVisible();
    await expect(page.locator('a:has-text("payment-api")')).not.toBeVisible();
  });

  test('filters by name (case insensitive)', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("payment-api")')).toBeVisible({ timeout: 15_000 });

    // Type uppercase into search input
    const searchInput = page.locator('input[aria-label="Resource search"]');
    await searchInput.fill('PAYMENT');

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Verify payment-api is shown (case insensitive match)
    await expect(page.locator('a:has-text("payment-api")')).toBeVisible();
  });

  test('shows empty state when no results match name filter', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Type non-matching search
    const searchInput = page.locator('input[aria-label="Resource search"]');
    await searchInput.fill('nonexistent-api');

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Verify empty state is shown
    await expect(page.locator('text=No API Products found')).toBeVisible();
    await expect(page.locator('text=No API Products match the filter criteria.')).toBeVisible();
  });

  test('clears name filter when input is cleared', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Apply name filter
    const searchInput = page.locator('input[aria-label="Resource search"]');
    await searchInput.fill('someapi');
    await page.waitForTimeout(1000);

    // Verify filter is active
    await expect(page.locator('a:has-text("gamestore-api")')).not.toBeVisible();

    // Clear the input
    await searchInput.clear();
    await page.waitForTimeout(1000);

    // Verify all products are shown again
    await expect(page.locator('a:has-text("draft-api")')).toBeVisible();
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible();
    await expect(page.locator('a:has-text("payment-api")')).toBeVisible();
  });
});

test.describe('APIProduct List Page - Combined Filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await impersonateUser(page, 'test-admin');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('applies both status and name filters together', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Apply status filter (Published)
    const statusToggle = page.locator('button:has-text("Status")').first();
    await statusToggle.click();
    const publishedOption = page.locator('[role="option"]:has-text("Published")');
    await publishedOption.click();
    await page.waitForTimeout(1000);

    // Apply name filter (partial match "store")
    const searchInput = page.locator('input[aria-label="Resource search"]');
    await searchInput.fill('store');
    await page.waitForTimeout(1000);

    // Verify only Published products with "store" in name are shown
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible();

    // Verify payment-api is NOT shown (doesn't have "store" in name)
    await expect(page.locator('a:has-text("payment-api")')).not.toBeVisible();

    // Verify draft-api is NOT shown (status is Draft, not Published)
    await expect(page.locator('a:has-text("draft-api")')).not.toBeVisible();
  });

  test('shows empty state when combined filters match nothing', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Apply status filter (Draft)
    const statusToggle = page.locator('button:has-text("Status")').first();
    await statusToggle.click();
    const draftOption = page.locator('[role="option"]:has-text("Draft")');
    await draftOption.click();
    await page.waitForTimeout(1000);

    // Apply name filter that won't match the draft product
    const searchInput = page.locator('input[aria-label="Resource search"]');
    await searchInput.fill('nonexistent');
    await page.waitForTimeout(1000);

    // Verify empty state is shown
    await expect(page.locator('text=No API Products found')).toBeVisible();
    await expect(page.locator('text=No API Products match the filter criteria.')).toBeVisible();
  });
});
