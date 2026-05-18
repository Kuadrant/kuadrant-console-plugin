import { test, expect } from '@playwright/test';
import { impersonateUser, stopImpersonation, waitForPermissionsLoaded } from './helpers';

const navigateToAPIProducts = async (page, namespace = 'kuadrant-test') => {
  await page.evaluate((ns) => {
    window.history.pushState({}, '', `/kuadrant/apiproducts/ns/${ns}`);
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
    const rows = await page.locator('tbody tr[data-key]').all();
    expect(rows.length).toBeGreaterThan(4);
  });

  test('displays correct status labels', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for table to load
    await expect(page.locator('tbody tr[data-key]').first()).toBeVisible({ timeout: 15_000 });

    // Verify Published status labels (green)
    const publishedCount = await page
      .locator('.pf-v6-c-label.pf-m-green:has-text("Published")')
      .count();
    expect(publishedCount).toBeGreaterThanOrEqual(3);

    // Verify Draft status labels (orange)
    const draftCount = await page.locator('.pf-v6-c-label.pf-m-orange:has-text("Draft")').count();
    expect(draftCount).toBeGreaterThanOrEqual(1);
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
    const statusToggle = page
      .locator('button#status-filter-menu-toggle:has-text("Status")')
      .first();
    await statusToggle.click();

    // Select "Published" option
    const publishedOption = page.locator(
      'ul#status-filter-select-list [role="menuitem"]:has-text("Published")',
    );
    await publishedOption.click();

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Verify filter label is shown
    await expect(page.locator('.pf-m-outline:has-text("Published")')).toBeVisible();

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
    const statusToggle = page
      .locator('button#status-filter-menu-toggle:has-text("Status")')
      .first();
    await statusToggle.click();

    // Select "Draft" option
    const draftOption = page.locator(
      'ul#status-filter-select-list [role="menuitem"]:has-text("Draft")',
    );
    await draftOption.click();

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Verify filter label is shown
    await expect(page.locator('.pf-m-outline:has-text("Draft")')).toBeVisible();

    // Verify only Draft product is shown
    await expect(page.locator('a:has-text("draft-api")')).toBeVisible();

    // Verify Published products are NOT shown
    await expect(page.locator('a:has-text("gamestore-api")')).not.toBeVisible();
  });

  test('clears status filter when clicking X on filter label', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Apply Published filter
    const statusToggle = page
      .locator('button#status-filter-menu-toggle:has-text("Status")')
      .first();
    await statusToggle.click();
    const publishedOption = page.locator(
      'ul#status-filter-select-list [role="menuitem"]:has-text("Published")',
    );
    await publishedOption.click();

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Verify filter is active
    const filterLabel = page.locator('.pf-m-outline:has-text("Published")');
    await expect(filterLabel).toBeVisible();

    // Verify Draft API is not shown
    await expect(page.locator('a:has-text("draft-api")')).not.toBeVisible();

    // Click the X button to clear filter
    const closeButton = page.locator('button[aria-label="Close label group"]').first();
    await closeButton.click();

    // Wait for filter to clear
    await page.waitForTimeout(1000);

    // Verify all products are shown again
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

test.describe('APIProduct List Page - Namespace Filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await impersonateUser(page, 'test-admin');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('switches to namespace filter type', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Verify Name filter is selected by default
    const filterTypeToggle = page
      .locator('button#composite-filter-menu-toggle:has-text("Name")')
      .first();
    await expect(filterTypeToggle).toBeVisible();

    // Click to open filter type dropdown
    await filterTypeToggle.click();

    // Select Namespace option
    const namespaceOption = page.locator(
      'ul#composite-filter-select-list [role="option"]:has-text("Namespace")',
    );
    await namespaceOption.click();

    // Verify filter type changed to Namespace
    await expect(
      page.locator('button#composite-filter-menu-toggle:has-text("Namespace")').first(),
    ).toBeVisible();
  });

  test('filters by namespace (partial match)', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Switch to Namespace filter
    const filterTypeToggle = page
      .locator('button#composite-filter-menu-toggle:has-text("Name")')
      .first();
    await filterTypeToggle.click();
    const namespaceOption = page.locator(
      'ul#composite-filter-select-list [role="option"]:has-text("Namespace")',
    );
    await namespaceOption.click();

    // Type into search input
    const searchInput = page.locator('input#composite-filter-search-by-input');
    await searchInput.fill('kuadrant-test');
    await page.waitForTimeout(1000);

    // Verify products in the kuadrant-test namespace are shown
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible();

    // Verify filter label is shown
    const filterLabel = page.locator('.pf-v6-c-label:has-text("kuadrant-test")');
    await expect(filterLabel).toBeVisible();
  });

  test('clears namespace filter when input is cleared', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Switch to Namespace filter and apply filter
    const filterTypeToggle = page
      .locator('button#composite-filter-menu-toggle:has-text("Name")')
      .first();
    await filterTypeToggle.click();
    const namespaceOption = page.locator(
      'ul#composite-filter-select-list [role="option"]:has-text("Namespace")',
    );
    await namespaceOption.click();

    const searchInput = page.locator('input#composite-filter-search-by-input');
    await searchInput.fill('somenamespace');
    await page.waitForTimeout(1000);

    // Clear the input
    await searchInput.clear();
    await page.waitForTimeout(1000);

    // Verify all products are shown again
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible();
  });
});

test.describe('APIProduct List Page - HTTPRoute Filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await impersonateUser(page, 'test-admin');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('switches to HTTPRoute filter type', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Verify Name filter is selected by default
    const filterTypeToggle = page
      .locator('button#composite-filter-menu-toggle:has-text("Name")')
      .first();
    await expect(filterTypeToggle).toBeVisible();

    // Click to open filter type dropdown
    await filterTypeToggle.click();

    // Select HTTPRoute option
    const httpRouteOption = page.locator('[role="option"]:has-text("HTTPRoute")');
    await httpRouteOption.click();

    // Verify filter type changed to HTTPRoute
    await expect(page.locator('button:has-text("HTTPRoute")').first()).toBeVisible();

    // Verify the select menu toggle is shown
    const selectToggle = page.locator('button:has-text("Select HTTPRoute...")');
    await expect(selectToggle).toBeVisible();
  });

  test('filters by HTTPRoute', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Switch to HTTPRoute filter
    const filterTypeToggle = page
      .locator('button#composite-filter-menu-toggle:has-text("Name")')
      .first();
    await filterTypeToggle.click();
    const httpRouteOption = page.locator(
      'ul#composite-filter-select-list [role="option"]:has-text("HTTPRoute")',
    );
    await httpRouteOption.click();

    // Open HTTPRoute selection menu
    const selectToggle = page.locator('button:has-text("Select HTTPRoute...")');
    await selectToggle.click();

    // Wait for menu to appear and select first route option
    await page.waitForTimeout(500);
    const firstRoute = page.locator('[role="menuitem"]').first();
    await firstRoute.click();

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Verify filter badge shows count
    const badge = selectToggle.locator('.pf-v6-c-badge');
    await expect(badge).toBeVisible();
  });

  test('clears HTTPRoute filter when clicking X on filter label', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Switch to HTTPRoute filter
    const filterTypeToggle = page
      .locator('button#composite-filter-menu-toggle:has-text("Name")')
      .first();
    await filterTypeToggle.click();
    const httpRouteOption = page.locator(
      'ul#composite-filter-select-list [role="option"]:has-text("HTTPRoute")',
    );
    await httpRouteOption.click();

    // Open HTTPRoute selection menu and select a route
    const selectToggle = page.locator('button:has-text("Select HTTPRoute...")');
    await selectToggle.click();
    await page.waitForTimeout(500);
    const firstRoute = page.locator('[role="menuitem"]').first();
    const routeText = await firstRoute.textContent();
    await firstRoute.click();
    await page.waitForTimeout(1000);

    // Verify filter label is shown
    const filterLabel = page.locator(`.pf-v6-c-label:has-text("${routeText}")`);
    await expect(filterLabel).toBeVisible();

    // press escape in order to hide dropdown menu
    await page.keyboard.press('Escape');

    // Click the X button to clear filter
    const closeButton = page.locator('button[aria-label="Close label group"]').first();
    await closeButton.click();
    await page.waitForTimeout(1000);

    // Verify filter label is gone
    await expect(filterLabel).not.toBeVisible();

    // Verify all products are shown again
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible();
  });

  test('selects multiple HTTPRoutes', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Switch to HTTPRoute filter
    const filterTypeToggle = page
      .locator('button#composite-filter-menu-toggle:has-text("Name")')
      .first();
    await filterTypeToggle.click();
    const httpRouteOption = page.locator(
      'ul#composite-filter-select-list [role="option"]:has-text("HTTPRoute")',
    );
    await httpRouteOption.click();

    // Open HTTPRoute selection menu and select multiple routes
    const selectToggle = page.locator('button:has-text("Select HTTPRoute...")');
    await selectToggle.click();
    await page.waitForTimeout(500);

    // Select first route
    const routes = await page.locator('[role="menuitem"]').all();
    if (routes.length >= 2) {
      await routes[0].click();
      await page.waitForTimeout(500);

      // Select second route
      await routes[1].click();
      await page.waitForTimeout(1000);

      // Verify badge shows count of 2
      const badge = selectToggle.locator('.pf-v6-c-badge');
      await expect(badge).toHaveText('2');
    }
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
    const statusToggle = page
      .locator('button#status-filter-menu-toggle:has-text("Status")')
      .first();
    await statusToggle.click();
    const publishedOption = page.locator(
      'ul#status-filter-select-list [role="menuitem"]:has-text("Published")',
    );
    await publishedOption.click();
    await page.waitForTimeout(1000);

    // Apply name filter (partial match "store")
    const searchInput = page.locator('input#composite-filter-search-by-input');
    await searchInput.fill('store');
    await page.waitForTimeout(1000);

    // Verify both filter labels are shown
    await expect(page.locator('.pf-m-outline:has-text("Published")')).toBeVisible();
    await expect(page.locator('.pf-m-outline:has-text("store")')).toBeVisible();

    // Verify only Published products with "store" in name are shown
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible();

    // Verify payment-api is NOT shown (doesn't have "store" in name)
    await expect(page.locator('a:has-text("payment-api")')).not.toBeVisible();

    // Verify draft-api is NOT shown (status is Draft, not Published)
    await expect(page.locator('a:has-text("draft-api")')).not.toBeVisible();
  });

  test('applies status and namespace filters together', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Apply status filter (Published)
    const statusToggle = page
      .locator('button#status-filter-menu-toggle:has-text("Status")')
      .first();
    await statusToggle.click();
    const publishedOption = page.locator(
      'ul#status-filter-select-list [role="menuitem"]:has-text("Published")',
    );
    await publishedOption.click();
    await page.waitForTimeout(1000);

    // Switch to Namespace filter
    const filterTypeToggle = page
      .locator('button#composite-filter-menu-toggle:has-text("Name")')
      .first();
    await filterTypeToggle.click();
    const namespaceOption = page.locator(
      'ul#composite-filter-select-list [role="option"]:has-text("Namespace")',
    );
    await namespaceOption.click();

    // Apply namespace filter
    const searchInput = page.locator('input#composite-filter-search-by-input');
    await searchInput.fill('kuadrant-test');
    await page.waitForTimeout(1000);

    // Verify both filter labels are shown
    await expect(page.locator('.pf-m-outline:has-text("Published")')).toBeVisible();
    await expect(page.locator('.pf-m-outline:has-text("kuadrant-test")')).toBeVisible();

    // Verify only Published products in kuadrant-test namespace are shown
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible();
  });

  test('applies status and HTTPRoute filters together', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Apply status filter (Published)
    const statusToggle = page
      .locator('button#status-filter-menu-toggle:has-text("Status")')
      .first();
    await statusToggle.click();
    const publishedOption = page.locator(
      'ul#status-filter-select-list [role="menuitem"]:has-text("Published")',
    );
    await publishedOption.click();
    await page.waitForTimeout(1000);

    // Switch to HTTPRoute filter
    const filterTypeToggle = page
      .locator('button#composite-filter-menu-toggle:has-text("Name")')
      .first();
    await filterTypeToggle.click();
    const httpRouteOption = page.locator(
      'ul#composite-filter-select-list [role="option"]:has-text("HTTPRoute")',
    );
    await httpRouteOption.click();

    // Open HTTPRoute selection menu and select a route
    const selectToggle = page.locator('button:has-text("Select HTTPRoute...")');
    await selectToggle.click();
    await page.waitForTimeout(500);
    const firstRoute = page.locator('[role="menuitem"]').first();
    await firstRoute.click();
    await page.waitForTimeout(1000);

    // Verify status filter label is shown
    await expect(page.locator('.pf-m-outline:has-text("Published")')).toBeVisible();

    // Verify HTTPRoute filter badge is shown
    const badge = selectToggle.locator('.pf-v6-c-badge');
    await expect(badge).toBeVisible();
  });

  test('shows empty state when combined filters match nothing', async ({ page }) => {
    await navigateToAPIProducts(page);
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Apply status filter (Draft)
    const statusToggle = page
      .locator('button#status-filter-menu-toggle:has-text("Status")')
      .first();
    await statusToggle.click();
    const draftOption = page.locator(
      'ul#status-filter-select-list [role="menuitem"]:has-text("Draft")',
    );
    await draftOption.click();
    await page.waitForTimeout(1000);

    // Apply name filter that won't match the draft product
    const searchInput = page.locator('input#composite-filter-search-by-input');
    await searchInput.fill('nonexistent');
    await page.waitForTimeout(1000);

    // Verify empty state is shown
    await expect(page.locator('text=No API Products found')).toBeVisible();
    await expect(page.locator('text=No API Products match the filter criteria.')).toBeVisible();
  });
});
