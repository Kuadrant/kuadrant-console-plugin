import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import {
  impersonateUser,
  stopImpersonation,
  navigateToAPIKeyApprovals,
  dismissConsoleTour,
} from './helpers';

// test-api-owner: ClusterRole with get/list apikeyrequests + CRUD apikeyapprovals.
// test-dev: no devportal.kuadrant.io access at all.
// fixtures: test-request-alice (gold, pending) + test-request-bob (silver, pending)
// both in kuadrant-test namespace, created by setup.sh.
//
// NOTE: the developer-portal-controller deletes APIKeyRequests after processing
// approvals/rejections. Tests that trigger approve/reject actions must re-create
// fixtures in beforeEach to ensure a clean starting state.

const FIXTURE_FILE = 'e2e/manifests/test-apikey-fixtures.yaml';

function applyFixtures(): void {
  // Delete any existing approvals so requests go back to Pending
  execSync(
    'kubectl delete apikeyapprovals -n kuadrant-test --all --ignore-not-found 2>/dev/null || true',
    { stdio: 'pipe' },
  );
  // Re-apply fixture requests (idempotent: recreates if deleted by controller)
  execSync(`kubectl apply -f ${FIXTURE_FILE}`, { stdio: 'pipe' });
}

test.describe('APIKey Approvals - RBAC', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissConsoleTour(page);
  });

  test('user without apikeyrequests access cannot see the approval table', async ({ page }) => {
    await impersonateUser(page, 'test-dev');
    await navigateToAPIKeyApprovals(page);

    // Wait for page to settle (may show spinner or no-permission depending on access review timing)
    await page.waitForLoadState('networkidle');

    // Regardless of which state appears, test-dev must never see the approval table
    await expect(page.locator('th:has-text("Requester")')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.locator('td:has-text("alice@example.com")')).not.toBeVisible();

    await stopImpersonation(page);
  });
});

test.describe('APIKey Approvals - Table', () => {
  test.beforeEach(async ({ page }) => {
    applyFixtures();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissConsoleTour(page);
    await impersonateUser(page, 'test-api-owner');
    await navigateToAPIKeyApprovals(page);
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('shows table with correct column headers', async ({ page }) => {
    await expect(page.locator('th:has-text("Requester")')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('th:has-text("API Product")')).toBeVisible();
    await expect(page.locator('th:has-text("Plan")')).toBeVisible();
    await expect(page.locator('th:has-text("Status")')).toBeVisible();
    await expect(page.locator('th:has-text("Actions")')).toBeVisible();
  });

  test('shows fixture requests with correct data', async ({ page }) => {
    await expect(page.locator('td:has-text("alice@example.com")')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('td:has-text("bob@startup.io")')).toBeVisible();
    // both are Pending (no status conditions set on fixtures)
    const pendingCells = page.locator('td:has-text("Pending")');
    await expect(pendingCells.first()).toBeVisible();
  });

  test('filter by requester shows only matching rows', async ({ page }) => {
    await expect(page.locator('td:has-text("alice@example.com")')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('td:has-text("bob@startup.io")')).toBeVisible();

    const filterInput = page.locator('[aria-label="Filter by requester"]');
    await filterInput.fill('alice');

    await expect(page.locator('td:has-text("alice@example.com")')).toBeVisible();
    await expect(page.locator('td:has-text("bob@startup.io")')).toBeHidden();

    await page.locator('button:has-text("Clear filters")').click();

    await expect(page.locator('td:has-text("alice@example.com")')).toBeVisible();
    await expect(page.locator('td:has-text("bob@startup.io")')).toBeVisible();
  });
});

test.describe('APIKey Approvals - Approve flow', () => {
  test.beforeEach(async ({ page }) => {
    applyFixtures();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissConsoleTour(page);
    await impersonateUser(page, 'test-api-owner');
    await navigateToAPIKeyApprovals(page);
    await expect(page.locator('td:has-text("alice@example.com")')).toBeVisible({
      timeout: 15_000,
    });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('approve single request via kebab menu shows success toast', async ({ page }) => {
    const aliceRow = page.locator('tr:has-text("alice@example.com")');
    await aliceRow.locator('[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Approve")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await expect(page.locator('.pf-v6-c-modal-box').locator('text=Approve API Key')).toBeVisible();
    await expect(
      page.locator('.pf-v6-c-modal-box').locator('text=alice@example.com'),
    ).toBeVisible();

    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Approve")').click();

    // PF6 Alert with isInline does not set role="alert" — match by CSS class
    await expect(page.locator('.pf-v6-c-alert:has-text("approved successfully")')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('cancel approval modal leaves row unchanged', async ({ page }) => {
    const aliceRow = page.locator('tr:has-text("alice@example.com")');
    await aliceRow.locator('[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Approve")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Cancel")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.locator('td:has-text("alice@example.com")')).toBeVisible();
  });
});

test.describe('APIKey Approvals - Reject flow', () => {
  test.beforeEach(async ({ page }) => {
    applyFixtures();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissConsoleTour(page);
    await impersonateUser(page, 'test-api-owner');
    await navigateToAPIKeyApprovals(page);
    await expect(page.locator('td:has-text("bob@startup.io")')).toBeVisible({ timeout: 15_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('reject single request with reason shows success toast', async ({ page }) => {
    const bobRow = page.locator('tr:has-text("bob@startup.io")');
    await bobRow.locator('[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Reject")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await expect(page.locator('.pf-v6-c-modal-box').locator('text=Reject API Key')).toBeVisible();
    await expect(page.locator('.pf-v6-c-modal-box').locator('text=bob@startup.io')).toBeVisible();

    await page.locator('#rejection-reason').fill('Does not meet usage requirements');

    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Reject")').click();

    await expect(page.locator('.pf-v6-c-alert:has-text("rejected")')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('reject modal has optional reason field (can reject without reason)', async ({ page }) => {
    const bobRow = page.locator('tr:has-text("bob@startup.io")');
    await bobRow.locator('[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Reject")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await expect(page.locator('#rejection-reason')).toBeVisible();

    // Reject button should be enabled even without filling in a reason
    const rejectButton = page.locator('.pf-v6-c-modal-box').locator('button:has-text("Reject")');
    await expect(rejectButton).toBeEnabled();

    await rejectButton.click();
    await expect(page.locator('.pf-v6-c-alert:has-text("rejected")')).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe('APIKey Approvals - Bulk actions', () => {
  test.beforeEach(async ({ page }) => {
    applyFixtures();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissConsoleTour(page);
    await impersonateUser(page, 'test-api-owner');
    await navigateToAPIKeyApprovals(page);
    await expect(page.locator('th:has-text("Requester")')).toBeVisible({ timeout: 15_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('selecting all pending rows shows bulk action buttons', async ({ page }) => {
    await page.locator('thead input[type="checkbox"]').click();

    await expect(page.locator('button', { hasText: /Approve \d+ selected/ })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator('button', { hasText: /Reject \d+ selected/ })).toBeVisible();
  });

  test('bulk approve opens modal listing selected requests', async ({ page }) => {
    await page.locator('thead input[type="checkbox"]').click();

    await page.locator('button', { hasText: /Approve \d+ selected/ }).click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('.pf-v6-c-modal-box').locator('text=Are you sure you want to approve'),
    ).toBeVisible();

    // close modal before afterEach so the backdrop doesn't block stopImpersonation
    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Cancel")').click();
    await expect(page.locator('.pf-v6-c-modal-box')).not.toBeVisible({ timeout: 5_000 });
  });

  test('bulk approve confirms all selected requests and shows success toast', async ({ page }) => {
    // wait for fixture rows to be present
    await expect(page.locator('td:has-text("alice@example.com")')).toBeVisible({
      timeout: 15_000,
    });

    await page.locator('thead input[type="checkbox"]').click();

    // capture the count from the button text before clicking
    const bulkApproveButton = page.locator('button', { hasText: /Approve \d+ selected/ });
    await expect(bulkApproveButton).toBeVisible({ timeout: 5_000 });

    await bulkApproveButton.click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('.pf-v6-c-modal-box').locator('text=Are you sure you want to approve'),
    ).toBeVisible();

    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Approve")').click();

    await expect(page.locator('.pf-v6-c-alert:has-text("approved successfully")')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('bulk reject confirms all selected requests and shows success toast', async ({ page }) => {
    await expect(page.locator('td:has-text("alice@example.com")')).toBeVisible({
      timeout: 15_000,
    });

    await page.locator('thead input[type="checkbox"]').click();

    const bulkRejectButton = page.locator('button', { hasText: /Reject \d+ selected/ });
    await expect(bulkRejectButton).toBeVisible({ timeout: 5_000 });

    await bulkRejectButton.click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('.pf-v6-c-modal-box').locator('text=Are you sure you want to approve'),
    ).not.toBeVisible();

    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Reject")').click();

    await expect(page.locator('.pf-v6-c-alert:has-text("rejected")')).toBeVisible({
      timeout: 15_000,
    });
  });
});
