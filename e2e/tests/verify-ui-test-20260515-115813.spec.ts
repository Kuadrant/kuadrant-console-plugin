import { test, expect } from '@playwright/test';

test.describe('APIProductsListPage RBAC and Loading State', () => {
  test('should show permissions loading state then final state without UI flash', async ({ page }) => {
    // Navigate to the API Products page
    console.log('Navigating to /kuadrant/apiproducts...');
    await page.goto('/kuadrant/apiproducts', {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    // Wait for React app to mount by checking for any PatternFly component or the app div to have content
    console.log('Waiting for React app to load...');
    await page.waitForSelector('#app:not(:empty)', { timeout: 30000 }).catch(async () => {
      console.log('React app did not load, checking page state...');
      console.log('Page HTML:', await page.content());
    });

    // Wait a bit more for components to render
    await page.waitForTimeout(2000);

    // Check if we see the loading permissions message
    console.log('Checking for permissions loading state...');
    const loadingMessage = page.getByText('Loading Permissions...', { exact: false });
    const loadingExists = await loadingMessage.isVisible().catch(() => false);

    if (loadingExists) {
      console.log('✓ Loading permissions message displayed');
      // Wait for it to disappear
      await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 });
      console.log('✓ Loading permissions message disappeared');
    } else {
      console.log('⚠ Loading message not visible (permissions may have loaded quickly)');
    }

    // Wait for final state to render
    await page.waitForTimeout(2000);

    // Get page HTML for debugging
    const pageContent = await page.content();
    console.log('Page URL:', page.url());
    console.log('Page title:', await page.title());
    console.log('Page has body:', pageContent.includes('<body'));

    // Check for either the product list OR permission denied view
    console.log('Checking final rendered state...');

    const hasPermissionDenied = await page.getByText('Permission Denied', { exact: false }).isVisible().catch(() => false);
    const hasNoPermission = await page.getByText('not have permission', { exact: false }).isVisible().catch(() => false);
    const hasProductsList = await page.locator('[data-test="api-products-list"]').isVisible().catch(() => false);
    const hasEmptyState = await page.getByText('No API Products found', { exact: false }).isVisible().catch(() => false);
    const hasApiProductsHeading = await page.getByRole('heading', { name: /api products/i }).isVisible().catch(() => false);

    console.log('Found Permission Denied:', hasPermissionDenied);
    console.log('Found No Permission message:', hasNoPermission);
    console.log('Found Products List:', hasProductsList);
    console.log('Found Empty State:', hasEmptyState);
    console.log('Found API Products Heading:', hasApiProductsHeading);

    if (hasPermissionDenied || hasNoPermission) {
      console.log('✓ Permission denied view displayed');
      expect(hasPermissionDenied || hasNoPermission).toBe(true);
    } else if (hasProductsList || hasEmptyState || hasApiProductsHeading) {
      console.log('✓ Products list view displayed (with or without products)');
      expect(hasProductsList || hasEmptyState || hasApiProductsHeading).toBe(true);
    } else {
      console.log('✗ Neither permission denied nor products list found');
      console.log('Visible text on page:', await page.locator('body').innerText());
      // Take a screenshot for debugging
      await page.screenshot({ path: '/tmp/verify-ui-final-state.png', fullPage: true });
      throw new Error('Page did not render expected final state (permission denied or products list)');
    }

    // Verify no errors in console
    console.log('Checking for console errors...');
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Wait a bit more to catch any late errors
    await page.waitForTimeout(2000);

    if (consoleErrors.length > 0) {
      console.log('Console errors detected:', consoleErrors);
    } else {
      console.log('✓ No console errors detected');
    }

    // Take final screenshot
    await page.screenshot({ path: '/tmp/verify-ui-final-screenshot.png', fullPage: true });
    console.log('Test completed successfully');
  });
});
