import { test, expect, Page } from '@playwright/test';
import {
  impersonateUser,
  stopImpersonation,
  waitForPermissionsLoaded,
  navigateToAPIProducts,
  dismissConsoleTour,
  findRowWithPagination,
} from './helpers';

const filterIds = {
  Name: 'APIProductsNameFilter',
  Namespace: 'APIProductsNamespaceFilter',
  HTTPRoute: 'APIProductsHTTPRouteFilter',
  Status: 'APIProductsStatusFilter',
} as const;

type FilterName = keyof typeof filterIds;

const textFilterInput = (page: Page, filterName: 'Name' | 'Namespace') =>
  page.locator(`[data-ouia-component-id="${filterIds[filterName]}-input"]`).getByRole('textbox');

const selectFilter = async (page: Page, filterName: FilterName) => {
  const filters = page.locator('[data-ouia-component-id="APIProductsDataViewFilters"]');
  const attributeToggle = filters.locator('.pf-v6-c-menu-toggle').first();
  if ((await attributeToggle.textContent())?.trim() !== filterName) {
    await attributeToggle.click();
    await filters.getByRole('menuitem', { name: filterName, exact: true }).click();
  }
};

const fillTextFilter = async (page: Page, filterName: 'Name' | 'Namespace', value: string) => {
  await selectFilter(page, filterName);
  await textFilterInput(page, filterName).fill(value);
};

const selectCheckboxFilter = async (
  page: Page,
  filterName: 'HTTPRoute' | 'Status',
  option?: string,
) => {
  await selectFilter(page, filterName);
  const toggle = page.locator(`[data-ouia-component-id="${filterIds[filterName]}-toggle"]`);
  await toggle.click();
  const menu = page.locator(`[data-ouia-component-id="${filterIds[filterName]}-menu"]`);
  const menuItems = menu.getByRole('menuitem');
  const item = option
    ? menu.getByRole('menuitem', { name: option, exact: true })
    : menuItems.first();
  const value = (await item.textContent())?.trim() || '';
  await item.click();
  return { toggle, value };
};

const toolbarChip = (page: Page, text: string) =>
  page.locator(`.pf-v6-c-toolbar .pf-v6-c-label.pf-m-filled:has-text("${text}")`);

test.describe('APIProduct List Page - Display and Filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await impersonateUser(page, 'test-admin');
    await navigateToAPIProducts(page);
    await dismissConsoleTour(page);
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('displays API Products list with correct columns', { tag: '@nightly' }, async ({ page }) => {
    await waitForPermissionsLoaded(page);

    // Verify page title
    await expect(page.locator('h1:has-text("API Products")')).toBeVisible({ timeout: 15_000 });

    // Wait for table to load
    const table = page.locator('[data-ouia-component-id="APIProductsDataView"]');
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

  test('displays API Products from test fixtures', { tag: '@nightly' }, async ({ page }) => {
    await waitForPermissionsLoaded(page);

    // Wait for table rows to load
    for (const row of await page
      .locator('[data-ouia-component-id^="APIProductsDataView-tr-"]')
      .all())
      await expect(row).toBeVisible({ timeout: 15_000 });

    // Verify our test API Products are displayed (paginating if needed)
    expect(await findRowWithPagination(page, 'gamestore-api')).toBe(true);
    expect(await findRowWithPagination(page, 'payment-api')).toBe(true);
    expect(await findRowWithPagination(page, 'draft-api')).toBe(true);

    // Verify we have more than 4 API Products total (check pagination text)
    await expect(page.locator('.pf-v6-c-pagination')).toBeVisible();
    const paginationText = await page.locator('.pf-v6-c-pagination__nav-page-select').textContent();
    const totalPages = parseInt(paginationText?.match(/of\s+(\d+)/)?.[1] ?? '1');
    expect(totalPages).toBeGreaterThan(1);
  });

  test('displays correct status labels', { tag: '@nightly' }, async ({ page }) => {
    await waitForPermissionsLoaded(page);

    // Wait for table to load
    await expect(
      page.locator('[data-ouia-component-id^="APIProductsDataView-tr-"]').first(),
    ).toBeVisible({ timeout: 15_000 });

    // Verify Published status labels (green)
    const publishedCount = await page
      .locator('.pf-v6-c-label.pf-m-green:has-text("Published")')
      .count();
    expect(publishedCount).toBeGreaterThanOrEqual(3);

    // Verify Draft status labels (orange)
    const draftCount = await page.locator('.pf-v6-c-label.pf-m-orange:has-text("Draft")').count();
    expect(draftCount).toBeGreaterThanOrEqual(1);
  });

  test('displays PlanPolicy links correctly', { tag: '@nightly' }, async ({ page }) => {
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

  test('displays tags with correct styling', { tag: '@nightly' }, async ({ page }) => {
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
    await page.waitForLoadState('domcontentloaded');
    await impersonateUser(page, 'test-admin');
    await navigateToAPIProducts(page);
    await dismissConsoleTour(page);
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('filters by Published status', { tag: '@nightly' }, async ({ page }) => {
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load (paginating if needed)
    expect(await findRowWithPagination(page, 'draft-api')).toBe(true);

    await selectCheckboxFilter(page, 'Status', 'Published');

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Verify filter label is shown
    await expect(toolbarChip(page, 'Published')).toBeVisible();

    // Verify only Published products are shown
    await expect(page.locator('a:has-text("toystore-api")')).toBeVisible();
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible();
    await expect(page.locator('a:has-text("payment-api")')).toBeVisible();

    // Verify Draft product is NOT shown
    await expect(page.locator('a:has-text("draft-api")')).not.toBeVisible();
  });

  test('filters by Draft status', { tag: '@nightly' }, async ({ page }) => {
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    await selectCheckboxFilter(page, 'Status', 'Draft');

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Verify filter label is shown
    await expect(toolbarChip(page, 'Draft')).toBeVisible();

    // Verify only Draft product is shown
    await expect(page.locator('a:has-text("draft-api")')).toBeVisible();

    // Verify Published products are NOT shown
    await expect(page.locator('a:has-text("gamestore-api")')).not.toBeVisible();
  });

  test(
    'clears status filter when clicking X on filter label',
    { tag: '@nightly' },
    async ({ page }) => {
      await waitForPermissionsLoaded(page);

      await selectCheckboxFilter(page, 'Status', 'Published');

      // Wait for filter to apply
      await page.waitForTimeout(1000);

      // Verify filter is active
      const filterLabel = toolbarChip(page, 'Published');
      await expect(filterLabel).toBeVisible();

      // Verify Draft API is not shown
      await expect(page.locator('a:has-text("draft-api")')).not.toBeVisible();

      // Click the X button to clear filter
      await filterLabel.getByRole('button').click();

      // Wait for filter to clear
      await page.waitForTimeout(1000);

      // Verify all products are shown again (paginating if needed)
      expect(await findRowWithPagination(page, 'draft-api')).toBe(true);

      // Verify filter label is gone
      await expect(filterLabel).not.toBeVisible();
    },
  );
});

test.describe('APIProduct List Page - Name Filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await impersonateUser(page, 'test-admin');
    await navigateToAPIProducts(page);
    await dismissConsoleTour(page);
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('filters by name (partial match)', { tag: '@nightly' }, async ({ page }) => {
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Verify Name filter is selected by default
    const filterTypeToggle = page
      .locator('[data-ouia-component-id="APIProductsDataViewFilters"]')
      .locator('.pf-v6-c-menu-toggle')
      .first();
    await expect(filterTypeToggle).toBeVisible();

    // Type into search input
    await fillTextFilter(page, 'Name', 'gamestore');

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Verify only gamestore-api is shown
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible();

    // Verify other products are NOT shown
    await expect(page.locator('a:has-text("draft-api")')).not.toBeVisible();
    await expect(page.locator('a:has-text("payment-api")')).not.toBeVisible();
  });

  test('filters by name (case insensitive)', { tag: '@nightly' }, async ({ page }) => {
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load (paginating if needed)
    expect(await findRowWithPagination(page, 'payment-api')).toBe(true);

    // Type uppercase into search input
    await fillTextFilter(page, 'Name', 'PAYMENT');

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Verify payment-api is shown (case insensitive match)
    await expect(page.locator('a:has-text("payment-api")')).toBeVisible();
  });

  test(
    'shows empty state when no results match name filter',
    { tag: '@nightly' },
    async ({ page }) => {
      await waitForPermissionsLoaded(page);

      // Wait for initial data to load
      await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

      // Type non-matching search
      await fillTextFilter(page, 'Name', 'nonexistent-api');

      // Wait for filter to apply
      await page.waitForTimeout(1000);

      // Verify empty state is shown
      await expect(page.locator('text=No API Products found')).toBeVisible();
      await expect(page.locator('text=No API Products match the filter criteria.')).toBeVisible();
    },
  );

  test('clears name filter when input is cleared', { tag: '@nightly' }, async ({ page }) => {
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Apply name filter
    await fillTextFilter(page, 'Name', 'someapi');
    await page.waitForTimeout(1000);

    // Verify filter is active
    await expect(page.locator('a:has-text("gamestore-api")')).not.toBeVisible();

    // Clear the input
    await textFilterInput(page, 'Name').clear();
    await page.waitForTimeout(1000);

    // Verify all products are shown again (paginating if needed)
    expect(await findRowWithPagination(page, 'draft-api')).toBe(true);
    expect(await findRowWithPagination(page, 'gamestore-api')).toBe(true);
    expect(await findRowWithPagination(page, 'payment-api')).toBe(true);
  });
});

test.describe('APIProduct List Page - Namespace Filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await impersonateUser(page, 'test-admin');
    await navigateToAPIProducts(page);
    await dismissConsoleTour(page);
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('switches to namespace filter type', { tag: '@nightly' }, async ({ page }) => {
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Verify Name filter is selected by default
    const filterTypeToggle = page
      .locator('[data-ouia-component-id="APIProductsDataViewFilters"]')
      .locator('.pf-v6-c-menu-toggle')
      .first();
    await expect(filterTypeToggle).toBeVisible();

    await selectFilter(page, 'Namespace');

    // Verify filter type changed to Namespace
    await expect(filterTypeToggle).toHaveText(/Namespace/);
  });

  test('filters by namespace (partial match)', { tag: '@nightly' }, async ({ page }) => {
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    await fillTextFilter(page, 'Namespace', 'kuadrant-test');
    await page.waitForTimeout(1000);

    // Verify products in the kuadrant-test namespace are shown
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible();

    // Verify filter label is shown
    const filterLabel = page.locator('.pf-v6-c-label:has-text("kuadrant-test")');
    await expect(filterLabel).toBeVisible();
  });

  test('clears namespace filter when input is cleared', { tag: '@nightly' }, async ({ page }) => {
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    await fillTextFilter(page, 'Namespace', 'somenamespace');
    await page.waitForTimeout(1000);

    // Clear the input
    await textFilterInput(page, 'Namespace').clear();
    await page.waitForTimeout(1000);

    // Verify all products are shown again
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible();
  });
});

test.describe('APIProduct List Page - HTTPRoute Filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await impersonateUser(page, 'test-admin');
    await navigateToAPIProducts(page);
    await dismissConsoleTour(page);
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('switches to HTTPRoute filter type', { tag: '@nightly' }, async ({ page }) => {
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Verify Name filter is selected by default
    const filterTypeToggle = page
      .locator('[data-ouia-component-id="APIProductsDataViewFilters"]')
      .locator('.pf-v6-c-menu-toggle')
      .first();
    await expect(filterTypeToggle).toBeVisible();

    await selectFilter(page, 'HTTPRoute');

    // Verify filter type changed to HTTPRoute
    await expect(filterTypeToggle).toHaveText(/HTTPRoute/);

    // Verify the select menu toggle is shown
    const selectToggle = page.locator(
      '[data-ouia-component-id="APIProductsHTTPRouteFilter-toggle"]',
    );
    await expect(selectToggle).toBeVisible();
  });

  test('filters by HTTPRoute', { tag: '@nightly' }, async ({ page }) => {
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    const { toggle: selectToggle } = await selectCheckboxFilter(page, 'HTTPRoute');

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Verify filter badge shows count
    const badge = selectToggle.locator('.pf-v6-c-badge');
    await expect(badge).toBeVisible();
  });

  test(
    'clears HTTPRoute filter when clicking X on filter label',
    { tag: '@nightly' },
    async ({ page }) => {
      await waitForPermissionsLoaded(page);

      // Wait for initial data to load
      await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

      const { value: routeText } = await selectCheckboxFilter(page, 'HTTPRoute');
      await page.waitForTimeout(1000);

      // Verify filter label is shown
      const filterLabel = page.locator('.pf-v6-c-label').filter({ hasText: routeText }).first();
      await expect(filterLabel).toBeVisible();

      // press escape in order to hide dropdown menu
      await page.keyboard.press('Escape');

      // Click the X button to clear filter
      await filterLabel.getByRole('button').click();
      await page.waitForTimeout(1000);

      // Verify filter label is gone
      await expect(filterLabel).not.toBeVisible();

      // Verify all products are shown again
      await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible();
    },
  );

  test('selects multiple HTTPRoutes', { tag: '@nightly' }, async ({ page }) => {
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    await selectFilter(page, 'HTTPRoute');
    const selectToggle = page.locator(
      '[data-ouia-component-id="APIProductsHTTPRouteFilter-toggle"]',
    );
    await selectToggle.click();
    await page.waitForTimeout(500);

    // Select first route
    const menu = page.locator('[data-ouia-component-id="APIProductsHTTPRouteFilter-menu"]');
    const routes = await menu.getByRole('menuitem').all();
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
    await page.waitForLoadState('domcontentloaded');
    await impersonateUser(page, 'test-admin');
    await navigateToAPIProducts(page);
    await dismissConsoleTour(page);
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('applies both status and name filters together', { tag: '@nightly' }, async ({ page }) => {
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    // Apply status filter (Published)
    await selectCheckboxFilter(page, 'Status', 'Published');
    await page.waitForTimeout(1000);

    // Apply name filter (partial match "store")
    await fillTextFilter(page, 'Name', 'store');
    await page.waitForTimeout(1000);

    // Verify both filter labels are shown
    await expect(toolbarChip(page, 'Published')).toBeVisible();
    await expect(toolbarChip(page, 'store')).toBeVisible();

    // Verify only Published products with "store" in name are shown
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible();

    // Verify payment-api is NOT shown (doesn't have "store" in name)
    await expect(page.locator('a:has-text("payment-api")')).not.toBeVisible();

    // Verify draft-api is NOT shown (status is Draft, not Published)
    await expect(page.locator('a:has-text("draft-api")')).not.toBeVisible();
  });

  test('applies status and namespace filters together', { tag: '@nightly' }, async ({ page }) => {
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    await selectCheckboxFilter(page, 'Status', 'Published');
    await page.waitForTimeout(1000);

    await fillTextFilter(page, 'Namespace', 'kuadrant-test');
    await page.waitForTimeout(1000);

    // Verify both filter labels are shown
    await expect(toolbarChip(page, 'Published')).toBeVisible();
    await expect(toolbarChip(page, 'kuadrant-test')).toBeVisible();

    // Verify only Published products in kuadrant-test namespace are shown
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible();
  });

  test('applies status and HTTPRoute filters together', { tag: '@nightly' }, async ({ page }) => {
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    await selectCheckboxFilter(page, 'Status', 'Published');
    await page.waitForTimeout(1000);

    const { toggle: selectToggle } = await selectCheckboxFilter(page, 'HTTPRoute');
    await page.waitForTimeout(1000);

    // Verify status filter label is shown
    await expect(toolbarChip(page, 'Published')).toBeVisible();

    // Verify HTTPRoute filter badge is shown
    const badge = selectToggle.locator('.pf-v6-c-badge');
    await expect(badge).toBeVisible();
  });

  test(
    'shows empty state when combined filters match nothing',
    { tag: '@nightly' },
    async ({ page }) => {
      await waitForPermissionsLoaded(page);

      // Wait for initial data to load
      await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

      await selectCheckboxFilter(page, 'Status', 'Draft');
      await page.waitForTimeout(1000);

      await fillTextFilter(page, 'Name', 'nonexistent');
      await page.waitForTimeout(1000);

      // Verify empty state is shown
      await expect(page.locator('text=No API Products found')).toBeVisible();
      await expect(page.locator('text=No API Products match the filter criteria.')).toBeVisible();
    },
  );

  test('clear all filters restores full list', { tag: '@nightly' }, async ({ page }) => {
    await waitForPermissionsLoaded(page);

    // Wait for initial data to load
    await expect(page.locator('a:has-text("gamestore-api")')).toBeVisible({ timeout: 15_000 });

    await selectCheckboxFilter(page, 'Status', 'Published');
    await page.waitForTimeout(500);

    await fillTextFilter(page, 'Name', 'game');
    await page.waitForTimeout(500);

    // Verify both filter chips are shown
    await expect(toolbarChip(page, 'Published')).toBeVisible();
    await expect(toolbarChip(page, 'game')).toBeVisible();

    await page
      .locator('[data-ouia-component-id="APIProductsDataViewToolbar-clear-all-filters"]')
      .click();
    await page.waitForTimeout(1000);

    // Verify filter chips are gone
    await expect(toolbarChip(page, 'Published')).not.toBeVisible();
    await expect(toolbarChip(page, 'game')).not.toBeVisible();

    // Verify full list restored (draft-api visible, paginating if needed)
    expect(await findRowWithPagination(page, 'draft-api')).toBe(true);
  });
});
