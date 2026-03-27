import { Page, expect } from '@playwright/test';

const TEST_NAMESPACE = 'kuadrant-test';

// dismiss any console welcome/tour modals that block interaction
export async function dismissConsoleTour(page: Page): Promise<void> {
  const dismissible = page
    .locator('button:has-text("Skip tour"), button:has-text("Skip")')
    .or(page.locator('.pf-v6-c-modal-box button[aria-label="Close"]'));
  try {
    await dismissible.first().click({ timeout: 3_000 });
  } catch {
    // no tour modal present
  }
}

// start impersonating a user via the console masthead
export async function impersonateUser(page: Page, username: string): Promise<void> {
  await dismissConsoleTour(page);

  const userDropdown = page.locator('[data-test="user-dropdown-toggle"]');
  await userDropdown.waitFor({ state: 'visible', timeout: 30_000 });
  await userDropdown.click();

  const impersonateItem = page.locator('[data-test="impersonate-user"] button');
  await impersonateItem.waitFor({ state: 'visible' });
  await impersonateItem.click();

  const usernameInput = page.locator('[data-test="username-input"]');
  await usernameInput.waitFor({ state: 'visible' });
  await usernameInput.fill(username);

  const submitButton = page.locator('[data-test="impersonate-button"]');
  await submitButton.click();

  // wait for the page to reload and impersonation banner to appear
  await page.locator('.pf-v6-c-banner.pf-m-blue').waitFor({
    state: 'visible',
    timeout: 10_000,
  });
  await page.waitForLoadState('networkidle');
}

// stop impersonation if active
export async function stopImpersonation(page: Page): Promise<void> {
  const banner = page.locator('.pf-v6-c-banner.pf-m-blue');
  if (await banner.isVisible({ timeout: 2_000 }).catch(() => false)) {
    const stopButton = banner.locator('button:has-text("Stop impersonating")');
    await stopButton.waitFor({ state: 'visible', timeout: 5_000 });
    await stopButton.click();
    await banner.waitFor({ state: 'hidden', timeout: 5_000 });
  }
}

// SPA navigation using pushState - preserves redux state (including impersonation)
// page.goto() causes a full reload which destroys impersonation state
async function spaNavigate(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForLoadState('networkidle');
}

export async function navigateToPolicies(page: Page): Promise<void> {
  await spaNavigate(page, `/kuadrant/ns/${TEST_NAMESPACE}/policies`);
}

export async function navigateToOverview(page: Page): Promise<void> {
  await spaNavigate(page, '/kuadrant/overview');
}

export async function navigateToTopology(page: Page): Promise<void> {
  await spaNavigate(page, '/kuadrant/policy-topology');
}

// wait for RBAC permission checks to finish loading.
// the loading indicator may appear and disappear very quickly, so we try to
// catch it appearing first to avoid a false-green race condition.
export async function waitForPermissionsLoaded(page: Page): Promise<void> {
  const loading = page.locator('text=Loading permissions...');
  try {
    await loading.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    // already gone or never appeared - either way, not loading
  }
  await expect(loading).toBeHidden({ timeout: 30_000 });
}

export { TEST_NAMESPACE };
