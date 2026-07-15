import { test, expect, Page } from '@playwright/test';
import { execSync } from 'child_process';
import { TEST_NAMESPACE, dismissConsoleTour, spaNavigate, navigateToAPIProducts } from './helpers';

async function navigateToAPIProductCreate(page: Page, namespace = 'kuadrant-test'): Promise<void> {
  await spaNavigate(page, `/kuadrant/apiproducts/ns/${namespace}/~new`);
  await dismissConsoleTour(page);
}

// Scroll through all pagination pages looking for a row matching `text`.
// Retries up to `maxAttempts` times, waiting for the watch stream between pages.
async function findRowWithPagination(page: Page, text: string, maxAttempts = 10): Promise<boolean> {
  const row = page.locator(`tr:has-text("${text}")`);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (await row.isVisible()) return true;
    const nextBtn = page.locator('button[aria-label="Go to next page"]');
    if ((await nextBtn.count()) > 0 && !(await nextBtn.isDisabled())) {
      await nextBtn.click();
      await page.waitForTimeout(500);
    } else {
      await page.waitForTimeout(1000);
      const firstBtn = page.locator('button[aria-label="Go to first page"]');
      if ((await firstBtn.count()) > 0) {
        await firstBtn.click();
        await page.waitForTimeout(500);
      }
    }
  }
  return false;
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

  test('should navigate from list page to create page via Create button', { tag: '@smoke' }, async ({ page }) => {
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

  test('should create APIProduct via form and verify in list', { tag: '@smoke' }, async ({ page }) => {
    // Full page load to a namespace-scoped URL so the console sets activeNamespace to
    // TEST_NAMESPACE before we SPA-navigate to the create page. Without this,
    // useActiveNamespace() returns '#ALL_NS#' and k8sCreate posts to an invalid namespace.
    await page.goto(`/k8s/ns/${TEST_NAMESPACE}`);
    await page.waitForLoadState('networkidle');
    await navigateToAPIProductCreate(page, TEST_NAMESPACE);
    // Wait for form to render — confirms routing and component mount, not just URL change
    await expect(page.locator('#display-name')).toBeVisible({ timeout: 20000 });

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
    await expect(page.locator('table').first()).toBeVisible({ timeout: 10000 });
    const found = await findRowWithPagination(page, generatedResourceName);
    expect(found, `"${generatedResourceName}" not found in any page of the API Products list`).toBe(true);
  });

  test('should validate resource name format', { tag: '@nightly' }, async ({ page }) => {
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

  test('should sync between Form and YAML views', { tag: '@smoke' }, async ({ page }) => {
    // Full page load first so activeNamespace is set correctly before SPA navigation
    await page.goto(`/k8s/ns/${TEST_NAMESPACE}`);
    await page.waitForLoadState('networkidle');
    await navigateToAPIProductCreate(page, TEST_NAMESPACE);
    await expect(page.locator('#display-name')).toBeVisible({ timeout: 20000 });

    // Fill form fields
    await page.locator('#display-name').fill('YAML Sync Test');

    // Wait for resource name auto-generation
    await expect(page.locator('#resource-name')).not.toHaveValue('', { timeout: 3000 });
    const resourceName = await page.locator('#resource-name').inputValue();

    await page.locator('#version').fill('v2.0.0');
    await page.locator('#description').fill('Testing YAML synchronization');

    // Add a tag
    const tagsToggle = page.locator('button:has-text("Select tags")');
    await tagsToggle.click();
    const tagsSearch = page.locator('input[placeholder*="Search or create tag"]');
    await tagsSearch.fill('yaml-test');
    await tagsSearch.press('Enter');
    // Close tags menu by clicking outside and wait for tag label to confirm close
    await page.locator('#display-name').click();
    await expect(page.locator('.pf-v6-c-label__text:has-text("yaml-test")')).toBeVisible({
      timeout: 3000,
    });

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
      const menu = page.locator('[role="menu"]');
      await menu.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
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

    // Wait for form state to update (Create button enables once HTTPRoute is selected)
    await expect(page.locator('button:has-text("Create")')).toBeEnabled({ timeout: 5000 });

    // Form -> YAML: verify YAML reflects form values
    await page.locator('button:has-text("YAML View")').click();
    await page.waitForLoadState('networkidle');

    // Poll Monaco API directly until YAML is populated
    const yamlHandle = await page.waitForFunction(
      () => {
        const monaco = (
          window as unknown as {
            monaco?: { editor?: { getModels?: () => { getValue(): string }[] } };
          }
        ).monaco;
        const models = monaco?.editor?.getModels?.();
        if (!models || models.length === 0) return null;
        const value = models[0].getValue();
        return value.includes('spec') && value.length > 50 ? value : null;
      },
      { timeout: 15000 },
    );
    const yamlContent = (await yamlHandle.jsonValue()) as string;

    expect(yamlContent, 'Monaco model was empty - YAML did not populate').toBeTruthy();
    expect(yamlContent).toContain('displayName: YAML Sync Test');
    expect(yamlContent).toContain(`name: ${resourceName}`);
    expect(yamlContent).toContain('description: Testing YAML synchronization');
    expect(yamlContent).toContain('yaml-test');
    expect(yamlContent).toContain('publishStatus: Draft');
    expect(yamlContent).toContain('targetRef');
    expect(yamlContent).toContain('test-httproute');

    // State retention: verify form values survive a tab switch to YAML and back
    await page.locator('button:has-text("Form View")').click();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#display-name')).toHaveValue('YAML Sync Test');
    await expect(page.locator('#resource-name')).toHaveValue(resourceName);
    await expect(page.locator('#version')).toHaveValue('v2.0.0');
    await expect(page.locator('#description')).toHaveValue('Testing YAML synchronization');
    await expect(page.locator('#httproute-select')).toContainText('test-httproute');
  });

  test('should disable Deprecated and Retired statuses', { tag: '@nightly' }, async ({ page }) => {
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

  test('should prevent form submission on Enter in tags', { tag: '@nightly' }, async ({ page }) => {
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

  test('should create APIProduct via YAML view and verify in list', { tag: '@smoke' }, async ({ page }) => {
    await page.goto(`/k8s/ns/${TEST_NAMESPACE}`);
    await page.waitForLoadState('networkidle');
    await navigateToAPIProductCreate(page, TEST_NAMESPACE);
    await page.waitForSelector('#display-name', { state: 'visible', timeout: 20000 });

    // Switch to YAML view
    await page.locator('button:has-text("YAML View")').click();
    await page.waitForLoadState('networkidle');

    const yamlProductName = `yaml-product-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    generatedResourceName = yamlProductName;

    const yamlContent = `apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIProduct
metadata:
  name: ${yamlProductName}
  namespace: ${TEST_NAMESPACE}
spec:
  displayName: YAML Created Product
  description: Created via YAML view in e2e test
  version: v1.0.0
  approvalMode: manual
  publishStatus: Draft
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: test-httproute`;

    // Wait for Monaco to initialise
    await page.waitForFunction(
      () => {
        const monaco = (window as unknown as { monaco?: { editor?: { getModels?: () => unknown[] } } }).monaco;
        return (monaco?.editor?.getModels?.()?.length ?? 0) > 0;
      },
      { timeout: 20000 },
    );

    // Set YAML content via Monaco API (triggers onDidChangeModelContent → onChange)
    await page.evaluate((yaml) => {
      const monaco = (window as unknown as { monaco?: { editor?: { getModels?: () => { setValue(v: string): void }[] } } }).monaco;
      monaco?.editor?.getModels?.()[0]?.setValue(yaml);
    }, yamlContent);

    await page.waitForTimeout(500);

    // Click the Create button rendered by ResourceYAMLEditor
    const createButton = page.locator('button:has-text("Create")').last();
    await expect(createButton).toBeEnabled({ timeout: 10000 });
    await createButton.click();

    // ResourceYAMLEditor navigates to the k8s details page after creation (not our custom page).
    // Use a full page.goto() so the console properly loads our custom list route.
    await page.goto(`/kuadrant/apiproducts/ns/${TEST_NAMESPACE}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('table', { timeout: 15000 });

    const found = await findRowWithPagination(page, yamlProductName);
    expect(found, `"${yamlProductName}" not found in any page of the API Products list`).toBe(true);
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

  test('should edit existing APIProduct (resource name immutable)', { tag: '@smoke' }, async ({ page }) => {
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

  test('should delete APIProduct with confirmation', { tag: '@smoke' }, async ({ page }) => {
    const testProductName = editProductName;

    // Navigate to APIProducts list
    await navigateToAPIProducts(page, TEST_NAMESPACE);
    // Dismiss the console tour if it appears after SPA navigation — the tour can
    // retrigger on the list page and block subsequent clicks if not dismissed.
    await dismissConsoleTour(page);

    // Wait for table to load
    await expect(page.locator('table').first()).toBeVisible({ timeout: 10000 });

    // The new product may land on any pagination page; iterate until found or exhausted.
    const found = await findRowWithPagination(page, testProductName);
    expect(found, `"${testProductName}" not found in any page of the API Products list`).toBe(true);
    const row = page.locator(`tr:has-text("${testProductName}")`);

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

  test('should edit existing APIProduct via YAML view and verify changes persist', { tag: '@smoke' }, async ({ page }) => {
    const testProductName = editProductName;
    await spaNavigate(page, `/kuadrant/apiproducts/ns/${TEST_NAMESPACE}/${testProductName}/edit`);

    await expect(page.locator('text=Edit API Product')).toBeVisible({ timeout: 15000 });

    // Switch to YAML view
    await page.locator('button:has-text("YAML View")').click();
    await page.waitForLoadState('networkidle');

    // Wait for Monaco to initialise with existing resource YAML
    const yamlHandle = await page.waitForFunction(
      () => {
        const monaco = (window as unknown as { monaco?: { editor?: { getModels?: () => { getValue(): string }[] } } }).monaco;
        const models = monaco?.editor?.getModels?.();
        if (!models || models.length === 0) return null;
        const value = models[0].getValue();
        return value.includes('spec') && value.length > 50 ? value : null;
      },
      { timeout: 15000 },
    );
    const currentYaml = (await yamlHandle.jsonValue()) as string;
    expect(currentYaml).toBeTruthy();

    // Modify the displayName in the YAML
    const updatedYaml = currentYaml.replace(/displayName:.*/, 'displayName: YAML Edited Product');

    await page.evaluate((yaml) => {
      const monaco = (window as unknown as { monaco?: { editor?: { getModels?: () => { setValue(v: string): void }[] } } }).monaco;
      monaco?.editor?.getModels?.()[0]?.setValue(yaml);
    }, updatedYaml);

    await page.waitForTimeout(500);

    // Click Save rendered by ResourceYAMLEditor
    const saveButton = page.locator('button:has-text("Save")').last();
    await expect(saveButton).toBeEnabled({ timeout: 10000 });
    await saveButton.click();

    // ResourceYAMLEditor stays on the same URL and shows a success alert — detect it
    await expect(page.locator('.pf-v6-c-alert.pf-m-success h4:has-text("has been updated")')).toBeVisible({ timeout: 15000 });

    // Switch to Form View (still on the same page, same component) to verify the change persisted
    await page.locator('[role="tab"]:has-text("Form View")').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#display-name')).toHaveValue('YAML Edited Product', { timeout: 10000 });
  });

  test('should change publish status via edit form and verify status updates in list', { tag: '@nightly' }, async ({ page }) => {
    const testProductName = editProductName;
    await spaNavigate(page, `/kuadrant/apiproducts/ns/${TEST_NAMESPACE}/${testProductName}/edit`);

    await expect(page.locator('text=Edit API Product')).toBeVisible({ timeout: 15000 });

    // Change publish status from Draft to Published
    const publishStatusSelect = page.locator('#lifecycle-status');
    await publishStatusSelect.scrollIntoViewIfNeeded();
    await expect(publishStatusSelect).toBeVisible();
    await publishStatusSelect.selectOption('Published');
    await page.waitForTimeout(300);

    // Save changes
    const saveButton = page.locator('button:has-text("Save")');
    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    await saveButton.click();

    // Verify redirect to list
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'API Products', exact: true })).toBeVisible({
      timeout: 20000,
    });

    // Find the product row and verify Published label
    await page.waitForSelector('table', { timeout: 15000 });
    const found = await findRowWithPagination(page, testProductName);
    expect(found, `"${testProductName}" not found in any page of the API Products list`).toBe(true);

    // Verify the Published status label is shown in the row
    const row = page.locator(`tr:has-text("${testProductName}")`);
    await expect(row.locator('.pf-v6-c-label:has-text("Published")')).toBeVisible({ timeout: 5000 });
  });

  }); // end of 'edit and delete' describe

  test('should display validation messages for required fields', { tag: '@smoke' }, async ({ page }) => {
    await navigateToAPIProductCreate(page, TEST_NAMESPACE);
    await expect(page.locator('#display-name')).toBeVisible({ timeout: 20000 });

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

  test('should handle approval mode selection', { tag: '@smoke' }, async ({ page }) => {
    await navigateToAPIProductCreate(page, TEST_NAMESPACE);
    await expect(page.locator('#display-name')).toBeVisible({ timeout: 20000 });

    // Scroll to approval mode section
    await page.getByRole('heading', { name: 'API Key approval' }).scrollIntoViewIfNeeded();

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

  test('should auto-generate resource name with unique suffix', { tag: '@nightly' }, async ({ page }) => {
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

  test('should handle special characters in display name conversion', { tag: '@nightly' }, async ({ page }) => {
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
