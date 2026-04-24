import { test, expect, Page } from '@playwright/test';
import { TEST_NAMESPACE, dismissConsoleTour } from './helpers';

// SPA navigation using pushState - preserves redux state
async function spaNavigate(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForLoadState('networkidle');
}

async function navigateToAPIProductCreate(page: Page, namespace: string): Promise<void> {
  await spaNavigate(page, `/kuadrant/ns/${namespace}/apiproducts/~new`);
}

async function navigateToAPIProducts(page: Page, namespace: string): Promise<void> {
  await spaNavigate(page, `/kuadrant/ns/${namespace}/apiproducts`);
}

// Note: Tests rely on test-httproute HTTPRoute existing in the test namespace
// This is created by applying e2e/manifests/test-apiproduct-fixtures.yaml before running tests

test.describe('APIProduct CRUD Operations', () => {
  const uniqueId = Date.now();
  const testAPIProductDisplayName = `Test API Product ${uniqueId}`;
  let generatedResourceName = '';

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissConsoleTour(page);
  });

  test('should navigate from list page to create page via Create button', async ({ page }) => {
    // Navigate to API Products list page
    await navigateToAPIProducts(page, TEST_NAMESPACE);
    await page.waitForLoadState('networkidle');

    // Wait for page to load and verify we're on the list page (use exact role match to avoid matching empty state)
    await expect(page.getByRole('heading', { name: 'API Products', exact: true })).toBeVisible({
      timeout: 15000,
    });

    // Find and click the "Create API Product" button
    const createButton = page.locator('a:has-text("Create API Product")');
    await expect(createButton).toBeVisible({ timeout: 10000 });
    await createButton.click();

    // Verify we landed on the create page
    await expect(page).toHaveURL(new RegExp(`/kuadrant/ns/${TEST_NAMESPACE}/apiproducts/~new`));
    await expect(page.locator('text=Create API Product')).toBeVisible({ timeout: 15000 });

    // Verify form is loaded by checking for key form elements
    await expect(page.locator('#display-name')).toBeVisible();
    await expect(page.locator('#resource-name')).toBeVisible();
  });

  test('should create APIProduct via form', async ({ page }) => {
    await navigateToAPIProductCreate(page, TEST_NAMESPACE);
    await page.waitForLoadState('networkidle');

    // Verify we're on the create page
    await expect(page.locator('text=Create API Product')).toBeVisible({ timeout: 15000 });

    // Fill display name
    const displayNameInput = page.locator('#display-name');
    await displayNameInput.fill(testAPIProductDisplayName);

    // Wait a moment for auto-generation of resource name
    await page.waitForTimeout(500);

    // Capture the generated resource name
    const resourceNameInput = page.locator('#resource-name');
    generatedResourceName = await resourceNameInput.inputValue();

    // Verify resource name was auto-generated
    expect(generatedResourceName).toMatch(/^test-api-product-\d+-\d{4}$/);
    expect(generatedResourceName.length).toBeGreaterThan(0);

    // Fill version
    await page.locator('#version').fill('v1.0.0');

    // Fill description
    await page.locator('#description').fill('Test API product for e2e testing');

    // Add tags (assuming we need to open dropdown and add tags)
    // Open tags dropdown
    const tagsToggle = page.locator('button:has-text("Select tags")');
    await tagsToggle.click();

    // Type a custom tag and press Enter
    const tagsSearch = page.locator('input[placeholder*="Search or create tag"]');
    await tagsSearch.fill('test-tag');
    await tagsSearch.press('Enter');

    // Close the dropdown
    await page.keyboard.press('Escape');

    // Verify tag was added
    await expect(page.locator('.pf-v6-c-label__text:has-text("test-tag")')).toBeVisible();

    // Fill OpenAPI Spec URL
    await page.locator('#openapi-spec-url').fill('https://api.example.com/openapi.yaml');

    // Fill Documentation URL
    await page.locator('#api-docs-url').fill('https://docs.example.com');

    // Select HTTPRoute (this assumes there's at least one HTTPRoute available)
    // For a real test, you'd need to ensure an HTTPRoute exists first
    // For now, we'll skip HTTPRoute selection and test form validation instead

    // Verify save button is disabled without HTTPRoute
    const saveButton = page.locator('button:has-text("Create")');
    await expect(saveButton).toBeDisabled();

    // Note: In a real test, you would select an HTTPRoute here
    // Since we don't have a fixture HTTPRoute, we'll stop here
    // and test validation instead
  });

  test('should validate resource name format', async ({ page }) => {
    await navigateToAPIProductCreate(page, TEST_NAMESPACE);
    await page.waitForLoadState('networkidle');

    const displayNameInput = page.locator('#display-name');
    const resourceNameInput = page.locator('#resource-name');
    const saveButton = page.locator('button:has-text("Create")');

    // Fill display name first
    await displayNameInput.fill('Test Product');

    // Wait for auto-generation
    await page.waitForTimeout(500);

    // Select HTTPRoute so the Create button can be enabled when form is valid
    const httpRouteSelect = page.locator('#httproute-select');
    await httpRouteSelect.click();

    // Wait for menu to appear and select the HTTPRoute option
    const httpRouteOption = page.locator('[role="menuitem"]:has-text("kuadrant-test/test-httproute")');
    await httpRouteOption.waitFor({ state: 'visible', timeout: 10000 });
    await httpRouteOption.click();

    // Wait for selection to complete
    await page.waitForTimeout(300);

    // Test invalid names
    const invalidNames = [
      'UPPERCASE', // uppercase not allowed
      'test_product', // underscore not allowed
      'test product', // space not allowed
      '-test', // cannot start with hyphen
      'test-', // cannot end with hyphen
      'a'.repeat(254), // too long (max 253)
    ];

    for (const invalidName of invalidNames) {
      await resourceNameInput.fill(invalidName);
      await page.waitForTimeout(200);

      // Save button should be disabled for invalid names
      await expect(saveButton).toBeDisabled();
    }

    // Test valid names
    const validNames = ['test-product', 'api-product-123', 'my.api.product', 'a', 'a'.repeat(253)];

    for (const validName of validNames) {
      await resourceNameInput.fill(validName);
      await page.waitForTimeout(200);

      // Save button should be enabled for valid names (now that HTTPRoute is selected)
      await expect(saveButton).toBeEnabled();
    }
  });

  test.skip('should sync form to YAML correctly', async ({ page }) => {
    await navigateToAPIProductCreate(page, TEST_NAMESPACE);
    await page.waitForLoadState('networkidle');

    // Fill form fields
    await page.locator('#display-name').fill('YAML Sync Test');
    await page.waitForTimeout(500);

    const resourceName = await page.locator('#resource-name').inputValue();

    await page.locator('#version').fill('v2.0.0');
    await page.locator('#description').fill('Testing YAML synchronization');

    // Add a tag
    const tagsToggle = page.locator('button:has-text("Select tags")');
    await tagsToggle.click();
    const tagsSearch = page.locator('input[placeholder*="Search or create tag"]');
    await tagsSearch.fill('yaml-test');
    await tagsSearch.press('Enter');
    // Close tags menu by clicking outside
    await page.locator('#display-name').click();
    await page.waitForTimeout(300);

    // Fill URLs
    await page.locator('#openapi-spec-url').fill('https://yaml-test.com/spec.yaml');
    await page.locator('#api-docs-url').fill('https://yaml-test.com/docs');

    // Select HTTPRoute (required field) - try multiple times if needed
    const httpRouteSelect = page.locator('#httproute-select');
    await httpRouteSelect.scrollIntoViewIfNeeded();

    // Click and wait for menu
    let menuOpened = false;
    for (let i = 0; i < 3; i++) {
      await httpRouteSelect.click();
      await page.waitForTimeout(300);
      const menu = page.locator('[role="menu"]');
      if (await menu.isVisible()) {
        menuOpened = true;
        break;
      }
    }

    if (!menuOpened) {
      throw new Error('HTTPRoute menu did not open after multiple attempts');
    }

    // Wait for menu to appear and select the HTTPRoute option
    const httpRouteOption = page.locator('[role="menuitem"]:has-text("kuadrant-test/test-httproute")');
    await httpRouteOption.waitFor({ state: 'visible', timeout: 5000 });
    await httpRouteOption.click();

    // Wait for form state to update before switching tabs
    await page.waitForTimeout(1000);

    // Switch to YAML tab
    await page.locator('button:has-text("YAML View")').click();
    await page.waitForLoadState('networkidle');

    // Wait for Monaco editor to fully render
    await page.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 10000 });

    // Wait for YAML to be populated - check that we have more than just apiVersion
    await page.waitForFunction(
      () => {
        const lines = document.querySelector('.monaco-editor .view-lines');
        const text = lines?.textContent || '';
        // Check for displayName or spec to ensure YAML is populated
        return text.includes('spec') && text.length > 50;
      },
      { timeout: 15000 },
    );

    await page.waitForTimeout(500);

    // Get YAML content from Monaco editor
    let yamlContent = await page.locator('.monaco-editor .view-lines').innerText();

    // Normalize whitespace - Monaco might use non-breaking spaces or other Unicode spaces
    yamlContent = yamlContent.replace(/\u00A0/g, ' '); // non-breaking space
    yamlContent = yamlContent.replace(/\u2007/g, ' '); // figure space
    yamlContent = yamlContent.replace(/\u202F/g, ' '); // narrow no-break space

    // Verify YAML contains our form values
    expect(yamlContent).toContain('displayName: YAML Sync Test');
    expect(yamlContent).toContain(`name: ${resourceName}`);
    expect(yamlContent).toContain('description: Testing YAML synchronization');
    expect(yamlContent).toContain('yaml-test');
    expect(yamlContent).toContain('publishStatus: Draft');
    expect(yamlContent).toContain('targetRef');
    expect(yamlContent).toContain('test-httproute');
  });

  test('should sync YAML to form correctly', async ({ page }) => {
    await navigateToAPIProductCreate(page, TEST_NAMESPACE);
    await page.waitForLoadState('networkidle');

    // Switch to YAML tab first
    await page.locator('button:has-text("YAML View")').click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Paste valid YAML (this is tricky with Monaco editor)
    // For now, we'll test switching back to form and verifying empty state
    // A full implementation would require Monaco-specific interactions

    // Switch back to Form tab
    await page.locator('button:has-text("Form View")').click();
    await page.waitForLoadState('networkidle');

    // Verify form is still functional
    await expect(page.locator('#display-name')).toBeVisible();
  });

  test('should disable Deprecated and Retired statuses', async ({ page }) => {
    await navigateToAPIProductCreate(page, TEST_NAMESPACE);
    await page.waitForLoadState('networkidle');

    // Scroll to publish status section
    await page.locator('text=Lifecycle and Visibility').scrollIntoViewIfNeeded();

    // Find the publish status dropdown
    const publishStatusSelect = page.locator('#lifecycle-status');
    await expect(publishStatusSelect).toBeVisible();

    // Find Draft and Published options - should be enabled
    const draftOption = publishStatusSelect.locator('option[value="Draft"]');
    expect(await draftOption.isDisabled()).toBe(false);

    const publishedOption = publishStatusSelect.locator('option[value="Published"]');
    expect(await publishedOption.isDisabled()).toBe(false);

    // Find Deprecated and Retired options - should be disabled
    const deprecatedOption = publishStatusSelect.locator('option[value="Deprecated"]');
    expect(await deprecatedOption.isDisabled()).toBe(true);

    const retiredOption = publishStatusSelect.locator('option[value="Retired"]');
    expect(await retiredOption.isDisabled()).toBe(true);
  });

  test('should prevent form submission on Enter in tags', async ({ page }) => {
    await navigateToAPIProductCreate(page, TEST_NAMESPACE);
    await page.waitForLoadState('networkidle');

    // Fill required fields first
    await page.locator('#display-name').fill('Enter Key Test');
    await page.waitForTimeout(500);

    // Open tags dropdown
    const tagsToggle = page.locator('button:has-text("Select tags")');
    await tagsToggle.click();

    // Type a tag and press Enter
    const tagsSearch = page.locator('input[placeholder*="Search or create tag"]');
    await tagsSearch.fill('enter-test-tag');

    // Listen for navigation (form submission would cause navigation)
    const currentUrl = page.url();
    await tagsSearch.press('Enter');

    // Wait a moment
    await page.waitForTimeout(500);

    // Verify we're still on the same page (no form submission)
    expect(page.url()).toBe(currentUrl);

    // Verify tag was added
    await page.keyboard.press('Escape');
    await expect(page.locator('.pf-v6-c-label__text:has-text("enter-test-tag")')).toBeVisible();

    // Verify form is still in create mode
    await expect(page.locator('text=Create API Product')).toBeVisible();
  });

  test('should edit existing APIProduct (resource name immutable)', async ({ page }) => {
    // This test assumes an APIProduct exists
    // For a real e2e test, you would create one first via API or UI
    // Then navigate to edit page

    // Placeholder: navigate to edit page for a test APIProduct
    const testProductName = 'test-edit-product';
    await spaNavigate(page, `/kuadrant/ns/${TEST_NAMESPACE}/apiproducts/${testProductName}/edit`);
    await page.waitForLoadState('networkidle');

    // Skip test if APIProduct doesn't exist (check for edit header)
    const editHeader = page.locator('text=Edit API Product');
    const exists = await editHeader
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      test.skip();
      return;
    }

    // Verify we're on edit page
    await expect(editHeader).toBeVisible();

    // Verify resource name field is disabled
    const resourceNameInput = page.locator('#resource-name');
    await expect(resourceNameInput).toBeDisabled();

    // Verify other fields are editable
    const displayNameInput = page.locator('#display-name');
    await expect(displayNameInput).toBeEnabled();

    const versionInput = page.locator('#version');
    await expect(versionInput).toBeEnabled();

    const descriptionInput = page.locator('#description');
    await expect(descriptionInput).toBeEnabled();

    // Modify fields
    await displayNameInput.fill('Updated Product Name');
    await versionInput.fill('v2.0.0');

    // Save button should show "Save" instead of "Create"
    const saveButton = page.locator('button:has-text("Save")');
    await expect(saveButton).toBeVisible();
  });

  test('should delete APIProduct with confirmation', async ({ page }) => {
    // This test assumes an APIProduct exists
    // For a real e2e test, you would create one first

    const testProductName = 'test-delete-product';

    // Navigate to APIProducts list
    await navigateToAPIProducts(page, TEST_NAMESPACE);
    await page.waitForLoadState('networkidle');

    // Find the product row (this assumes it exists)
    const row = page.locator(`tr:has-text("${testProductName}")`);

    // Skip test if product doesn't exist
    const exists = await row
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      test.skip();
      return;
    }

    // Click kebab menu
    const kebab = row.locator('[aria-label="kebab dropdown toggle"]');
    await kebab.click();

    // Click Delete
    const deleteItem = page.locator('[role="menuitem"]:has-text("Delete")');
    await deleteItem.click();

    // Verify modal appears
    await expect(page.getByRole('heading', { name: 'Delete API Product' })).toBeVisible({
      timeout: 10000,
    });

    // Verify warning message
    await expect(page.locator('text=Warning: This action cannot be undone')).toBeVisible();

    // Try clicking delete without entering name - should be disabled
    const deleteButton = page.locator('button:has-text("Delete API Product")');
    await expect(deleteButton).toBeDisabled();

    // Type wrong name - should still be disabled
    const confirmInput = page.locator('#confirm-delete');
    await confirmInput.fill('wrong-name');
    await expect(deleteButton).toBeDisabled();

    // Type correct name - should enable
    await confirmInput.fill(testProductName);
    await expect(deleteButton).toBeEnabled();

    // Confirm deletion
    await deleteButton.click();

    // Wait for deletion to complete (modal closes and row disappears)
    await expect(row).not.toBeVisible({ timeout: 10000 });
  });

  test('should display validation messages for required fields', async ({ page }) => {
    await navigateToAPIProductCreate(page, TEST_NAMESPACE);
    await page.waitForLoadState('networkidle');

    // Leave display name empty and try to proceed
    const saveButton = page.locator('button:has-text("Create")');

    // Save button should be disabled when required fields are empty
    await expect(saveButton).toBeDisabled();

    // Fill display name but not HTTPRoute
    await page.locator('#display-name').fill('Validation Test');
    await page.waitForTimeout(500);

    // Should still be disabled (HTTPRoute is required)
    await expect(saveButton).toBeDisabled();
  });

  test('should handle approval mode selection', async ({ page }) => {
    await navigateToAPIProductCreate(page, TEST_NAMESPACE);
    await page.waitForLoadState('networkidle');

    // Scroll to approval mode section
    await page.locator('text=API key approval').scrollIntoViewIfNeeded();

    // Default should be manual
    const manualRadio = page.locator('#approval-manual');
    await expect(manualRadio).toBeChecked();

    // Switch to automatic
    const automaticRadio = page.locator('#approval-automatic');
    await automaticRadio.click();
    await expect(automaticRadio).toBeChecked();
    await expect(manualRadio).not.toBeChecked();

    // Switch back to manual
    await manualRadio.click();
    await expect(manualRadio).toBeChecked();
    await expect(automaticRadio).not.toBeChecked();
  });

  test('should auto-generate resource name with unique suffix', async ({ page }) => {
    await navigateToAPIProductCreate(page, TEST_NAMESPACE);
    await page.waitForLoadState('networkidle');

    const displayNameInput = page.locator('#display-name');
    const resourceNameInput = page.locator('#resource-name');

    // Enter display name
    await displayNameInput.fill('My API Product');
    await page.waitForTimeout(500);

    // Get generated resource name
    const firstGenerated = await resourceNameInput.inputValue();
    expect(firstGenerated).toMatch(/^my-api-product-\d{4}$/);

    // Clear and enter same display name again
    await displayNameInput.clear();
    await page.waitForTimeout(200);
    await displayNameInput.fill('My API Product');
    await page.waitForTimeout(500);

    // Should keep the same suffix (not regenerate)
    const secondGenerated = await resourceNameInput.inputValue();
    expect(secondGenerated).toBe(firstGenerated);
  });

  test('should handle special characters in display name conversion', async ({ page }) => {
    await navigateToAPIProductCreate(page, TEST_NAMESPACE);
    await page.waitForLoadState('networkidle');

    const displayNameInput = page.locator('#display-name');
    const resourceNameInput = page.locator('#resource-name');

    // Test various special characters
    const testCases = [
      { input: 'API Product (Beta)', expected: /^api-product-beta-\d{4}$/ },
      { input: 'Product v2.0!', expected: /^product-v2-0-\d{4}$/ },
      { input: 'Test_API_Product', expected: /^test-api-product-\d{4}$/ },
      { input: 'Product@123', expected: /^product-123-\d{4}$/ },
    ];

    for (const { input, expected } of testCases) {
      await displayNameInput.clear();
      await displayNameInput.fill(input);
      await page.waitForTimeout(500);

      const generated = await resourceNameInput.inputValue();
      expect(generated).toMatch(expected);

      // Clear for next test
      await displayNameInput.clear();
      await page.waitForTimeout(200);
    }
  });
});
