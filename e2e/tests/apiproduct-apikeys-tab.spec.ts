import { test, expect } from '@playwright/test';
import { impersonateUser, stopImpersonation, dismissConsoleTour } from './helpers';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

// Test the API Keys tab in the API Product details page
// Creates dedicated APIKey resources for each test to ensure isolation

const TEST_NAMESPACE = 'kuadrant-test';
const API_PRODUCT_NAME = 'test-approval-product';

interface APIKeyConfig {
  name: string;
  namespace: string;
  userId: string;
  email: string;
  planTier: string;
  useCase: string;
  apiKeySecret: string;
}

async function createNamespace(name: string) {
  const yaml = `---
apiVersion: v1
kind: Namespace
metadata:
  name: ${name}
`;

  // Write to temp file and apply
  const tmpFile = path.join(os.tmpdir(), `namespace-${name}-${Date.now()}.yaml`);
  try {
    fs.writeFileSync(tmpFile, yaml);
    const { stderr } = await execAsync(`kubectl apply -f ${tmpFile}`);
    if (stderr) console.error(`stderr:`, stderr);
  } catch (error) {
    console.error(`Failed to create namespace ${name}:`, error);
    throw error;
  } finally {
    // Cleanup temp file
    try {
      fs.unlinkSync(tmpFile);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

async function createAPIKey(config: APIKeyConfig) {
  const yaml = `---
apiVersion: v1
kind: Secret
metadata:
  name: ${config.name}
  namespace: ${config.namespace}
stringData:
  api_key: ${config.apiKeySecret}
---
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: ${config.name}
  namespace: ${config.namespace}
spec:
  apiProductRef:
    name: ${API_PRODUCT_NAME}
    namespace: ${TEST_NAMESPACE}
  planTier: ${config.planTier}
  useCase: "${config.useCase}"
  requestedBy:
    userId: "${config.userId}"
    email: "${config.email}"
  secretRef:
    name: ${config.name}
`;

  // Write to temp file and apply
  const tmpFile = path.join(os.tmpdir(), `apikey-${config.name}-${Date.now()}.yaml`);
  try {
    fs.writeFileSync(tmpFile, yaml);
    const { stderr } = await execAsync(`kubectl apply -f ${tmpFile}`);
    if (stderr) console.error(`stderr:`, stderr);
  } catch (error) {
    console.error(`Failed to create APIKey ${config.name}:`, error);
    throw error;
  } finally {
    // Cleanup temp file
    try {
      fs.unlinkSync(tmpFile);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

async function deleteNamespace(name: string) {
  try {
    await execAsync(`kubectl delete namespace ${name} --ignore-not-found=true --wait --timeout=10s`);
  } catch (error) {
    console.error(`Failed to delete namespace ${name}:`, error);
  }
}

async function deleteAPIKey(namespace: string, name: string) {
  try {
    // Delete the APIKey - this will also delete the corresponding APIKeyRequest via controller
    await execAsync(
      `kubectl delete apikey ${name} -n ${namespace} --ignore-not-found=true --wait=true --timeout=10s`,
    );
  } catch (error) {
    console.error(`Failed to clean up APIKey ${name} in namespace ${namespace}:`, error);
    // Don't throw - allow cleanup to continue
  }
}

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
  await page
    .getByRole('button', { name: 'Kuadrant', exact: true })
    .waitFor({ state: 'visible', timeout: 30_000 });

  // Navigate using SPA navigation to preserve impersonation
  await page.evaluate(
    ({ ns, name }) => {
      window.history.pushState(
        {},
        '',
        `/k8s/ns/${ns}/devportal.kuadrant.io~v1alpha1~APIProduct/${name}/apikeys`,
      );
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
    { ns: namespace, name: productName },
  );
  await page.waitForLoadState('networkidle');

  // Wait for the tab content to load - either the table header or empty state
  await expect(page.locator('th:has-text("Name"), th:has-text("Requester")').first()).toBeVisible({
    timeout: 30_000,
  });
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
  let uid: string;
  let georgeNs: string;
  let georgeKey: string;
  let helenNs: string;
  let helenKey: string;

  test.beforeEach(async ({ page }) => {
    // Unique suffix per test run to avoid parallel conflicts
    uid = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    georgeNs = `george-${uid}`;
    georgeKey = `george-${uid}`;
    helenNs = `helen-${uid}`;
    helenKey = `helen-${uid}`;

    // Create dedicated test fixtures
    await createNamespace(georgeNs);
    await createAPIKey({
      name: georgeKey,
      namespace: georgeNs,
      userId: 'george',
      email: 'george@example.com',
      planTier: 'gold',
      useCase: 'Testing API integration',
      apiKeySecret: 'test-george-key-77777',
    });
    await createNamespace(helenNs);
    await createAPIKey({
      name: helenKey,
      namespace: helenNs,
      userId: 'helen',
      email: 'helen@mobile.io',
      planTier: 'silver',
      useCase: 'Building a mobile integration',
      apiKeySecret: 'test-helen-key-88888',
    });

    await navigateAsOwner(page);

    // Use the search filter to find our specific test resource
    const searchInput = page.locator('input[placeholder*="Search by name"]');
    await searchInput.fill(georgeKey);
    await expect(page.locator(`tr:has-text("${georgeKey}")`)).toBeVisible({ timeout: 10_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
    await deleteAPIKey(georgeNs, georgeKey);
    await deleteAPIKey(helenNs, helenKey);
    await deleteNamespace(georgeNs);
    await deleteNamespace(helenNs);
  });

  test('should display pending API key requests', async ({ page }) => {
    // Verify george request is visible
    await expect(page.locator(`tr:has-text("${georgeKey}")`)).toBeVisible();
    const georgeRow = page.locator(`tr:has-text("${georgeKey}")`);
    await expect(georgeRow.locator('text=Pending')).toBeVisible();

    // Search for helen
    const searchInput = page.locator('input[placeholder*="Search by name"]');
    await searchInput.clear();
    await searchInput.fill(helenKey);

    // Verify helen request is visible
    await expect(page.locator(`tr:has-text("${helenKey}")`)).toBeVisible({ timeout: 5_000 });
    const helenRow = page.locator(`tr:has-text("${helenKey}")`);
    await expect(helenRow.locator('text=Pending')).toBeVisible();
  });

  test('should show actionable items for pending requests', async ({ page }) => {
    // George row should already be visible from beforeEach filter
    const georgeRow = page.locator(`tr:has-text("${georgeKey}")`);
    await expect(georgeRow).toBeVisible();

    // Verify the kebab menu (actions) is available
    const actionsButton = georgeRow.locator('[aria-label="Actions"]');
    await expect(actionsButton).toBeVisible();
    await expect(actionsButton).toBeEnabled();

    // Click to open the actions menu
    await actionsButton.click();

    // Verify both Approve and Deny actions are available
    await expect(page.locator('[role="menuitem"]:has-text("Approve")')).toBeVisible();
    await expect(page.locator('[role="menuitem"]:has-text("Deny")')).toBeVisible();

    // Close the menu by clicking elsewhere
    await page.locator('body').click();
  });

  test('should show use case info icon when use case exists', async ({ page }) => {
    // George row should already be visible from beforeEach filter
    const georgeRow = page.locator(`tr:has-text("${georgeKey}")`);
    await expect(georgeRow).toBeVisible();

    // Check that the use case column has the info icon (InfoCircleIcon)
    // The icon should be in a cell with the use case data
    const infoIcon = georgeRow.locator('svg').first();

    await expect(infoIcon).toBeVisible();
  });
});

// ── Approve Request ───────────────────────────────────────────────────────────

test.describe('APIProduct API Keys Tab - Approve Request', () => {
  let uid: string;
  let ivanNs: string;
  let ivanKey: string;

  test.beforeEach(async ({ page }) => {
    uid = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    ivanNs = `ivan-${uid}`;
    ivanKey = `ivan-${uid}`;

    await createNamespace(ivanNs);
    await createAPIKey({
      name: ivanKey,
      namespace: ivanNs,
      userId: 'ivan',
      email: 'ivan@enterprise.com',
      planTier: 'gold',
      useCase: 'Enterprise API integration',
      apiKeySecret: 'test-ivan-key-99999',
    });

    await navigateAsOwner(page);

    const searchInput = page.locator('input[placeholder*="Search by name"]');
    await searchInput.fill(ivanKey);
    await expect(page.locator(`tr:has-text("${ivanKey}")`)).toBeVisible({ timeout: 10_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
    await deleteAPIKey(ivanNs, ivanKey);
    await deleteNamespace(ivanNs);
  });

  test('should approve a pending request and update status', async ({ page }) => {
    const ivanRow = page.locator(`tr:has-text("${ivanKey}")`);

    // Open actions menu and click Approve
    const actionsButton = ivanRow.locator('[aria-label="Actions"]');
    await expect(actionsButton).toBeEnabled();
    await actionsButton.click();
    await page.locator('[role="menuitem"]:has-text("Approve")').click();

    // Verify approval modal appears
    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();

    // Click Approve button in modal
    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Approve")').click();

    // Wait for modal to close
    await expect(page.locator('.pf-v6-c-modal-box')).not.toBeVisible({ timeout: 10_000 });

    // Verify approval was successful by checking for Active status
    // Note: Actions button remains visible (approved keys can be denied)
    await expect(ivanRow.locator('text=Active')).toBeVisible({ timeout: 30_000 });
  });
});

// ── Reject Request ────────────────────────────────────────────────────────────

test.describe('APIProduct API Keys Tab - Reject Request', () => {
  let uid: string;
  let judyNs: string;
  let judyKey: string;

  test.beforeEach(async ({ page }) => {
    uid = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    judyNs = `judy-${uid}`;
    judyKey = `judy-${uid}`;

    await createNamespace(judyNs);
    await createAPIKey({
      name: judyKey,
      namespace: judyNs,
      userId: 'judy',
      email: 'judy@partner.io',
      planTier: 'bronze',
      useCase: 'Partner API access',
      apiKeySecret: 'test-judy-key-00000',
    });

    await navigateAsOwner(page);

    const searchInput = page.locator('input[placeholder*="Search by name"]');
    await searchInput.fill(judyKey);
    await expect(page.locator(`tr:has-text("${judyKey}")`)).toBeVisible({ timeout: 10_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
    await deleteAPIKey(judyNs, judyKey);
    await deleteNamespace(judyNs);
  });

  test('should reject a pending request and update status', async ({ page }) => {
    const judyRow = page.locator(`tr:has-text("${judyKey}")`);

    // Open actions menu and click Deny
    const actionsButton = judyRow.locator('[aria-label="Actions"]');
    await expect(actionsButton).toBeEnabled();
    await actionsButton.click();
    await page.locator('[role="menuitem"]:has-text("Deny")').click();

    // Verify denial modal appears
    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();

    // Fill denial reason
    await page.locator('#rejection-reason').fill('Does not meet usage requirements');

    // Click Deny button in modal
    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Deny")').click();

    // Wait for modal to close
    await expect(page.locator('.pf-v6-c-modal-box')).not.toBeVisible({ timeout: 10_000 });

    // Verify denial was successful by checking for Denied status
    await expect(judyRow.locator('text=Denied')).toBeVisible({ timeout: 30_000 });
  });
});

// ── Deny Active Key ───────────────────────────────────────────────────────────

test.describe('APIProduct API Keys Tab - Deny Active Key', () => {
  let uid: string;
  let kateNs: string;
  let kateKey: string;

  test.beforeEach(async ({ page }) => {
    uid = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    kateNs = `kate-${uid}`;
    kateKey = `kate-${uid}`;

    await createNamespace(kateNs);
    await createAPIKey({
      name: kateKey,
      namespace: kateNs,
      userId: 'kate',
      email: 'kate@tech.io',
      planTier: 'silver',
      useCase: 'Testing active key denial',
      apiKeySecret: 'test-kate-key-11111',
    });

    await navigateAsOwner(page);

    const searchInput = page.locator('input[placeholder*="Search by name"]');
    await searchInput.fill(kateKey);
    await expect(page.locator(`tr:has-text("${kateKey}")`)).toBeVisible({ timeout: 10_000 });
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
    await deleteAPIKey(kateNs, kateKey);
    await deleteNamespace(kateNs);
  });

  test('should deny an active API key', async ({ page }) => {
    const kateRow = page.locator(`tr:has-text("${kateKey}")`);

    // Step 1: Approve the pending request
    const actionsButton = kateRow.locator('[aria-label="Actions"]');
    await expect(actionsButton).toBeEnabled({ timeout: 30_000 });
    await actionsButton.click();
    await page.locator('[role="menuitem"]:has-text("Approve")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Approve")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).not.toBeVisible({ timeout: 10_000 });

    // Step 2: Wait for status to become "Active"
    await expect(kateRow.locator('text=Active')).toBeVisible({
      timeout: 30_000,
    });

    // Step 3: Deny the now-active key
    await expect(actionsButton).toBeVisible({ timeout: 5_000 });
    await expect(actionsButton).toBeEnabled();
    await actionsButton.click();
    await page.locator('[role="menuitem"]:has-text("Deny")').click();

    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();

    await page.locator('.pf-v6-c-modal-box').locator('button:has-text("Deny")').click();

    // Step 4: Verify modal closes
    await expect(page.locator('.pf-v6-c-modal-box')).not.toBeVisible({ timeout: 10_000 });

    // Step 5: Verify status changed to "Denied"
    await expect(kateRow.locator('text=Denied')).toBeVisible({
      timeout: 30_000,
    });
  });
});
