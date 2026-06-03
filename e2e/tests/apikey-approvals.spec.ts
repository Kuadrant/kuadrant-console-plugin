import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import {
  impersonateUser,
  stopImpersonation,
  navigateToAPIKeyApprovals,
  dismissConsoleTour,
} from './helpers';

// test-api-owner: bound to api-owner ClusterRole (get/list/watch apikeyrequests, CRUD apikeyapprovals)
// test-dev: no devportal.kuadrant.io access
//
// Each test has its own dedicated consumer so tests are completely independent:
//   approve flow - cancel      → alice@example.com
//   approve flow - approve     → alice2@example.com
//   reject with reason         → bob@startup.io
//   reject no reason           → bob2@startup.io
//   bulk approve               → carol@enterprise.com + dave@partner.io
//   bulk reject                → ellen@research.io + frank@freelance.io
//   deny active key            → george@test.io
//
// setup.sh creates APIKey resources in consumer namespaces. The developer-portal-controller
// creates corresponding APIKeyRequests in kuadrant-test. setup.sh waits for all 9 to appear.

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
    // Create test-specific namespace and APIKey
    execSync(`
      kubectl create namespace consumer-alice-approve || true
      kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: alice-approve-api-key
  namespace: consumer-alice-approve
stringData:
  api_key: test-alice-approve-key
---
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: alice-approve-api-key
  namespace: consumer-alice-approve
spec:
  apiProductRef:
    name: test-approval-product
    namespace: kuadrant-test
  planTier: gold
  useCase: "Testing API integration for approval"
  requestedBy:
    userId: "alice-approve"
    email: "alice-approve@example.com"
  secretRef:
    name: alice-approve-api-key
EOF
    `, { stdio: 'inherit' });

    // Wait for APIKeyRequest to be created
    execSync('timeout 30 bash -c \'until kubectl get apikeyrequests -n kuadrant-test | grep -q alice-approve; do sleep 1; done\'', { stdio: 'inherit' });

    // Refresh the page to see the new request
    await page.reload();
    await page.waitForLoadState('networkidle');

    const aliceApproveRow = page.locator('tr:has-text("alice-approve@example.com")');
    await expect(aliceApproveRow.locator('[aria-label="Actions"]')).toBeEnabled({ timeout: 30_000 });
    await aliceApproveRow.locator('[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Approve")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await expect(page.locator('.pf-v6-c-modal-box').locator('text=alice-approve@example.com')).toBeVisible();

    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Approve")').click();

    await expect(page.locator('.pf-v6-c-alert:has-text("approved successfully")')).toBeVisible({
      timeout: 30_000,
    });

    // Clean up test namespace
    execSync('kubectl delete namespace consumer-alice-approve --ignore-not-found=true', { stdio: 'inherit' });
  });
});

// ── Reject with reason (uses bob) ────────────────────────────────────────────

test.describe('APIKey Approvals - Reject with reason', () => {
  test.beforeEach(async ({ page }) => {
    // Create test-specific namespace and APIKey
    execSync(`
      kubectl create namespace consumer-bob-reject || true
      kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: bob-reject-api-key
  namespace: consumer-bob-reject
stringData:
  api_key: test-bob-reject-key
---
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: bob-reject-api-key
  namespace: consumer-bob-reject
spec:
  apiProductRef:
    name: test-approval-product
    namespace: kuadrant-test
  planTier: silver
  useCase: "Building a startup integration"
  requestedBy:
    userId: "bob-reject"
    email: "bob-reject@startup.io"
  secretRef:
    name: bob-reject-api-key
EOF
    `, { stdio: 'inherit' });

    // Wait for APIKeyRequest to be created
    execSync('timeout 30 bash -c \'until kubectl get apikeyrequests -n kuadrant-test | grep -q bob-reject; do sleep 1; done\'', { stdio: 'inherit' });

    await navigateAsOwner(page);
    await expect(page.locator('td:has-text("bob-reject@startup.io")')).toBeVisible({ timeout: 30_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
    // Clean up test namespace
    execSync('kubectl delete namespace consumer-bob-reject --ignore-not-found=true', { stdio: 'inherit' });
  });

  test('reject request with reason shows success toast', async ({ page }) => {
    const bobRow = page.locator('tr:has-text("bob-reject@startup.io")');
    await expect(bobRow.locator('[aria-label="Actions"]')).toBeEnabled({ timeout: 30_000 });
    await bobRow.locator('[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Deny")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await expect(page.locator('.pf-v6-c-modal-box').locator('text=bob-reject@startup.io')).toBeVisible();

    await page.locator('#rejection-reason').fill('Does not meet usage requirements');
    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Deny")').click();

    await expect(page.locator('.pf-v6-c-alert:has-text("denied")')).toBeVisible({
      timeout: 30_000,
    });
  });
});

// ── Reject without reason (uses bob2) ────────────────────────────────────────

test.describe('APIKey Approvals - Reject without reason', () => {
  test.beforeEach(async ({ page }) => {
    // Create test-specific namespace and APIKey
    execSync(`
      kubectl create namespace consumer-bob2-reject || true
      kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: bob2-reject-api-key
  namespace: consumer-bob2-reject
stringData:
  api_key: test-bob2-reject-key
---
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: bob2-reject-api-key
  namespace: consumer-bob2-reject
spec:
  apiProductRef:
    name: test-approval-product
    namespace: kuadrant-test
  planTier: silver
  useCase: "Mobile app API integration"
  requestedBy:
    userId: "bob2-reject"
    email: "bob2-reject@startup.io"
  secretRef:
    name: bob2-reject-api-key
EOF
    `, { stdio: 'inherit' });

    // Wait for APIKeyRequest to be created
    execSync('timeout 30 bash -c \'until kubectl get apikeyrequests -n kuadrant-test | grep -q bob2-reject; do sleep 1; done\'', { stdio: 'inherit' });

    await navigateAsOwner(page);
    await expect(page.locator('td:has-text("bob2-reject@startup.io")')).toBeVisible({ timeout: 30_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
    // Clean up test namespace
    execSync('kubectl delete namespace consumer-bob2-reject --ignore-not-found=true', { stdio: 'inherit' });
  });

  test('reject request without reason is allowed', async ({ page }) => {
    const bob2Row = page.locator('tr:has-text("bob2-reject@startup.io")');
    await expect(bob2Row.locator('[aria-label="Actions"]')).toBeEnabled({ timeout: 30_000 });
    await bob2Row.locator('[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Deny")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();

    const rejectButton = page.locator('.pf-v6-c-modal-box').locator('button:has-text("Deny")');
    await expect(rejectButton).toBeEnabled();
    await rejectButton.click();

    await expect(page.locator('.pf-v6-c-alert:has-text("denied")')).toBeVisible({
      timeout: 30_000,
    });
  });
});

// ── Bulk approve (uses carol + dave) ──────────────────────────────────────────

test.describe('APIKey Approvals - Bulk approve', () => {
  test.beforeEach(async ({ page }) => {
    // Create test-specific namespaces and APIKeys
    execSync(`
      kubectl create namespace consumer-carol-bulk || true
      kubectl create namespace consumer-dave-bulk || true
      kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: carol-bulk-api-key
  namespace: consumer-carol-bulk
stringData:
  api_key: test-carol-bulk-key
---
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: carol-bulk-api-key
  namespace: consumer-carol-bulk
spec:
  apiProductRef:
    name: test-approval-product
    namespace: kuadrant-test
  planTier: gold
  useCase: "Enterprise integration"
  requestedBy:
    userId: "carol-bulk"
    email: "carol-bulk@enterprise.com"
  secretRef:
    name: carol-bulk-api-key
---
apiVersion: v1
kind: Secret
metadata:
  name: dave-bulk-api-key
  namespace: consumer-dave-bulk
stringData:
  api_key: test-dave-bulk-key
---
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: dave-bulk-api-key
  namespace: consumer-dave-bulk
spec:
  apiProductRef:
    name: test-approval-product
    namespace: kuadrant-test
  planTier: bronze
  useCase: "Partner API access"
  requestedBy:
    userId: "dave-bulk"
    email: "dave-bulk@partner.io"
  secretRef:
    name: dave-bulk-api-key
EOF
    `, { stdio: 'inherit' });

    // Wait for APIKeyRequests to be created
    execSync('timeout 30 bash -c \'until kubectl get apikeyrequests -n kuadrant-test | grep -q carol-bulk; do sleep 1; done\'', { stdio: 'inherit' });
    execSync('timeout 30 bash -c \'until kubectl get apikeyrequests -n kuadrant-test | grep -q dave-bulk; do sleep 1; done\'', { stdio: 'inherit' });

    await navigateAsOwner(page);
    await expect(page.locator('td:has-text("carol-bulk@enterprise.com")')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('td:has-text("dave-bulk@partner.io")')).toBeVisible({ timeout: 30_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
    // Clean up test namespaces
    execSync('kubectl delete namespace consumer-carol-bulk consumer-dave-bulk --ignore-not-found=true', { stdio: 'inherit' });
  });

  test('bulk approve selected requests shows success toast', async ({ page }) => {
    // Select only carol and dave — don't use "select all" since other requests may be visible
    await page.locator('tr:has-text("carol-bulk@enterprise.com") input[type="checkbox"]').click();
    await page.locator('tr:has-text("dave-bulk@partner.io") input[type="checkbox"]').click();

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
    // Create test-specific namespaces and APIKeys
    execSync(`
      kubectl create namespace consumer-ellen-bulk || true
      kubectl create namespace consumer-frank-bulk || true
      kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ellen-bulk-api-key
  namespace: consumer-ellen-bulk
stringData:
  api_key: test-ellen-bulk-key
---
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: ellen-bulk-api-key
  namespace: consumer-ellen-bulk
spec:
  apiProductRef:
    name: test-approval-product
    namespace: kuadrant-test
  planTier: gold
  useCase: "Research API integration"
  requestedBy:
    userId: "ellen-bulk"
    email: "ellen-bulk@research.io"
  secretRef:
    name: ellen-bulk-api-key
---
apiVersion: v1
kind: Secret
metadata:
  name: frank-bulk-api-key
  namespace: consumer-frank-bulk
stringData:
  api_key: test-frank-bulk-key
---
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: frank-bulk-api-key
  namespace: consumer-frank-bulk
spec:
  apiProductRef:
    name: test-approval-product
    namespace: kuadrant-test
  planTier: bronze
  useCase: "Freelance project API"
  requestedBy:
    userId: "frank-bulk"
    email: "frank-bulk@freelance.io"
  secretRef:
    name: frank-bulk-api-key
EOF
    `, { stdio: 'inherit' });

    // Wait for APIKeyRequests to be created
    execSync('timeout 30 bash -c \'until kubectl get apikeyrequests -n kuadrant-test | grep -q ellen-bulk; do sleep 1; done\'', { stdio: 'inherit' });
    execSync('timeout 30 bash -c \'until kubectl get apikeyrequests -n kuadrant-test | grep -q frank-bulk; do sleep 1; done\'', { stdio: 'inherit' });

    await navigateAsOwner(page);
    await expect(page.locator('td:has-text("ellen-bulk@research.io")')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('td:has-text("frank-bulk@freelance.io")')).toBeVisible({ timeout: 30_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
    // Clean up test namespaces
    execSync('kubectl delete namespace consumer-ellen-bulk consumer-frank-bulk --ignore-not-found=true', { stdio: 'inherit' });
  });

  test('bulk reject selected requests shows success toast', async ({ page }) => {
    // Select only ellen and frank — don't use "select all" since other requests may be visible
    await page.locator('tr:has-text("ellen-bulk@research.io") input[type="checkbox"]').click();
    await page.locator('tr:has-text("frank-bulk@freelance.io") input[type="checkbox"]').click();

    const bulkRejectButton = page.locator('button', { hasText: /Deny \d+ selected/ });
    await expect(bulkRejectButton).toBeVisible({ timeout: 5_000 });
    await bulkRejectButton.click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible({ timeout: 10_000 });
    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Deny")').click();

    await expect(page.locator('.pf-v6-c-alert:has-text("denied")')).toBeVisible({
      timeout: 30_000,
    });
  });
});

// ── Deny active key (uses george) ────────────────────────────────────────────

test.describe('APIKey Approvals - Deny active key', () => {
  test.beforeEach(async ({ page }) => {
    // Create test-specific namespace and APIKey
    execSync(`
      kubectl create namespace consumer-george-active || true
      kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: george-active-api-key
  namespace: consumer-george-active
stringData:
  api_key: test-george-active-key
---
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: george-active-api-key
  namespace: consumer-george-active
spec:
  apiProductRef:
    name: test-approval-product
    namespace: kuadrant-test
  planTier: silver
  useCase: "Testing active key denial"
  requestedBy:
    userId: "george-active"
    email: "george-active@test.io"
  secretRef:
    name: george-active-api-key
EOF
    `, { stdio: 'inherit' });

    // Wait for APIKeyRequest to be created
    execSync('timeout 30 bash -c \'until kubectl get apikeyrequests -n kuadrant-test | grep -q george-active; do sleep 1; done\'', { stdio: 'inherit' });

    await navigateAsOwner(page);
    await expect(page.locator('td:has-text("george-active@test.io")')).toBeVisible({ timeout: 30_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
    // Clean up test namespace
    execSync('kubectl delete namespace consumer-george-active --ignore-not-found=true', { stdio: 'inherit' });
  });

  test('should deny an active API key', async ({ page }) => {
    // Step 1: Approve the pending request
    let georgeRow = page.locator('tr:has-text("george-active@test.io")');
    await expect(georgeRow.locator('[aria-label="Actions"]')).toBeEnabled({ timeout: 30_000 });
    await georgeRow.locator('[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Approve")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Approve")').click();

    await expect(page.locator('.pf-v6-c-alert:has-text("approved successfully")')).toBeVisible({
      timeout: 30_000,
    });

    // Step 2: Wait a moment for the table to update, then verify we can find the george row again
    await page.waitForTimeout(3000);

    // Step 3: Deny the now-active key (reselect row and verify it has Actions menu)
    georgeRow = page.locator('tr:has-text("george-active@test.io")');
    await expect(georgeRow).toBeVisible({ timeout: 10_000 });
    await expect(georgeRow.locator('[aria-label="Actions"]')).toBeVisible({ timeout: 10_000 });
    await georgeRow.locator('[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Deny")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await expect(page.locator('.pf-v6-c-modal-box').locator('text=george-active@test.io')).toBeVisible();

    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Deny")').click();

    // Step 4: Verify denial success
    await expect(page.locator('.pf-v6-c-alert:has-text("denied successfully")')).toBeVisible({
      timeout: 30_000,
    });

    // Step 5: Verify status changed to "Denied" (wait a moment, then check)
    await page.waitForTimeout(3000);
    georgeRow = page.locator('tr:has-text("george-active@test.io")');
    await expect(georgeRow.locator('text=Denied')).toBeVisible({
      timeout: 10_000,
    });
  });
});
