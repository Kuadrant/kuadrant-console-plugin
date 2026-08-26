import { test, expect, Page } from '@playwright/test';
import { dismissConsoleTour } from './helpers';

async function gotoPage(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('domcontentloaded');
  await dismissConsoleTour(page);
}

test.describe('Inline validation', () => {
  test('HTTPRoute name field shows validation errors', { tag: '@nightly' }, async ({ page }) => {
    const namespace = 'default';
    const path = `/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~HTTPRoute/~new`;

    await gotoPage(page, path);

    // Wait for form to be visible
    await expect(page.locator('#httproute-name')).toBeVisible({ timeout: 15_000 });

    // Test 1: Empty field after blur should show "required" error
    await page.locator('#httproute-name').focus();
    await page.locator('#httproute-name').blur();

    // Should show the required error in the name field's form group (scoped so
    // an unrelated validation error elsewhere on the page can't satisfy this).
    await expect(
      page
        .locator('#httproute-name')
        .locator('xpath=ancestor::*[contains(@class,"pf-v6-c-form__group")]')
        .getByText('This field is required'),
    ).toBeVisible({ timeout: 5_000 });

    // Test 2: Invalid uppercase characters
    await page.locator('#httproute-name').fill('INVALID-ROUTE');
    await page.locator('#httproute-name').blur();

    // Should show validation error
    await expect(
      page.locator(
        'text=Name must consist of lowercase alphanumeric characters, "-", or ".", and must start and end with an alphanumeric character',
      ),
    ).toBeVisible({ timeout: 5_000 });

    // Input should have error state (red border via ValidatedOptions.error)
    const input = page.locator('#httproute-name');
    const ariaInvalid = await input.getAttribute('aria-invalid');
    expect(ariaInvalid).toBe('true');

    // Test 3: Invalid special characters (underscore)
    await page.locator('#httproute-name').fill('invalid_route');
    await page.locator('#httproute-name').blur();

    await expect(
      page.locator(
        'text=Name must consist of lowercase alphanumeric characters, "-", or ".", and must start and end with an alphanumeric character',
      ),
    ).toBeVisible({ timeout: 5_000 });

    // Test 4: Valid input clears error
    await page.locator('#httproute-name').fill('valid-route-123');
    await page.locator('#httproute-name').blur();

    // Error should disappear
    await expect(
      page.locator(
        'text=Name must consist of lowercase alphanumeric characters, "-", or ".", and must start and end with an alphanumeric character',
      ),
    ).not.toBeVisible({ timeout: 5_000 });

    // Helper text should be shown instead
    await expect(page.locator('text=Unique name of the HTTPRoute')).toBeVisible({
      timeout: 5_000,
    });

    // Input should not have error state
    const ariaInvalidAfter = await input.getAttribute('aria-invalid');
    expect(ariaInvalidAfter).not.toBe('true');
  });

  test('Gateway listener port shows validation errors', { tag: '@nightly' }, async ({ page }) => {
    const namespace = 'default';
    const path = `/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~Gateway/~new`;

    await gotoPage(page, path);

    // Wait for form to be visible
    await expect(page.locator('#gateway-name')).toBeVisible({ timeout: 15_000 });

    // Fill gateway name to proceed
    await page.locator('#gateway-name').fill('test-gateway');

    // Click "Add listener" button
    await page.getByRole('button', { name: /Add listener/i }).click();

    // Wait for listener wizard to open
    await expect(page.locator('#listener-name')).toBeVisible({ timeout: 10_000 });

    // Fill listener name
    await page.locator('#listener-name').fill('http');

    // Test port validation - invalid port (0)
    await page.locator('#listener-port').fill('0');
    await page.locator('#listener-port').blur();

    // Should show validation error
    await expect(page.locator('text=Port must be between 1 and 65535')).toBeVisible({
      timeout: 5_000,
    });

    // Test port validation - port > 65535
    await page.locator('#listener-port').fill('70000');
    await page.locator('#listener-port').blur();

    await expect(page.locator('text=Port must be between 1 and 65535')).toBeVisible({
      timeout: 5_000,
    });

    // Test valid port
    await page.locator('#listener-port').fill('8080');
    await page.locator('#listener-port').blur();

    // Error should disappear
    await expect(page.locator('text=Port must be between 1 and 65535')).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test('DNS Policy name shows validation errors', { tag: '@nightly' }, async ({ page }) => {
    const namespace = 'default';
    const path = `/k8s/ns/${namespace}/kuadrant.io~v1~DNSPolicy/~new`;

    await gotoPage(page, path);

    // Wait for form to be visible
    await expect(page.locator('#policy-name')).toBeVisible({ timeout: 15_000 });

    // Test uppercase in policy name
    await page.locator('#policy-name').fill('DNS-POLICY-TEST');
    await page.locator('#policy-name').blur();

    // Should show validation error
    await expect(
      page.locator(
        'text=Name must consist of lowercase alphanumeric characters, "-", or ".", and must start and end with an alphanumeric character',
      ),
    ).toBeVisible({ timeout: 5_000 });

    // Test valid name
    await page.locator('#policy-name').fill('dns-policy-test');
    await page.locator('#policy-name').blur();

    // Error should disappear
    await expect(
      page.locator(
        'text=Name must consist of lowercase alphanumeric characters, "-", or ".", and must start and end with an alphanumeric character',
      ),
    ).not.toBeVisible({ timeout: 5_000 });

    // Helper text should be visible
    await expect(page.locator('text=Unique name of the DNS Policy')).toBeVisible({
      timeout: 5_000,
    });
  });
});
