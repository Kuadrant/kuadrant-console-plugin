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
  test('user without apikeyrequests access cannot see the approval table', { tag: '@smoke' }, async ({ page }) => {
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

  test('cancel approval modal leaves row unchanged', { tag: '@smoke' }, async ({ page }) => {
    const aliceRow = page.locator('tr:has-text("alice@example.com")');
    await expect(aliceRow.locator('[aria-label="Actions"]')).toBeEnabled({ timeout: 30_000 });
    await aliceRow.locator('[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Approve")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Cancel")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.locator('td:has-text("alice@example.com")')).toBeVisible();
  });

  // Nested describe so dynamic resources are only created for the approve test,
  // not for the cancel test which uses the static alice@example.com from setup.sh.
  test.describe('approve single request', () => {
    let aliceNs: string;
    let aliceKey: string;
    let aliceEmail: string;

    test.beforeEach(async ({ page }) => {
      const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      aliceNs = `consumer-alice-approve-${uid}`;
      aliceKey = `alice-approve-${uid}`;
      aliceEmail = `alice-approve-${uid}@example.com`;

      execSync(`
        kubectl create namespace ${aliceNs} || true
        kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ${aliceKey}
  namespace: ${aliceNs}
stringData:
  api_key: test-alice-approve-key
---
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: ${aliceKey}
  namespace: ${aliceNs}
spec:
  apiProductRef:
    name: test-approval-product
    namespace: kuadrant-test
  planTier: gold
  useCase: "Testing API integration for approval"
  requestedBy:
    userId: "alice-approve"
    email: "${aliceEmail}"
  secretRef:
    name: ${aliceKey}
EOF
      `, { stdio: 'inherit' });

      execSync(`timeout 30 bash -c 'until kubectl get apikeyrequests -n kuadrant-test | grep -q ${aliceKey}; do sleep 1; done'`, { stdio: 'inherit' });

      await page.reload();
      await page.waitForLoadState('networkidle');
    });

    test.afterEach(async () => {
      execSync(`kubectl delete namespace ${aliceNs} --ignore-not-found=true`, { stdio: 'inherit' });
    });

    test('approve single request shows success toast', { tag: '@smoke' }, async ({ page }) => {
      const aliceApproveRow = page.locator(`tr:has-text("${aliceEmail}")`);
      await expect(aliceApproveRow.locator('[aria-label="Actions"]')).toBeEnabled({ timeout: 30_000 });
      await aliceApproveRow.locator('[aria-label="Actions"]').click();
      await page.locator('[role="menuitem"]:has-text("Approve")').click();

      await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
      await expect(page.locator('.pf-v6-c-modal-box').locator(`text=${aliceEmail}`)).toBeVisible();

      await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Approve")').click();

      await expect(page.locator('.pf-v6-c-alert:has-text("approved successfully")')).toBeVisible({
        timeout: 30_000,
      });

      const updatedAliceApproveRow = page.locator(`tr:has-text("${aliceEmail}")`);
      await expect(updatedAliceApproveRow.locator('text=Active')).toBeVisible({ timeout: 10_000 });
    });
  });
});

// ── Reject with reason (uses bob) ────────────────────────────────────────────

test.describe('APIKey Approvals - Reject with reason', () => {
  let uid: string;
  let bobNs: string;
  let bobKey: string;
  let bobEmail: string;

  test.beforeEach(async ({ page }) => {
    uid = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    bobNs = `consumer-bob-reject-${uid}`;
    bobKey = `bob-reject-${uid}`;
    bobEmail = `bob-reject-${uid}@startup.io`;

    execSync(`
      kubectl create namespace ${bobNs} || true
      kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ${bobKey}
  namespace: ${bobNs}
stringData:
  api_key: test-bob-reject-key
---
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: ${bobKey}
  namespace: ${bobNs}
spec:
  apiProductRef:
    name: test-approval-product
    namespace: kuadrant-test
  planTier: silver
  useCase: "Building a startup integration"
  requestedBy:
    userId: "bob-reject"
    email: "${bobEmail}"
  secretRef:
    name: ${bobKey}
EOF
    `, { stdio: 'inherit' });

    execSync(`timeout 30 bash -c 'until kubectl get apikeyrequests -n kuadrant-test | grep -q ${bobKey}; do sleep 1; done'`, { stdio: 'inherit' });

    await navigateAsOwner(page);
    await expect(page.locator(`td:has-text("${bobEmail}")`)).toBeVisible({ timeout: 30_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
    execSync(`kubectl delete namespace ${bobNs} --ignore-not-found=true`, { stdio: 'inherit' });
  });

  test('reject request with reason shows success toast', { tag: '@smoke' }, async ({ page }) => {
    const bobRow = page.locator(`tr:has-text("${bobEmail}")`);
    await expect(bobRow.locator('[aria-label="Actions"]')).toBeEnabled({ timeout: 30_000 });
    await bobRow.locator('[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Deny")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await expect(page.locator('.pf-v6-c-modal-box').locator(`text=${bobEmail}`)).toBeVisible();

    await page.locator('#rejection-reason').fill('Does not meet usage requirements');
    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Deny")').click();

    await expect(page.locator('.pf-v6-c-alert:has-text("denied")')).toBeVisible({
      timeout: 30_000,
    });

    const updatedBobRow = page.locator(`tr:has-text("${bobEmail}")`);
    await expect(updatedBobRow.locator('text=Denied')).toBeVisible({ timeout: 10_000 });
  });
});

// ── Reject without reason (uses bob2) ────────────────────────────────────────

test.describe('APIKey Approvals - Reject without reason', () => {
  let uid: string;
  let bob2Ns: string;
  let bob2Key: string;
  let bob2Email: string;

  test.beforeEach(async ({ page }) => {
    uid = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    bob2Ns = `consumer-bob2-reject-${uid}`;
    bob2Key = `bob2-reject-${uid}`;
    bob2Email = `bob2-reject-${uid}@startup.io`;

    execSync(`
      kubectl create namespace ${bob2Ns} || true
      kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ${bob2Key}
  namespace: ${bob2Ns}
stringData:
  api_key: test-bob2-reject-key
---
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: ${bob2Key}
  namespace: ${bob2Ns}
spec:
  apiProductRef:
    name: test-approval-product
    namespace: kuadrant-test
  planTier: silver
  useCase: "Mobile app API integration"
  requestedBy:
    userId: "bob2-reject"
    email: "${bob2Email}"
  secretRef:
    name: ${bob2Key}
EOF
    `, { stdio: 'inherit' });

    execSync(`timeout 30 bash -c 'until kubectl get apikeyrequests -n kuadrant-test | grep -q ${bob2Key}; do sleep 1; done'`, { stdio: 'inherit' });

    await navigateAsOwner(page);
    await expect(page.locator(`td:has-text("${bob2Email}")`)).toBeVisible({ timeout: 30_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
    execSync(`kubectl delete namespace ${bob2Ns} --ignore-not-found=true`, { stdio: 'inherit' });
  });

  test('reject request without reason is allowed', { tag: '@nightly' }, async ({ page }) => {
    const bob2Row = page.locator(`tr:has-text("${bob2Email}")`);
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

    const updatedBob2Row = page.locator(`tr:has-text("${bob2Email}")`);
    await expect(updatedBob2Row.locator('text=Denied')).toBeVisible({ timeout: 10_000 });
  });
});

// ── Bulk approve (uses carol + dave) ──────────────────────────────────────────

test.describe('APIKey Approvals - Bulk approve', () => {
  let uid: string;
  let carolNs: string;
  let carolKey: string;
  let carolEmail: string;
  let daveNs: string;
  let daveKey: string;
  let daveEmail: string;

  test.beforeEach(async ({ page }) => {
    uid = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    carolNs = `consumer-carol-bulk-${uid}`;
    carolKey = `carol-bulk-${uid}`;
    carolEmail = `carol-bulk-${uid}@enterprise.com`;
    daveNs = `consumer-dave-bulk-${uid}`;
    daveKey = `dave-bulk-${uid}`;
    daveEmail = `dave-bulk-${uid}@partner.io`;

    execSync(`
      kubectl create namespace ${carolNs} || true
      kubectl create namespace ${daveNs} || true
      kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ${carolKey}
  namespace: ${carolNs}
stringData:
  api_key: test-carol-bulk-key
---
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: ${carolKey}
  namespace: ${carolNs}
spec:
  apiProductRef:
    name: test-approval-product
    namespace: kuadrant-test
  planTier: gold
  useCase: "Enterprise integration"
  requestedBy:
    userId: "carol-bulk"
    email: "${carolEmail}"
  secretRef:
    name: ${carolKey}
---
apiVersion: v1
kind: Secret
metadata:
  name: ${daveKey}
  namespace: ${daveNs}
stringData:
  api_key: test-dave-bulk-key
---
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: ${daveKey}
  namespace: ${daveNs}
spec:
  apiProductRef:
    name: test-approval-product
    namespace: kuadrant-test
  planTier: bronze
  useCase: "Partner API access"
  requestedBy:
    userId: "dave-bulk"
    email: "${daveEmail}"
  secretRef:
    name: ${daveKey}
EOF
    `, { stdio: 'inherit' });

    // Poll for both APIKeyRequests in parallel (background jobs) and fail fast
    // if either times out, rather than waiting sequentially (up to 60s total).
    execSync(`bash -c 'timeout 30 bash -c "until kubectl get apikeyrequests -n kuadrant-test | grep -q ${carolKey}; do sleep 1; done" & PID1=$!; timeout 30 bash -c "until kubectl get apikeyrequests -n kuadrant-test | grep -q ${daveKey}; do sleep 1; done" & PID2=$!; wait $PID1 || exit 1; wait $PID2 || exit 1'`, { stdio: 'inherit' });

    await navigateAsOwner(page);
    await expect(page.locator(`td:has-text("${carolEmail}")`)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`td:has-text("${daveEmail}")`)).toBeVisible({ timeout: 30_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
    execSync(`kubectl delete namespace ${carolNs} ${daveNs} --ignore-not-found=true`, { stdio: 'inherit' });
  });

  test('bulk approve selected requests shows success toast', { tag: '@smoke' }, async ({ page }) => {
    await page.locator(`tr:has-text("${carolEmail}") input[type="checkbox"]`).click();
    await page.locator(`tr:has-text("${daveEmail}") input[type="checkbox"]`).click();

    const bulkApproveButton = page.locator('button', { hasText: /Approve \d+ selected/ });
    await expect(bulkApproveButton).toBeVisible({ timeout: 5_000 });
    await bulkApproveButton.click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible({ timeout: 10_000 });
    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Approve")').click();

    await expect(page.locator('.pf-v6-c-alert:has-text("approved successfully")')).toBeVisible({
      timeout: 30_000,
    });

    await expect(page.locator(`tr:has-text("${carolEmail}")`).locator('text=Active')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`tr:has-text("${daveEmail}")`).locator('text=Active')).toBeVisible({ timeout: 10_000 });
  });
});

// ── Bulk reject (uses ellen + frank) ─────────────────────────────────────────

test.describe('APIKey Approvals - Bulk reject', () => {
  let uid: string;
  let ellenNs: string;
  let ellenKey: string;
  let ellenEmail: string;
  let frankNs: string;
  let frankKey: string;
  let frankEmail: string;

  test.beforeEach(async ({ page }) => {
    uid = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    ellenNs = `consumer-ellen-bulk-${uid}`;
    ellenKey = `ellen-bulk-${uid}`;
    ellenEmail = `ellen-bulk-${uid}@research.io`;
    frankNs = `consumer-frank-bulk-${uid}`;
    frankKey = `frank-bulk-${uid}`;
    frankEmail = `frank-bulk-${uid}@freelance.io`;

    execSync(`
      kubectl create namespace ${ellenNs} || true
      kubectl create namespace ${frankNs} || true
      kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ${ellenKey}
  namespace: ${ellenNs}
stringData:
  api_key: test-ellen-bulk-key
---
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: ${ellenKey}
  namespace: ${ellenNs}
spec:
  apiProductRef:
    name: test-approval-product
    namespace: kuadrant-test
  planTier: gold
  useCase: "Research API integration"
  requestedBy:
    userId: "ellen-bulk"
    email: "${ellenEmail}"
  secretRef:
    name: ${ellenKey}
---
apiVersion: v1
kind: Secret
metadata:
  name: ${frankKey}
  namespace: ${frankNs}
stringData:
  api_key: test-frank-bulk-key
---
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: ${frankKey}
  namespace: ${frankNs}
spec:
  apiProductRef:
    name: test-approval-product
    namespace: kuadrant-test
  planTier: bronze
  useCase: "Freelance project API"
  requestedBy:
    userId: "frank-bulk"
    email: "${frankEmail}"
  secretRef:
    name: ${frankKey}
EOF
    `, { stdio: 'inherit' });

    // Poll for both APIKeyRequests in parallel (background jobs) and fail fast
    // if either times out, rather than waiting sequentially (up to 60s total).
    execSync(`bash -c 'timeout 30 bash -c "until kubectl get apikeyrequests -n kuadrant-test | grep -q ${ellenKey}; do sleep 1; done" & PID1=$!; timeout 30 bash -c "until kubectl get apikeyrequests -n kuadrant-test | grep -q ${frankKey}; do sleep 1; done" & PID2=$!; wait $PID1 || exit 1; wait $PID2 || exit 1'`, { stdio: 'inherit' });

    await navigateAsOwner(page);
    await expect(page.locator(`td:has-text("${ellenEmail}")`)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`td:has-text("${frankEmail}")`)).toBeVisible({ timeout: 30_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
    execSync(`kubectl delete namespace ${ellenNs} ${frankNs} --ignore-not-found=true`, { stdio: 'inherit' });
  });

  test('bulk reject selected requests shows success toast', { tag: '@smoke' }, async ({ page }) => {
    await page.locator(`tr:has-text("${ellenEmail}") input[type="checkbox"]`).click();
    await page.locator(`tr:has-text("${frankEmail}") input[type="checkbox"]`).click();

    const bulkRejectButton = page.locator('button', { hasText: /Deny \d+ selected/ });
    await expect(bulkRejectButton).toBeVisible({ timeout: 5_000 });
    await bulkRejectButton.click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible({ timeout: 10_000 });
    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Deny")').click();

    await expect(page.locator('.pf-v6-c-alert:has-text("denied")')).toBeVisible({
      timeout: 30_000,
    });

    await expect(page.locator(`tr:has-text("${ellenEmail}")`).locator('text=Denied')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`tr:has-text("${frankEmail}")`).locator('text=Denied')).toBeVisible({ timeout: 10_000 });
  });
});

// ── Deny active key (uses george) ────────────────────────────────────────────

test.describe('APIKey Approvals - Deny active key', () => {
  let uid: string;
  let georgeNs: string;
  let georgeKey: string;
  let georgeEmail: string;

  test.beforeEach(async ({ page }) => {
    uid = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    georgeNs = `consumer-george-active-${uid}`;
    georgeKey = `george-active-${uid}`;
    georgeEmail = `george-active-${uid}@test.io`;

    execSync(`
      kubectl create namespace ${georgeNs} || true
      kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ${georgeKey}
  namespace: ${georgeNs}
stringData:
  api_key: test-george-active-key
---
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: ${georgeKey}
  namespace: ${georgeNs}
spec:
  apiProductRef:
    name: test-approval-product
    namespace: kuadrant-test
  planTier: silver
  useCase: "Testing active key denial"
  requestedBy:
    userId: "george-active"
    email: "${georgeEmail}"
  secretRef:
    name: ${georgeKey}
EOF
    `, { stdio: 'inherit' });

    execSync(`timeout 30 bash -c 'until kubectl get apikeyrequests -n kuadrant-test | grep -q ${georgeKey}; do sleep 1; done'`, { stdio: 'inherit' });

    await navigateAsOwner(page);
    await expect(page.locator(`td:has-text("${georgeEmail}")`)).toBeVisible({ timeout: 30_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
    execSync(`kubectl delete namespace ${georgeNs} --ignore-not-found=true`, { stdio: 'inherit' });
  });

  test('should deny an active API key', { tag: '@smoke' }, async ({ page }) => {
    let georgeRow = page.locator(`tr:has-text("${georgeEmail}")`);
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
    georgeRow = page.locator(`tr:has-text("${georgeEmail}")`);
    await expect(georgeRow).toBeVisible({ timeout: 10_000 });
    await expect(georgeRow.locator('[aria-label="Actions"]')).toBeVisible({ timeout: 10_000 });
    await georgeRow.locator('[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Deny")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await expect(page.locator('.pf-v6-c-modal-box').locator(`text=${georgeEmail}`)).toBeVisible();

    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Deny")').click();

    // Step 4: Verify denial success
    await expect(page.locator('.pf-v6-c-alert:has-text("denied successfully")')).toBeVisible({
      timeout: 30_000,
    });

    // Step 5: Verify status changed to "Denied" (wait a moment, then check)
    await page.waitForTimeout(3000);
    georgeRow = page.locator(`tr:has-text("${georgeEmail}")`);
    await expect(georgeRow.locator('text=Denied')).toBeVisible({
      timeout: 10_000,
    });
  });
});
