import { expect, Page, test } from '@playwright/test';
import {
  TEST_NAMESPACE,
  dismissConsoleTour,
  impersonateUser,
  navigateToPolicies,
  spaNavigate,
  stopImpersonation,
  waitForPermissionsLoaded,
} from './helpers';

type FilterName = 'Name' | 'Namespace' | 'Owner' | 'Requester' | 'Status' | 'Type';

const filterChip = (page: Page, value: string) =>
  page
    .locator('.pf-v6-c-label.pf-m-filled')
    .filter({ has: page.getByText(value, { exact: true }) });

async function openConsole(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await dismissConsoleTour(page);
}

async function selectFilter(page: Page, filtersId: string, filterName: FilterName) {
  const filters = page.locator(`[data-ouia-component-id="${filtersId}"]`);
  const attributeToggle = filters.locator('.pf-v6-c-menu-toggle').first();
  if ((await attributeToggle.textContent())?.trim() !== filterName) {
    await attributeToggle.click();
    await filters.getByRole('menuitem', { name: filterName, exact: true }).click();
  }
}

async function fillTextFilter(
  page: Page,
  filtersId: string,
  filterName: FilterName,
  filterId: string,
  value: string,
) {
  await selectFilter(page, filtersId, filterName);
  await page
    .locator(`[data-ouia-component-id="${filterId}-input"]`)
    .getByRole('textbox')
    .fill(value);
}

const resourceRow = (page: Page, kind: string, name: string) =>
  page
    .getByRole('row')
    .filter({ has: page.getByRole('gridcell', { name: kind, exact: true }) })
    .filter({ has: page.getByRole('link', { name, exact: true }) });

async function selectCheckboxFilter(
  page: Page,
  filtersId: string,
  filterName: FilterName,
  filterId: string,
  value: string,
) {
  await selectFilter(page, filtersId, filterName);
  await page.locator(`[data-ouia-component-id="${filterId}-toggle"]`).click();
  await page
    .locator(`[data-ouia-component-id="${filterId}-menu"]`)
    .getByRole('menuitem', { name: value, exact: true })
    .click();
}

test.describe('DataView regressions', () => {
  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test(
    'ResourceList filters by name, type, and namespace and clears combined filters',
    { tag: '@nightly' },
    async ({ page }) => {
      await openConsole(page);
      await impersonateUser(page, 'test-admin');
      await navigateToPolicies(page);
      await waitForPermissionsLoaded(page);

      const filtersId = 'ResourceListDataViewFilters';
      const authPolicyRow = resourceRow(page, 'AuthPolicy', 'test-auth-policy');
      const planPolicyRow = resourceRow(page, 'PlanPolicy', 'test-plan-policy');
      await expect(authPolicyRow).toBeVisible({ timeout: 15_000 });
      await expect(planPolicyRow).toBeVisible();

      await fillTextFilter(page, filtersId, 'Name', 'ResourceListNameFilter', 'test-auth-policy');
      await expect(filterChip(page, 'test-auth-policy')).toBeVisible();
      await expect(authPolicyRow).toBeVisible();
      await expect(planPolicyRow).not.toBeVisible();

      await page
        .locator('[data-ouia-component-id="ResourceListNameFilter-input"]')
        .getByRole('textbox')
        .clear();
      await fillTextFilter(page, filtersId, 'Type', 'ResourceListTypeFilter', 'PlanPolicy');
      await expect(filterChip(page, 'PlanPolicy')).toBeVisible();
      await expect(planPolicyRow).toBeVisible();
      await expect(authPolicyRow).not.toBeVisible();

      await fillTextFilter(
        page,
        filtersId,
        'Namespace',
        'ResourceListNamespaceFilter',
        TEST_NAMESPACE,
      );
      await expect(filterChip(page, 'PlanPolicy')).toBeVisible();
      await expect(filterChip(page, TEST_NAMESPACE)).toBeVisible();
      await expect(planPolicyRow).toBeVisible();

      await page
        .locator('[data-ouia-component-id="ResourceListDataViewToolbar-clear-all-filters"]')
        .click();
      await expect(filterChip(page, 'PlanPolicy')).not.toBeVisible();
      await expect(filterChip(page, TEST_NAMESPACE)).not.toBeVisible();
      await expect(authPolicyRow).toBeVisible();
      await expect(planPolicyRow).toBeVisible();
    },
  );

  test(
    'My API Keys preserves all filters and opens delete for the named sorted row',
    { tag: '@smoke' },
    async ({ page }) => {
      await openConsole(page);
      await impersonateUser(page, 'test-admin');
      await spaNavigate(page, '/kuadrant/apikeys/ns/consumer-alice');

      const filtersId = 'MyAPIKeysDataViewFilters';
      const keyName = 'alice-api-key';
      const keyRow = page.locator(`tr:has-text("${keyName}")`);
      await expect(keyRow).toBeVisible({ timeout: 15_000 });

      await fillTextFilter(page, filtersId, 'Name', 'MyAPIKeysNameFilter', keyName);
      await expect(filterChip(page, keyName)).toBeVisible();
      await expect(keyRow).toBeVisible();

      await selectCheckboxFilter(page, filtersId, 'Status', 'MyAPIKeysStatusFilter', 'Pending');
      await expect(filterChip(page, 'Pending')).toBeVisible();
      await expect(keyRow).toBeVisible();

      await fillTextFilter(page, filtersId, 'Owner', 'MyAPIKeysOwnerFilter', 'alice');
      await expect(filterChip(page, keyName)).toBeVisible();
      await expect(filterChip(page, 'Pending')).toBeVisible();
      await expect(filterChip(page, 'alice')).toBeVisible();
      await expect(keyRow).toBeVisible();

      await page
        .locator('[data-ouia-component-id="MyAPIKeysDataViewToolbar-clear-all-filters"]')
        .click();
      await expect(filterChip(page, keyName)).not.toBeVisible();
      await expect(filterChip(page, 'Pending')).not.toBeVisible();
      await expect(filterChip(page, 'alice')).not.toBeVisible();

      await fillTextFilter(page, filtersId, 'Name', 'MyAPIKeysNameFilter', keyName);
      await page
        .locator('[data-ouia-component-id="MyAPIKeysDataView"]')
        .getByRole('button', { name: 'Name' })
        .click();
      await keyRow.getByRole('button', { name: 'Actions' }).click();
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();

      const modal = page.getByRole('dialog');
      await expect(modal.getByRole('heading', { name: 'Delete API Key?' })).toBeVisible();
      await expect(modal.locator('strong')).toHaveText(keyName);
      await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(modal).not.toBeVisible();
      await expect(keyRow).toBeVisible();
    },
  );

  test(
    'API Product API Keys filters by name, status, and requester and clears combinations',
    { tag: '@nightly' },
    async ({ page }) => {
      await page.route('**/api/kubernetes/apis/user.openshift.io/v1/users/~', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ metadata: { name: 'test-api-owner' } }),
        }),
      );
      await openConsole(page);
      await impersonateUser(page, 'test-api-owner');
      await spaNavigate(
        page,
        `/k8s/ns/${TEST_NAMESPACE}/devportal.kuadrant.io~v1alpha1~APIProduct/test-approval-product/apikeys`,
      );

      const filtersId = 'APIProductAPIKeysDataViewFilters';
      const aliceRow = page.locator('tr:has-text("alice-api-key")');
      const bobRow = page.locator('tr:has-text("bob-api-key")');
      await expect(aliceRow).toBeVisible({ timeout: 30_000 });

      await fillTextFilter(page, filtersId, 'Name', 'APIProductAPIKeysNameFilter', 'alice-api-key');
      await expect(filterChip(page, 'alice-api-key')).toBeVisible();
      await expect(aliceRow).toBeVisible();
      await expect(bobRow).not.toBeVisible();

      await selectCheckboxFilter(
        page,
        filtersId,
        'Status',
        'APIProductAPIKeysStatusFilter',
        'Pending',
      );
      await expect(filterChip(page, 'Pending')).toBeVisible();
      await expect(aliceRow).toBeVisible();

      await fillTextFilter(
        page,
        filtersId,
        'Requester',
        'APIProductAPIKeysRequesterFilter',
        'alice',
      );
      await expect(filterChip(page, 'alice-api-key')).toBeVisible();
      await expect(filterChip(page, 'Pending')).toBeVisible();
      await expect(filterChip(page, 'alice')).toBeVisible();
      await expect(aliceRow).toBeVisible();

      await page
        .locator('[data-ouia-component-id="APIProductAPIKeysDataViewToolbar-clear-all-filters"]')
        .click();
      await expect(filterChip(page, 'alice-api-key')).not.toBeVisible();
      await expect(filterChip(page, 'Pending')).not.toBeVisible();
      await expect(filterChip(page, 'alice')).not.toBeVisible();
      await expect(aliceRow).toBeVisible();
      await expect(bobRow).toBeVisible();
    },
  );
});
