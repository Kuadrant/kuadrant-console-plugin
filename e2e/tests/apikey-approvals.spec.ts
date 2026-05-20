import { test, expect } from '@playwright/test';
import {
  impersonateUser,
  stopImpersonation,
  navigateToAPIKeyApprovals,
  dismissConsoleTour,
} from './helpers';

// test-api-owner: bound to api-owner ClusterRole (get/list/watch apikeyrequests, CRUD apikeyapprovals)
// test-dev: no devportal.kuadrant.io access
//
// Each test suite has its own dedicated consumer so tests are independent:
//   approve flow       → alice@example.com
//   reject with reason → bob@startup.io
//   reject no reason   → bob2@startup.io
//   bulk approve       → carol@enterprise.com + dave@partner.io
//   bulk reject        → ellen@research.io + frank@freelance.io
//
// setup.sh creates APIKey resources in consumer namespaces. The developer-portal-controller
// creates corresponding APIKeyRequests in kuadrant-test. setup.sh waits for all 7 to appear.

async function navigateAsOwner(page: Parameters<typeof navigateToAPIKeyApprovals>[0]) {
  // Mock the OpenShift user endpoint — in auth-disabled oinc it returns an error,
  // which sets userError=true and disables approve/reject actions.
  await page.route('**/api/kubernetes/apis/user.openshift.io/v1/users/~', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ metadata: { name: 'test-api-owner' } }),
    }),
  );
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await impersonateUser(page, 'test-api-owner');
  await navigateToAPIKeyApprovals(page);
  await dismissConsoleTour(page);
  await page.waitForLoadState('networkidle');
}

// ── RBAC ──────────────────────────────────────────────────────────────────────

test.describe('APIKey Approvals - RBAC', () => {
  test('user without apikeyrequests access cannot see the approval table', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissConsoleTour(page);
    await impersonateUser(page, 'test-dev');

    // SPA navigate to preserve impersonation state (full page.goto clears it in auth-disabled mode)
    await page.evaluate((path) => {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, '/kuadrant/apikey-approvals/ns/kuadrant-test');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('th:has-text("Requester")')).not.toBeVisible({ timeout: 10_000 });
    await expect(page.locator('td:has-text("alice@example.com")')).not.toBeVisible();

    await stopImpersonation(page);
  });
});

// ── Approve flow (uses alice) ─────────────────────────────────────────────────

test.describe('APIKey Approvals - Approve flow', () => {
  test.beforeEach(async ({ page }) => {
    await navigateAsOwner(page);
    await expect(page.locator('td:has-text("alice@example.com")')).toBeVisible({ timeout: 15_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('cancel approval modal leaves row unchanged', async ({ page }) => {
    const aliceRow = page.locator('tr:has-text("alice@example.com")');
    await expect(aliceRow.locator('[aria-label="Actions"]')).toBeEnabled({ timeout: 30_000 });
    await aliceRow.locator('[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Approve")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Cancel")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.locator('td:has-text("alice@example.com")')).toBeVisible();
  });

  test('approve single request shows success toast', async ({ page }) => {
    const aliceRow = page.locator('tr:has-text("alice@example.com")');
    await expect(aliceRow.locator('[aria-label="Actions"]')).toBeEnabled({ timeout: 30_000 });
    await aliceRow.locator('[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Approve")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await expect(page.locator('.pf-v6-c-modal-box').locator('text=alice@example.com')).toBeVisible();

    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Approve")').click();

    await expect(page.locator('.pf-v6-c-alert:has-text("approved successfully")')).toBeVisible({
      timeout: 30_000,
    });
  });
});

// ── Reject with reason (uses bob) ────────────────────────────────────────────

test.describe('APIKey Approvals - Reject with reason', () => {
  test.beforeEach(async ({ page }) => {
    await navigateAsOwner(page);
    await expect(page.locator('td:has-text("bob@startup.io")')).toBeVisible({ timeout: 15_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('reject request with reason shows success toast', async ({ page }) => {
    const bobRow = page.locator('tr:has-text("bob@startup.io")');
    await expect(bobRow.locator('[aria-label="Actions"]')).toBeEnabled({ timeout: 30_000 });
    await bobRow.locator('[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Reject")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await expect(page.locator('.pf-v6-c-modal-box').locator('text=bob@startup.io')).toBeVisible();

    await page.locator('#rejection-reason').fill('Does not meet usage requirements');
    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Reject")').click();

    await expect(page.locator('.pf-v6-c-alert:has-text("rejected")')).toBeVisible({
      timeout: 30_000,
    });
  });
});

// ── Reject without reason (uses bob2) ────────────────────────────────────────

test.describe('APIKey Approvals - Reject without reason', () => {
  test.beforeEach(async ({ page }) => {
    await navigateAsOwner(page);
    await expect(page.locator('td:has-text("bob2@startup.io")')).toBeVisible({ timeout: 15_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('reject request without reason is allowed', async ({ page }) => {
    const bob2Row = page.locator('tr:has-text("bob2@startup.io")');
    await expect(bob2Row.locator('[aria-label="Actions"]')).toBeEnabled({ timeout: 30_000 });
    await bob2Row.locator('[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Reject")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();

    const rejectButton = page.locator('.pf-v6-c-modal-box').locator('button:has-text("Reject")');
    await expect(rejectButton).toBeEnabled();
    await rejectButton.click();

    await expect(page.locator('.pf-v6-c-alert:has-text("rejected")')).toBeVisible({
      timeout: 30_000,
    });
  });
});

// ── Bulk approve (uses carol + dave) ──────────────────────────────────────────

test.describe('APIKey Approvals - Bulk approve', () => {
  test.beforeEach(async ({ page }) => {
    await navigateAsOwner(page);
    await expect(page.locator('td:has-text("carol@enterprise.com")')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('td:has-text("dave@partner.io")')).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('bulk approve selected requests shows success toast', async ({ page }) => {
    // Select only carol and dave — don't use "select all" since other requests may be visible
    await page.locator('tr:has-text("carol@enterprise.com") input[type="checkbox"]').click();
    await page.locator('tr:has-text("dave@partner.io") input[type="checkbox"]').click();

    const bulkApproveButton = page.locator('button', { hasText: /Approve \d+ selected/ });
    await expect(bulkApproveButton).toBeVisible({ timeout: 5_000 });
    await bulkApproveButton.click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible({ timeout: 10_000 });
    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Approve")').click();

    await expect(page.locator('.pf-v6-c-alert:has-text("approved successfully")')).toBeVisible({
      timeout: 30_000,
    });
  });
});

// ── Bulk reject (uses ellen + frank) ─────────────────────────────────────────

test.describe('APIKey Approvals - Bulk reject', () => {
  test.beforeEach(async ({ page }) => {
    await navigateAsOwner(page);
    await expect(page.locator('td:has-text("ellen@research.io")')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('td:has-text("frank@freelance.io")')).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('bulk reject selected requests shows success toast', async ({ page }) => {
    // Select only ellen and frank — don't use "select all" since other requests may be visible
    await page.locator('tr:has-text("ellen@research.io") input[type="checkbox"]').click();
    await page.locator('tr:has-text("frank@freelance.io") input[type="checkbox"]').click();

    const bulkRejectButton = page.locator('button', { hasText: /Reject \d+ selected/ });
    await expect(bulkRejectButton).toBeVisible({ timeout: 5_000 });
    await bulkRejectButton.click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible({ timeout: 10_000 });
    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Reject")').click();

    await expect(page.locator('.pf-v6-c-alert:has-text("rejected")')).toBeVisible({
      timeout: 30_000,
    });
  });
});
