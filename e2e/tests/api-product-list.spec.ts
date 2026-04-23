import { test, expect } from '@playwright/test';
import { impersonateUser, stopImpersonation, waitForPermissionsLoaded } from './helpers';

const navigateToAPIProducts = async (page, namespace = 'kuadrant-test') => {
  await page.evaluate((ns) => {
    window.history.pushState({}, '', `/k8s/ns/${ns}/devportal.kuadrant.io~v1alpha1~APIProduct`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, namespace);
  await page.waitForLoadState('networkidle');
};

const navigateToAPIProductsAllNamespaces = async (page) => {
  await page.evaluate(() => {
    window.history.pushState(
      {},
      '',
      '/k8s/all-namespaces/devportal.kuadrant.io~v1alpha1~APIProduct',
    );
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
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
    await expect(page.locator('a:has-text("toystore-api")')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('a:has-text("payment-api")')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('a:has-text("draft-api")')).toBeVisible({ timeout: 10_000 });

    // Verify we have at least 4 API Products
    const rows = page.locator('tbody tr[data-key]');
    await expect(rows).toHaveCount(4, { timeout: 10_000 });
  });

  test('displays correct status labels', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for Published status labels (green)
    const publishedLabels = page.locator('.pf-v6-c-label.pf-m-green:has-text("Published")');
    await expect(publishedLabels.first()).toBeVisible({ timeout: 15_000 });

    // Wait for Draft status label (orange)
    const draftLabel = page.locator('.pf-v6-c-label.pf-m-orange:has-text("Draft")');
    await expect(draftLabel).toBeVisible({ timeout: 10_000 });
  });

  test('displays PlanPolicy links correctly', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for table to load
    await page.waitForTimeout(2000); // Give time for PlanPolicy map to build

    // Find the row for toystore-api (has a PlanPolicy)
    const toystoreRow = page.locator('tr:has(a:has-text("toystore-api"))');
    await expect(toystoreRow).toBeVisible({ timeout: 15_000 });

    // Verify PlanPolicy link is present in the row
    const planPolicyLink = toystoreRow.locator('a:has-text("test-plan-policy")');
    await expect(planPolicyLink).toBeVisible({ timeout: 10_000 });
  });

  test('displays tags with correct styling', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for tag labels (teal color)
    const tagLabels = page.locator('.pf-v6-c-label.pf-m-teal');
    await expect(tagLabels.first()).toBeVisible({ timeout: 15_000 });

    // Verify specific tags exist
    await expect(page.locator('.pf-v6-c-label:has-text("demo")').first()).toBeVisible();
    await expect(page.locator('.pf-v6-c-label:has-text("retail")').first()).toBeVisible();
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
    await expect(page.locator('a:has-text("toystore-api")')).toBeVisible({ timeout: 15_000 });

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
    await expect(page.locator('a:has-text("toystore-api")')).not.toBeVisible();
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
    await expect(page.locator('a:has-text("toystore-api")')).toBeVisible({ timeout: 15_000 });

    // Verify Name filter is selected by default
    const filterTypeToggle = page.locator('button:has-text("Name")').first();
    await expect(filterTypeToggle).toBeVisible();

    // Type into search input
    const searchInput = page.locator('input[aria-label="Resource search"]');
    await searchInput.fill('toystore');

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Verify only toystore-api is shown
    await expect(page.locator('a:has-text("toystore-api")')).toBeVisible();

    // Verify other products are NOT shown
    await expect(page.locator('a:has-text("gamestore-api")')).not.toBeVisible();
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
    await expect(page.locator('a:has-text("toystore-api")')).toBeVisible({ timeout: 15_000 });

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
    await expect(page.locator('a:has-text("toystore-api")')).toBeVisible({ timeout: 15_000 });

    // Apply name filter
    const searchInput = page.locator('input[aria-label="Resource search"]');
    await searchInput.fill('toystore');
    await page.waitForTimeout(1000);

    // Verify filter is active
    await expect(page.locator('a:has-text("gamestore-api")')).not.toBeVisible();

    // Clear the input
    await searchInput.clear();
    await page.waitForTimeout(1000);

    // Verify all products are shown again
    await expect(page.locator('a:has-text("toystore-api")')).toBeVisible();
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible();
    await expect(page.locator('a:has-text("payment-api")')).toBeVisible();
  });
});

test.describe('APIProduct List Page - Namespace Filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await impersonateUser(page, 'test-admin');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('switches filter type to Namespace', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("toystore-api")')).toBeVisible({ timeout: 15_000 });

    // Click on filter type dropdown (initially shows "Name")
    const filterTypeToggle = page
      .locator('[data-ouia-component-id="OUIA-Generated-Toolbar-1"] button:has-text("Name")')
      .first();
    await filterTypeToggle.click();

    // Select "Namespace" option
    const namespaceOption = page.locator(
      '[data-ouia-component-type="PF6/Select"] button span span:has-text("Namespace")',
    );
    await namespaceOption.click();

    // Verify toggle now shows "Namespace"
    await expect(page.getByRole('button', { name: 'Namespace' }).nth(1)).toBeVisible();
  });

  test('filters by namespace in all-namespaces view', async ({ page }) => {
    await navigateToAPIProductsAllNamespaces(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load (both namespaces)
    await expect(page.locator('a:has-text("toystore-api")')).toBeVisible({ timeout: 15_000 });

    // Wait a bit longer to ensure all resources load
    await page.waitForTimeout(2000);

    // Switch to namespace filter
    const filterTypeToggle = page
      .locator('[data-ouia-component-id="OUIA-Generated-Toolbar-1"] button:has-text("Name")')
      .first();
    await filterTypeToggle.click();
    const namespaceOption = page.locator(
      '[data-ouia-component-type="PF6/Select"] button span span:has-text("Namespace")',
    );
    await namespaceOption.click();

    // Type namespace into search input
    const searchInput = page.locator('input[aria-label="Resource search"]');
    await searchInput.fill('kuadrant-test-2');

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Verify only products from kuadrant-test-2 namespace are shown
    await expect(page.locator('a:has-text("shipping-api")')).toBeVisible({ timeout: 10_000 });

    // Verify products from other namespaces are NOT shown
    await expect(page.locator('a:has-text("toystore-api")')).not.toBeVisible();
    await expect(page.locator('a:has-text("gamestore-api")')).not.toBeVisible();
  });

  test('filters by namespace (partial match)', async ({ page }) => {
    await navigateToAPIProductsAllNamespaces(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("toystore-api")')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2000);

    // Switch to namespace filter
    const filterTypeToggle = page
      .locator('[data-ouia-component-id="OUIA-Generated-Toolbar-1"] button:has-text("Name")')
      .first();
    await filterTypeToggle.click();
    const namespaceOption = page.locator(
      '[data-ouia-component-type="PF6/Select"] button span span:has-text("Namespace")',
    );
    await namespaceOption.click();

    // Type partial namespace into search input (matches "kuadrant-test" and "kuadrant-test-2")
    const searchInput = page.locator('input[aria-label="Resource search"]');
    await searchInput.fill('kuadrant-test');

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Verify products from both kuadrant-test namespaces are shown
    await expect(page.locator('a:has-text("toystore-api")')).toBeVisible();
    await expect(page.locator('a:has-text("shipping-api")')).toBeVisible();
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
    await expect(page.locator('a:has-text("toystore-api")')).toBeVisible({ timeout: 15_000 });

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
    await expect(page.locator('a:has-text("toystore-api")')).toBeVisible();
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
    await expect(page.locator('a:has-text("toystore-api")')).toBeVisible({ timeout: 15_000 });

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
