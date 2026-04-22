import { test, expect, Page } from '@playwright/test';
import { TEST_NAMESPACE, dismissConsoleTour } from './helpers';

/**
 * API Key Lifecycle E2E Tests
 *
 * Prerequisites:
 * - Kuadrant controller must be running to:
 *   1. Populate APIProduct status.discoveredPlans from PlanPolicy
 *   2. Automatically approve API key requests (for payment-api with automatic approval mode)
 *   3. Create secret with API key value
 * - Test fixtures from e2e/manifests/test-resources.yaml:
 *   - payment-api (APIProduct with automatic approval mode)
 *   - test-plan-policy (PlanPolicy with gold/silver tiers targeting test-route)
 *
 * Test Flow:
 * 1. Navigate to My API Keys page in kuadrant-test namespace
 * 2. Verify list is empty initially
 * 3. Request a new API key for payment-api
 * 4. Wait for automatic approval and secret creation
 * 5. Reveal the API key (warning modal → reveal modal with actual key)
 * 6. Verify "Already viewed" status in list
 * 7. Navigate to API key details page
 * 8. Verify usage examples are shown
 * 9. Verify "Already viewed" status on details page
 * 10. Delete API key from details page
 * 11. Verify redirect to list and key is removed
 */

// SPA navigation using pushState - preserves redux state
async function spaNavigate(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForLoadState('networkidle');
}

async function navigateToMyAPIKeys(page: Page, namespace: string): Promise<void> {
  await spaNavigate(page, `/k8s/ns/${namespace}/devportal.kuadrant.io~v1alpha1~APIKey`);
}

async function navigateToAPIKeyDetails(
  page: Page,
  namespace: string,
  name: string,
): Promise<void> {
  await spaNavigate(page, `/kuadrant/ns/${namespace}/apikeys/name/${name}`);
}

test.describe('API Key Lifecycle', () => {
  const uniqueId = Date.now();
  const testAPIKeyName = `test-api-key-${uniqueId}`;

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissConsoleTour(page);
  });

  test('should complete full API key lifecycle: request, reveal, and delete', async ({ page }) => {
    // Step 1: Navigate to My API Keys page
    await navigateToMyAPIKeys(page, TEST_NAMESPACE);
    await page.waitForLoadState('networkidle');

    // Verify we're on the My API Keys page
    await expect(page.getByRole('heading', { name: 'My API Keys', exact: true })).toBeVisible({
      timeout: 15000,
    });

    // Step 2: Verify list is empty (or filter to see no matching keys)
    const emptyState = page.locator('text=There are no API Keys to display');
    const tableRows = page.locator('tbody tr');

    // Either empty state is shown or no rows with our test key exist
    const isEmpty = await emptyState.isVisible({ timeout: 5000 }).catch(() => false);
    if (!isEmpty) {
      // Check that our test key doesn't exist yet
      const existingKey = page.locator(`tbody tr:has-text("${testAPIKeyName}")`);
      await expect(existingKey).not.toBeVisible();
    }

    // Step 3: Click "Request API Key" button
    const requestButton = page.locator('button:has-text("Request API Key")');
    await expect(requestButton).toBeVisible({ timeout: 10000 });
    await expect(requestButton).toBeEnabled();
    await requestButton.click();

    // Verify modal opened
    await expect(page.getByRole('heading', { name: 'Request API Key' })).toBeVisible({
      timeout: 10000,
    });

    // Step 4: Fill the request form

    // Select payment-api (has automatic approval mode)
    // Type to filter for payment-api (dropdown opens automatically when typing)
    const apiProductSearch = page.getByPlaceholder('Search API Product');
    await expect(apiProductSearch).toBeEnabled({ timeout: 30000 }); // Wait for API products to load
    await apiProductSearch.fill('payment');
    await page.waitForTimeout(1000); // Wait for dropdown to open and filter

    // Select payment-api from the filtered options
    const paymentOption = page.locator('[role="option"]:has-text("Payment API")');
    await expect(paymentOption).toBeVisible({ timeout: 5000 });
    await paymentOption.click();

    // Wait for tier options to load (payment-api should have discovered plans)
    // Select a tier (gold or silver from the PlanPolicy)
    const tierSearch = page.getByPlaceholder('Search Tier');
    await expect(tierSearch).toBeEnabled({ timeout: 30000 }); // Wait for discoveredPlans to load

    // Type a space to open dropdown and show all tiers
    await tierSearch.fill(' ');
    await page.waitForTimeout(500);

    // Select the first available tier (should be gold or silver)
    const firstTierOption = page.locator('[role="option"]').filter({ hasText: /gold|silver/i }).first();
    await expect(firstTierOption).toBeVisible({ timeout: 5000 });
    await firstTierOption.click();

    // Fill API key name
    const apiKeyNameInput = page.locator('#api-key-name');
    await apiKeyNameInput.fill(testAPIKeyName);

    // Fill use case (optional)
    const useCaseInput = page.locator('#use-case');
    await useCaseInput.fill('E2E testing API key lifecycle');

    // Submit the request
    const submitButton = page.getByRole('button', { name: 'Request', exact: true });
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    // Step 5: Verify API key appears in the list
    // Modal should close
    await expect(page.getByRole('heading', { name: 'Request API Key' })).not.toBeVisible({
      timeout: 10000,
    });

    // Wait for the API key to appear and be approved (automatic approval)
    // The controller should automatically approve it and create a secret
    const apiKeyRow = page.locator(`tbody tr:has-text("${testAPIKeyName}")`);
    await expect(apiKeyRow).toBeVisible({ timeout: 30000 });

    // Wait for status to become "Active" (Approved phase)
    // Since payment-api has automatic approval, it should be approved quickly
    await expect(apiKeyRow.locator('text=Active')).toBeVisible({ timeout: 30000 });

    // Step 6: Reveal the API key
    // Find the reveal button/link in the API Key column
    const revealButton = apiKeyRow.locator('[aria-label="Reveal API key"]');
    await expect(revealButton).toBeVisible({ timeout: 10000 });
    await revealButton.click();

    // Step 7: Go through the warning modal
    await expect(page.getByRole('heading', { name: 'Reveal API Key' })).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.locator('text=The API Key can only be viewed once'),
    ).toBeVisible();

    const revealConfirmButton = page.locator('button:has-text("Reveal")').last();
    await revealConfirmButton.click();

    // Step 8: Verify the reveal modal with the actual API key
    // The modal should now show the actual key
    await page.waitForTimeout(1000); // Wait for secret fetch

    // Verify clipboard copy component is visible
    await expect(page.locator('.pf-v6-c-clipboard-copy')).toBeVisible({ timeout: 10000 });

    // Verify the confirmation checkbox
    const confirmCheckbox = page.locator('#confirm-copied');
    await expect(confirmCheckbox).toBeVisible();

    // Check the confirmation checkbox
    await confirmCheckbox.click();

    // Close the reveal modal
    const closeButton = page.locator('button:has-text("Close")').last();
    await expect(closeButton).toBeEnabled();
    await closeButton.click();

    // Step 9: Verify "Already viewed" status appears in the list
    await page.waitForTimeout(1000); // Wait for modal to close and state to refresh

    // The reveal button should now show "Already viewed"
    const alreadyViewedIndicator = apiKeyRow.locator('text=Already viewed');
    await expect(alreadyViewedIndicator).toBeVisible({ timeout: 10000 });

    // Step 10: Navigate to API key details page
    const apiKeyNameLink = apiKeyRow.locator(`a:has-text("${testAPIKeyName}")`);
    await apiKeyNameLink.click();
    await page.waitForLoadState('networkidle');

    // Verify we're on the details page
    await expect(page.getByRole('heading', { name: testAPIKeyName, exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('text=Active').first()).toBeVisible();

    // Step 11: Verify usage examples are shown
    // The UsageExamples component renders a Card with title "Usage Examples"
    await expect(page.locator('text=Usage Examples')).toBeVisible({
      timeout: 10000,
    });

    // Step 12: Verify API key shows "Already viewed" on details page
    const detailsAlreadyViewed = page.locator('text=Already viewed');
    await expect(detailsAlreadyViewed).toBeVisible({ timeout: 5000 });

    // Step 13: Delete the API key from details page
    const deleteButton = page.locator('button:has-text("Delete")').first();
    await expect(deleteButton).toBeVisible();
    await expect(deleteButton).toBeEnabled();
    await deleteButton.click();

    // Verify delete confirmation modal appears
    await expect(page.getByRole('heading', { name: 'Delete API Key' })).toBeVisible({
      timeout: 10000,
    });

    // Type the API key name to confirm deletion
    const confirmDeleteInput = page.locator('#confirm-delete-name');
    await confirmDeleteInput.fill(testAPIKeyName);

    // Confirm deletion
    const confirmDeleteButton = page.locator('button:has-text("Delete")').last();
    await expect(confirmDeleteButton).toBeEnabled({ timeout: 5000 });
    await confirmDeleteButton.click();

    // Step 14: Verify redirect back to list page
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'My API Keys', exact: true })).toBeVisible({
      timeout: 15000,
    });

    // Step 15: Verify the API key is no longer in the list
    const deletedKeyRow = page.locator(`tbody tr:has-text("${testAPIKeyName}")`);
    await expect(deletedKeyRow).not.toBeVisible({ timeout: 10000 });
  });

  test('should show disabled request button when namespace is not selected', async ({ page }) => {
    // Navigate to all namespaces view
    await spaNavigate(page, '/k8s/all-namespaces/devportal.kuadrant.io~v1alpha1~APIKey');
    await page.waitForLoadState('networkidle');

    // Request button should be disabled in all-namespaces view
    const requestButton = page.locator('button:has-text("Request API Key")');
    await expect(requestButton).toBeVisible({ timeout: 10000 });
    await expect(requestButton).toBeDisabled();

    // Verify tooltip message
    await requestButton.hover();
    await expect(page.locator('text=Select a namespace to request an API Key')).toBeVisible({
      timeout: 5000,
    });
  });

  test('should validate API key name format in request form', async ({ page }) => {
    await navigateToMyAPIKeys(page, TEST_NAMESPACE);
    await page.waitForLoadState('networkidle');

    // Open request modal
    const requestButton = page.locator('button:has-text("Request API Key")');
    await requestButton.click();

    // Wait for modal
    await expect(page.getByRole('heading', { name: 'Request API Key' })).toBeVisible({
      timeout: 10000,
    });

    const apiKeyNameInput = page.locator('#api-key-name');
    const submitButton = page.getByRole('button', { name: 'Request', exact: true });

    // Test invalid names
    const invalidNames = [
      'UPPERCASE', // uppercase not allowed
      'test_key', // underscore not allowed
      'test key', // space not allowed
      '-testkey', // cannot start with hyphen
      'testkey-', // cannot end with hyphen
    ];

    for (const invalidName of invalidNames) {
      await apiKeyNameInput.fill(invalidName);
      await page.waitForTimeout(300);

      // Submit button should be disabled (even if other fields are filled)
      // Note: It will also be disabled because other required fields aren't filled,
      // but we're testing the validation logic
      await expect(submitButton).toBeDisabled();

      // Check for error message
      const errorMessage = page.locator('text=Must consist of lowercase alphanumeric');
      const hasError = await errorMessage.isVisible({ timeout: 1000 }).catch(() => false);
      expect(hasError).toBe(true);
    }

    // Test valid name
    await apiKeyNameInput.fill('valid-api-key-123');
    await page.waitForTimeout(300);

    // Error message should not be visible
    const errorMessage = page.locator('text=Must consist of lowercase alphanumeric');
    await expect(errorMessage).not.toBeVisible();
  });

  test('should filter API products in request form', async ({ page }) => {
    await navigateToMyAPIKeys(page, TEST_NAMESPACE);
    await page.waitForLoadState('networkidle');

    // Open request modal
    const requestButton = page.locator('button:has-text("Request API Key")');
    await requestButton.click();

    await expect(page.getByRole('heading', { name: 'Request API Key' })).toBeVisible({
      timeout: 10000,
    });

    // Type to filter API products (dropdown opens automatically when typing)
    const apiProductSearch = page.getByPlaceholder('Search API Product');
    await expect(apiProductSearch).toBeEnabled({ timeout: 10000 });
    await apiProductSearch.fill('game');
    await page.waitForTimeout(1000); // Wait for dropdown to open and filter

    // Should show gamestore-api but not payment-api
    await expect(page.locator('[role="option"]:has-text("Gamestore API")')).toBeVisible();
    const paymentOption = page.locator('[role="option"]:has-text("Payment API")');
    const paymentVisible = await paymentOption.isVisible({ timeout: 1000 }).catch(() => false);
    expect(paymentVisible).toBe(false);

    // Clear and search for payment
    await apiProductSearch.clear();
    await page.waitForTimeout(300);
    await apiProductSearch.fill('payment');
    await page.waitForTimeout(1000); // Wait for dropdown to open and filter

    // Should show payment-api but not gamestore-api
    await expect(page.locator('[role="option"]:has-text("Payment API")')).toBeVisible();
    const gamestoreOption = page.locator('[role="option"]:has-text("Gamestore API")');
    const gamestoreVisible = await gamestoreOption.isVisible({ timeout: 1000 }).catch(() => false);
    expect(gamestoreVisible).toBe(false);
  });
});
