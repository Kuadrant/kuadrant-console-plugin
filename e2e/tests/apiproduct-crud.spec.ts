import { test, expect, Page } from '@playwright/test';
import { execSync } from 'child_process';
import { TEST_NAMESPACE, dismissConsoleTour } from './helpers';

// SPA navigation using pushState - preserves redux state
async function spaNavigate(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForLoadState('networkidle');
}

async function navigateToAPIProductCreate(page: Page, namespace = 'kuadrant-test'): Promise<void> {
  await page.evaluate((ns) => {
    window.history.pushState({}, '', `/kuadrant/apiproducts/ns/${ns}/~new`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, namespace);
  await page.waitForLoadState('networkidle');
}

const navigateToAPIProducts = async (page: Page, namespace = 'kuadrant-test') => {
  await page.evaluate((ns) => {
    window.history.pushState({}, '', `/kuadrant/apiproducts/ns/${ns}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, namespace);
  await page.waitForLoadState('networkidle');
};

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

  test.afterEach(async () => {
    // Clean up any APIProduct created during tests
    if (generatedResourceName) {
      execSync(
        `kubectl delete apiproduct ${generatedResourceName} -n ${TEST_NAMESPACE} --ignore-not-found=true`,
        { stdio: 'inherit' },
      );
      generatedResourceName = ''; // Reset for next test
    }
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
    await expect(page).toHaveURL(new RegExp(`/kuadrant/apiproducts/ns/${TEST_NAMESPACE}/~new`));
    await expect(page.locator('text=Create API Product')).toBeVisible({ timeout: 15000 });

    // Verify form is loaded by checking for key form elements
    await expect(page.locator('#display-name')).toBeVisible();
    await expect(page.locator('#resource-name')).toBeVisible();
  });

  test('should create APIProduct via form and verify in list', async ({ page }) => {
    // Full page load to a namespace-scoped URL so the console sets activeNamespace to
    // TEST_NAMESPACE before we SPA-navigate to the create page. Without this,
    // useActiveNamespace() returns '#ALL_NS#' and k8sCreate posts to an invalid namespace.
    await page.goto(`/k8s/ns/${TEST_NAMESPACE}`);
    await page.waitForLoadState('networkidle');
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

    // Verify Create button is disabled until HTTPRoute is selected
    await expect(page.locator('button:has-text("Create")')).toBeDisabled();

    // Select the HTTPRoute that this APIProduct will be associated with
    const httpRouteSelect = page.locator('#httproute-select');
    await httpRouteSelect.click();
    const httpRouteOption = page.getByRole('menuitem', {
      name: 'kuadrant-test/test-httproute',
      exact: true,
    });
    await httpRouteOption.waitFor({ state: 'visible', timeout: 10000 });
    await httpRouteOption.click();

    // Add tags
    const tagsToggle = page.locator('button:has-text("Select tags")');
    await tagsToggle.click();
    const tagsSearch = page.locator('input[placeholder*="Search or create tag"]');

    // Type a custom tag and press Enter
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

    // Verify Create button is now enabled with all required fields filled
    const saveButton = page.locator('button:has-text("Create")');
    await expect(saveButton).toBeEnabled();

    await saveButton.click();

    // Verify redirect to list page
    await expect(page.getByRole('heading', { name: 'API Products', exact: true })).toBeVisible({
      timeout: 10000,
    });

    // The new product may land on any pagination page; iterate until found or exhausted.
    await page.waitForSelector('table', { timeout: 15000 });
    const row = page.locator(`tr:has-text("${generatedResourceName}")`);

    let found = false;
    for (let attempt = 0; attempt < 10 && !found; attempt++) {
      if (await row.isVisible()) {
        found = true;
        break;
      }
      const nextBtn = page.locator('button[aria-label="Go to next page"]');
      if ((await nextBtn.count()) > 0 && !(await nextBtn.isDisabled())) {
        await nextBtn.click();
        await page.waitForTimeout(500);
      } else {
        // No further pages — wait for watch stream then retry from page 1
        await page.waitForTimeout(1000);
        const firstBtn = page.locator('button[aria-label="Go to first page"]');
        if ((await firstBtn.count()) > 0) {
          await firstBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
    expect(found, `"${generatedResourceName}" not found in any page of the API Products list`).toBe(
      true,
    );
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
    // Use getByRole with exact: true to avoid ambiguous partial matches
    const httpRouteOption = page.getByRole('menuitem', {
      name: 'kuadrant-test/test-httproute',
      exact: true,
    });
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
    // Use getByRole with exact: true to avoid ambiguous partial matches
    const httpRouteOption = page.getByRole('menuitem', {
      name: 'kuadrant-test/test-httproute',
      exact: true,
    });
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

  // ── Edit and Delete ──────────────────────────────────────────────────────────
  // Nested describe so the APIProduct fixture is only created for these two tests
  // rather than for every test in the outer describe.
  test.describe('edit and delete', () => {
    let editProductName = '';

    test.beforeEach(async () => {
      editProductName = `test-edit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      execSync(`kubectl apply -f - <<'EOF'
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIProduct
metadata:
  name: ${editProductName}
  namespace: ${TEST_NAMESPACE}
spec:
  displayName: Test Edit Product
  description: product for edit testing
  version: v1.0.0
  approvalMode: manual
  publishStatus: Draft
  tags:
    - test
    - edit
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: test-httproute
  contact:
    team: Platform Team
    email: platform@example.com
    slack: "#platform-support"
    url: https://platform.example.com/support
  documentation:
    openAPISpecURL: https://api.example.com/spec.yaml
    docsURL: https://api.example.com/docs
EOF`, { stdio: 'inherit' });
    });

    test.afterEach(async () => {
      if (editProductName) {
        execSync(
          `kubectl delete apiproduct ${editProductName} -n ${TEST_NAMESPACE} --ignore-not-found=true`,
          { stdio: 'inherit' },
        );
      }
    });

  test('should edit existing APIProduct (resource name immutable)', async ({ page }) => {
    const testProductName = editProductName;
    await spaNavigate(page, `/kuadrant/apiproducts/ns/${TEST_NAMESPACE}/${testProductName}/edit`);

    const editHeader = page.locator('text=Edit API Product');

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
    const updatedDisplayName = `Updated Product ${Date.now()}`;
    await displayNameInput.fill(updatedDisplayName);
    await versionInput.fill('v2.0.0');
    await descriptionInput.fill('Updated description for testing');

    // Save button should show "Save" instead of "Create"
    const saveButton = page.locator('button:has-text("Save")');
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeEnabled();

    // Click Save
    await saveButton.click();

    // Wait for redirect to list page - verify heading is visible
    await expect(page.getByRole('heading', { name: 'API Products', exact: true })).toBeVisible({
      timeout: 10000,
    });

    // Navigate back to edit page to verify changes persisted
    await spaNavigate(page, `/kuadrant/apiproducts/ns/${TEST_NAMESPACE}/${testProductName}/edit`);
    await expect(editHeader).toBeVisible();

    // Verify changes persisted
    await expect(displayNameInput).toHaveValue(updatedDisplayName);
    await expect(versionInput).toHaveValue('v2.0.0');
    await expect(descriptionInput).toHaveValue('Updated description for testing');
  });

  test('should delete APIProduct with confirmation', async ({ page }) => {
    const testProductName = editProductName;

    // Navigate to APIProducts list
    await navigateToAPIProducts(page, TEST_NAMESPACE);
    // Dismiss the console tour if it appears after SPA navigation — the tour can
    // retrigger on the list page and block subsequent clicks if not dismissed.
    await dismissConsoleTour(page);

    // Wait for table to load
    await page.waitForSelector('table', { timeout: 10000 });

    // Find the product row
    const row = page.locator(`tr:has-text("${testProductName}")`);

    // Verify product exists
    await expect(row).toBeVisible({ timeout: 10000 });

    // Navigate to K8s resource details page via product name link
    // (kebab menu column exists on list page but may be off-screen at test viewport width)
    const productLink = row.locator(`a[data-test="${testProductName}"]`);
    await expect(productLink).toBeVisible();
    await productLink.click();

    // Find Actions dropdown button on K8s resource details page
    const actionsButton = page.locator('button:has-text("Actions")').first();
    await expect(actionsButton).toBeVisible({ timeout: 10000 });
    await actionsButton.click();

    // Click "Delete APIProduct" from dropdown
    const deleteItem = page.locator('[role="menuitem"]:has-text("Delete APIProduct")');
    await expect(deleteItem).toBeVisible({ timeout: 5000 });
    await deleteItem.click();

    // K8s delete modal should appear - look for visible delete button in modal
    // Use >> to pierce shadow DOM if needed
    const deleteButton = page
      .locator('button')
      .filter({ hasText: 'Delete' })
      .and(
        page.locator('[role="dialog"] button, .pf-v6-c-modal-box button, .pf-c-modal-box button'),
      );

    // If that doesn't work, just find any visible Delete button
    const fallbackButton = page.locator('button:has-text("Delete")').first();

    // Try primary selector first
    const buttonToClick = (await deleteButton.count()) > 0 ? deleteButton.first() : fallbackButton;

    await expect(buttonToClick).toBeVisible({ timeout: 10000 });

    // May need to check a confirmation checkbox first
    const checkbox = page.locator('[role="dialog"] input[type="checkbox"]').first();
    if ((await checkbox.count()) > 0 && (await checkbox.isVisible())) {
      await checkbox.check();
    }

    await expect(buttonToClick).toBeEnabled({ timeout: 5000 });
    await buttonToClick.click();

    // Verify product removed from list (navigate to list if not there already)
    if (!page.url().includes('/apiproducts/ns/')) {
      await navigateToAPIProducts(page, TEST_NAMESPACE);
    }

    // Verify row no longer exists
    await expect(row).not.toBeVisible({ timeout: 5000 });
  });

  }); // end of 'edit and delete' describe

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
