import { test, expect, Page } from '@playwright/test';
import { TEST_NAMESPACE, dismissConsoleTour } from './helpers';

async function navigateToAPIProductOverview(
  page: Page,
  namespace = TEST_NAMESPACE,
  productName = 'test-edit-product',
) {
  await page.evaluate(
    ({ ns, name }) => {
      window.history.pushState(
        {},
        '',
        `/k8s/ns/${ns}/devportal.kuadrant.io~v1alpha1~APIProduct/${name}/overview`,
      );
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
    { ns: namespace, name: productName },
  );
}

test.describe('APIProduct Overview Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissConsoleTour(page);
  });

  test('should display About section with all fields and correct styling', { tag: '@nightly' }, async ({ page }) => {
    await navigateToAPIProductOverview(page);
    await expect(page.locator('text=About').first()).toBeVisible({ timeout: 10_000 });

    // Verify About section header
    await expect(page.locator('h2:has-text("About")')).toBeVisible();

    // Display Name, Description, Version
    await expect(page.locator('dt:has-text("Display Name")')).toBeVisible();
    await expect(
      page.locator('dd').filter({ has: page.locator('text=Test Edit Product') }),
    ).toBeVisible();
    await expect(page.locator('dt:has-text("Description")')).toBeVisible();
    await expect(page.locator('dt:has-text("Version")')).toBeVisible();
    await expect(page.locator('dd').filter({ has: page.locator('text=v1.0.0') })).toBeVisible();

    // Publish Status with label styling
    await expect(page.locator('dt:has-text("Publish Status")')).toBeVisible();
    const draftLabel = page.locator('.pf-v6-c-label:has-text("Draft")');
    await expect(draftLabel).toBeVisible();
    const labelClass = await draftLabel.getAttribute('class');
    expect(labelClass).toContain('pf-m-filled');
    expect(labelClass).toContain('pf-m-compact');

    // Tags with blue color
    await expect(page.locator('dt:has-text("Tags")')).toBeVisible();
    await expect(page.locator('.pf-v6-c-label__text:has-text("test")')).toBeVisible();
    await expect(page.locator('.pf-v6-c-label__text:has-text("edit")')).toBeVisible();
    const testTag = page.locator('.pf-v6-c-label:has-text("test")').first();
    const tagClass = await testTag.getAttribute('class');
    expect(tagClass).toContain('pf-m-blue');

    // Created at timestamp
    await expect(page.locator('dt:has-text("Created at")')).toBeVisible();
    const createdAtValue = page.locator('dt:has-text("Created at")').locator('..').locator('dd');
    const text = await createdAtValue.innerText();
    expect(text.length).toBeGreaterThan(0);

    // Approval Mode
    await expect(page.locator('dt:has-text("Approval Mode")')).toBeVisible();
    await expect(page.locator('dd').filter({ has: page.locator('text=manual') })).toBeVisible();
  });

  test('should display authentication methods with "Not set" and configured states', { tag: '@nightly' }, async ({
    page,
  }) => {
    // Test "Not set" state
    await navigateToAPIProductOverview(page, TEST_NAMESPACE, 'test-product-no-auth');
    await expect(page.locator('text=About').first()).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('dt:has-text("Authentication Methods")')).toBeVisible();
    const authMethodsValue = page
      .locator('dt:has-text("Authentication Methods")')
      .locator('..')
      .locator('dd');
    await expect(authMethodsValue.locator('text=Not set')).toBeVisible();
    const span = authMethodsValue.locator('span:has-text("Not set")');
    const style = await span.getAttribute('style');
    expect(style).toContain('Color--200');

    // Test configured state with multiple methods
    await navigateToAPIProductOverview(page, TEST_NAMESPACE, 'test-product-multi-auth');
    await expect(page.locator('text=About').first()).toBeVisible({ timeout: 10_000 });

    const authMethodsSection = page
      .locator('dt:has-text("Authentication Methods")')
      .locator('..')
      .locator('dd');
    // Wait for authentication method labels to load
    await expect(authMethodsSection.locator('.pf-v6-c-label:has-text("API Key")')).toBeVisible();
    await expect(authMethodsSection.locator('.pf-v6-c-label:has-text("OIDC (JWT)")')).toBeVisible();
    const apiKeyLabel = authMethodsSection.locator('.pf-v6-c-label:has-text("API Key")');
    const apiKeyClass = await apiKeyLabel.getAttribute('class');
    expect(apiKeyClass).toContain('pf-m-green');
  });

  test('should display plan tiers with "Not set" and configured states', { tag: '@nightly' }, async ({ page }) => {
    // Test "Not set" state
    await navigateToAPIProductOverview(page);
    await expect(page.locator('text=About').first()).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('dt:has-text("Plan Tiers")')).toBeVisible();
    const planTiersValue = page.locator('dt:has-text("Plan Tiers")').locator('..').locator('dd');
    await expect(planTiersValue.locator('text=Not set')).toBeVisible();
    const span = planTiersValue.locator('span:has-text("Not set")');
    const style = await span.getAttribute('style');
    expect(style).toContain('Color--200');

    // Test configured state with gamestore-api (has PlanPolicy with gold and silver tiers)
    await navigateToAPIProductOverview(page, TEST_NAMESPACE, 'gamestore-api');
    await expect(page.locator('text=About').first()).toBeVisible({ timeout: 10_000 });

    const planTiersSection = page.locator('dt:has-text("Plan Tiers")').locator('..').locator('dd');
    // Wait for plan tier labels to load
    await expect(planTiersSection.locator('.pf-v6-c-label:has-text("gold")')).toBeVisible();
    await expect(planTiersSection.locator('.pf-v6-c-label:has-text("silver")')).toBeVisible();
    const goldLabel = planTiersSection.locator('.pf-v6-c-label:has-text("gold")');
    const goldClass = await goldLabel.getAttribute('class');
    expect(goldClass).toContain('pf-m-blue');
    await expect(planTiersSection.locator('text=100 requests per day')).toBeVisible();
    await expect(planTiersSection.locator('text=50 requests per day')).toBeVisible();
  });

  test('should display Documentation section with links, "Not set" states, and edit buttons', { tag: '@nightly' }, async ({
    page,
  }) => {
    // Test with documentation links present
    await navigateToAPIProductOverview(page);
    await expect(page.locator('text=About').first()).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('h2:has-text("Documentation")')).toBeVisible();

    // Verify links with correct attributes
    await expect(page.locator('dt:has-text("API Specification")')).toBeVisible();
    const apiSpecLink = page.locator('a[href="https://api.example.com/spec.yaml"]');
    await expect(apiSpecLink).toBeVisible();
    await expect(apiSpecLink).toHaveAttribute('target', '_blank');
    await expect(apiSpecLink).toHaveAttribute('rel', 'noopener noreferrer');

    await expect(page.locator('dt:has-text("API Documentation")')).toBeVisible();
    const apiDocsLink = page.locator('a[href="https://api.example.com/docs"]');
    await expect(apiDocsLink).toBeVisible();
    await expect(apiDocsLink).toHaveAttribute('target', '_blank');

    // Verify edit buttons
    const apiSpecEditBtn = page
      .locator('dt:has-text("API Specification")')
      .locator('..')
      .locator('button[aria-label*="API Specification"]');
    await expect(apiSpecEditBtn).toBeVisible();
    const apiDocsEditBtn = page
      .locator('dt:has-text("API Documentation")')
      .locator('..')
      .locator('button[aria-label*="API Documentation"]');
    await expect(apiDocsEditBtn).toBeVisible();

    // Test "Not set" states
    await navigateToAPIProductOverview(page, TEST_NAMESPACE, 'test-list-product-1');
    await expect(page.locator('text=About').first()).toBeVisible({ timeout: 10_000 });

    const apiSpecValue = page
      .locator('dt:has-text("API Specification")')
      .locator('..')
      .locator('dd');
    await expect(apiSpecValue.locator('text=Not set')).toBeVisible();
    const apiDocsValue = page
      .locator('dt:has-text("API Documentation")')
      .locator('..')
      .locator('dd');
    await expect(apiDocsValue.locator('text=Not set')).toBeVisible();
  });

  test('should display Contact section with links, "Not set" states, and edit buttons', { tag: '@nightly' }, async ({
    page,
  }) => {
    // Test "Not set" states
    await navigateToAPIProductOverview(page, TEST_NAMESPACE, 'test-product-no-auth');
    await expect(page.locator('text=About').first()).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('h2:has-text("Contact")')).toBeVisible();
    const fields = ['Contact Team', 'Contact Email', 'Contact Slack', 'Contact URL'];
    for (const field of fields) {
      await expect(page.locator(`dt:has-text("${field}")`)).toBeVisible();
      const fieldValue = page.locator(`dt:has-text("${field}")`).locator('..').locator('dd');
      await expect(fieldValue.locator('text=Not set')).toBeVisible();
    }

    // Test with contact info present
    await navigateToAPIProductOverview(page);
    await expect(page.locator('text=About').first()).toBeVisible({ timeout: 10_000 });

    // Wait for Contact section header to be visible
    await expect(page.locator('h2:has-text("Contact")')).toBeVisible();

    // Verify all contact fields
    await expect(
      page.locator('dd').filter({ has: page.locator('text=Platform Team') }),
    ).toBeVisible();

    const emailLink = page.locator('a[href="mailto:platform@example.com"]');
    await expect(emailLink).toBeVisible();
    await expect(emailLink).toHaveText('platform@example.com');

    await expect(
      page.locator('dd').filter({ has: page.locator('text=#platform-support') }),
    ).toBeVisible();

    const urlLink = page.locator('a[href="https://platform.example.com/support"]');
    await expect(urlLink).toBeVisible();
    await expect(urlLink).toHaveAttribute('target', '_blank');

    // Verify edit buttons
    const editButtons = page.locator('button[aria-label*="Contact"]');
    const count = await editButtons.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('should open and close edit modals', { tag: '@nightly' }, async ({ page }) => {
    await navigateToAPIProductOverview(page);
    await expect(page.locator('text=About').first()).toBeVisible({ timeout: 10_000 });

    // Test Tags modal
    const tagsEditBtn = page
      .locator('dt:has-text("Tags")')
      .locator('button[aria-label*="tags"]')
      .first();
    await tagsEditBtn.click();
    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await expect(page.locator('h1:has-text("Edit Tags")')).toBeVisible();
    await expect(page.locator('.pf-v6-c-modal-box .pf-v6-c-label:has-text("test")')).toBeVisible();
    await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
    await expect(page.locator('.pf-v6-c-modal-box')).not.toBeVisible();

    // Test Publish Status modal
    const publishStatusEditBtn = page
      .locator('dt:has-text("Publish Status")')
      .locator('button[aria-label*="publish status"]')
      .first();
    await publishStatusEditBtn.click();
    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await expect(page.locator('h1:has-text("Edit Publish Status")')).toBeVisible();
    await expect(page.locator('input[id="status-draft"]')).toBeChecked();
    await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
    await expect(page.locator('.pf-v6-c-modal-box')).not.toBeVisible();

    // Test Contact modal
    const teamEditBtn = page
      .locator('dt:has-text("Contact Team")')
      .locator('..')
      .locator('button')
      .first();
    await teamEditBtn.click();
    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await expect(page.locator('h1:has-text("Edit Contact Team")')).toBeVisible();
    await expect(page.locator('#contact-team')).toBeVisible();
    await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
    await expect(page.locator('.pf-v6-c-modal-box')).not.toBeVisible();

    // Test Documentation modal
    const apiSpecEditBtn = page
      .locator('dt:has-text("API Specification")')
      .locator('..')
      .locator('button')
      .first();
    await apiSpecEditBtn.click();
    await expect(page.locator('.pf-v6-c-modal-box')).toBeVisible();
    await expect(page.locator('h1:has-text("Edit API Specification")')).toBeVisible();
    const urlInput = page.locator('#documentation-openAPISpecURL');
    await expect(urlInput).toHaveValue('https://api.example.com/spec.yaml');
    await page.locator('.pf-v6-c-modal-box button:has-text("Cancel")').click();
    await expect(page.locator('.pf-v6-c-modal-box')).not.toBeVisible();
  });

  test('should navigate to Overview tab from detail page', { tag: '@nightly' }, async ({ page }) => {
    // Navigate to APIProduct details (default tab)
    await page.evaluate(
      ({ ns, name }) => {
        window.history.pushState(
          {},
          '',
          `/k8s/ns/${ns}/devportal.kuadrant.io~v1alpha1~APIProduct/${name}`,
        );
        window.dispatchEvent(new PopStateEvent('popstate'));
      },
      { ns: TEST_NAMESPACE, name: 'test-edit-product' },
    );

    // Wait for tabs navigation to be visible
    const overviewTab = page
      .locator('.pf-v6-c-tabs__list')
      .locator('a:has-text("Overview")')
      .first();
    await expect(overviewTab).toBeVisible();
    await overviewTab.click();

    // Verify URL changed to overview tab
    await expect(page).toHaveURL(
      new RegExp(
        `/k8s/ns/${TEST_NAMESPACE}/devportal.kuadrant.io~v1alpha1~APIProduct/test-edit-product/overview`,
      ),
    );

    // Verify About section is visible
    await expect(page.locator('h2:has-text("About")')).toBeVisible({ timeout: 10_000 });
  });

  test('should display all sections in correct order', { tag: '@nightly' }, async ({ page }) => {
    await navigateToAPIProductOverview(page);
    await expect(page.locator('text=About').first()).toBeVisible({ timeout: 10_000 });

    // Get all section headers
    const headers = await page.locator('h2').allInnerTexts();

    // Verify order: About, Documentation, Contact
    expect(headers).toContain('About');
    expect(headers).toContain('Documentation');
    expect(headers).toContain('Contact');

    const aboutIndex = headers.indexOf('About');
    const documentationIndex = headers.indexOf('Documentation');
    const contactIndex = headers.indexOf('Contact');

    expect(aboutIndex).toBeLessThan(documentationIndex);
    expect(documentationIndex).toBeLessThan(contactIndex);
  });
});
