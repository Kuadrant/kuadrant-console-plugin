import { Page, expect } from '@playwright/test';

const TEST_NAMESPACE = 'kuadrant-test';

// the guided tour can render after dismissConsoleTour has returned (slow console
// boot, retries). its backdrop blocks clicks and aria-hides the nav, so getByRole
// waits never match. a locator handler dismisses the tour whenever it blocks a
// later action or auto-retrying assertion. registration is per-page, idempotent.
const tourHandlerPages = new WeakSet<Page>();

async function registerTourDismissalHandler(page: Page): Promise<void> {
  if (tourHandlerPages.has(page)) {
    return;
  }
  tourHandlerPages.add(page);

  // scoped to tour modals only (skip/get started buttons) so genuine dialogs
  // such as delete confirmations are never dismissed
  const tourModal = page
    .locator('.pf-v6-c-modal-box, .pf-c-modal-box')
    .filter({
      has: page.locator(
        'button:has-text("Skip"), button:has-text("Get started"), button:has-text("Launch tour")',
      ),
    })
    .first();

  await page.addLocatorHandler(tourModal, async (modal) => {
    await modal
      .locator(
        'button:has-text("Skip"), button:has-text("Get started"), button[aria-label="Close"]',
      )
      .first()
      .click({ timeout: 5_000 })
      .catch(() => undefined);
  });
}

// dismiss any console welcome/tour modals that block interaction
export async function dismissConsoleTour(page: Page): Promise<void> {
  await registerTourDismissalHandler(page);

  const backdrop = page.locator('.pf-v6-c-backdrop');

  try {
    await backdrop.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    return;
  }

  const modalBox = page.locator('.pf-v6-c-modal-box, .pf-c-modal-box').first();

  try {
    await modalBox.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    return;
  }

  const candidates = [
    modalBox.locator('button:text-is("Skip tour")'),
    modalBox.locator('button:text-is("Skip")'),
    modalBox.locator('button:text-is("Get started")'),
    modalBox.locator('button[aria-label="Close"]'),
    modalBox.locator('button[title="Close"]'),
    modalBox.locator('button:has-text("Skip")'),
    modalBox.locator('button:has-text("Close")'),
    modalBox.locator('.pf-v6-c-modal-box__close button, .pf-c-modal-box__close button').first(),
    modalBox.locator('button').first(),
  ];

  for (const locator of candidates) {
    try {
      await locator.first().waitFor({ state: 'visible', timeout: 500 });
      await locator.first().click({ timeout: 5_000 });
      await modalBox.waitFor({ state: 'hidden', timeout: 2_000 });
      break;
    } catch {
      continue;
    }
  }

  await backdrop.waitFor({ state: 'hidden', timeout: 10_000 });
}

// start impersonating a user via the console masthead
export async function impersonateUser(page: Page, username: string): Promise<void> {
  const userDropdown = page.locator('[data-test="user-dropdown-toggle"]');
  await userDropdown.waitFor({ state: 'visible', timeout: 30_000 });

  // CRITICAL: dismiss modal RIGHT BEFORE clicking the user dropdown
  // The modal appears asynchronously and may not be present during initial page load
  await dismissConsoleTour(page);

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

// Wait for Kuadrant plugin to load by checking for sidebar menu item
async function waitForKuadrantPlugin(page: Page): Promise<void> {
  // expect rather than waitFor: locator handlers only run before actions and
  // auto-retrying assertion checks, so a late tour modal (which aria-hides the
  // nav) can be dismissed while this wait is in progress
  await expect(page.getByRole('button', { name: 'Kuadrant', exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

// SPA navigation using pushState - preserves redux state (including impersonation)
// page.goto() causes a full reload which destroys impersonation state
export async function spaNavigate(page: Page, path: string): Promise<void> {
  await registerTourDismissalHandler(page);

  // Wait for plugin to be ready before navigating to plugin routes
  await waitForKuadrantPlugin(page);

  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForLoadState('networkidle');
}

// Scroll through all pagination pages looking for a row matching `text`.
// Retries up to `maxAttempts` times, waiting for the watch stream between pages.
export async function findRowWithPagination(page: Page, text: string, maxAttempts = 10): Promise<boolean> {
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
      if ((await firstBtn.count()) > 0 && !(await firstBtn.isDisabled())) {
        await firstBtn.click();
        await page.waitForTimeout(500);
      }
    }
  }
  return false;
}

export async function navigateToPolicies(page: Page): Promise<void> {
  await spaNavigate(page, `/kuadrant/policies/ns/${TEST_NAMESPACE}`);
}

export async function navigateToOverview(page: Page): Promise<void> {
  await spaNavigate(page, '/kuadrant/overview/all-namespaces');
}

export async function navigateToTopology(page: Page): Promise<void> {
  await spaNavigate(page, '/kuadrant/policy-topology/all-namespaces');
}

export async function navigateToAPIProducts(page: Page, namespace?: string): Promise<void> {
  const ns = namespace || TEST_NAMESPACE;
  await spaNavigate(page, `/kuadrant/apiproducts/ns/${ns}`);
}

export async function navigateToAPIProductsAllNamespaces(page: Page): Promise<void> {
  await spaNavigate(page, '/kuadrant/apiproducts/all-namespaces');
}

export async function navigateToAPIKeyApprovals(page: Page, namespace?: string): Promise<void> {
  const ns = namespace || TEST_NAMESPACE;
  // Full page navigation so the console reads the namespace from the URL and updates its
  // active namespace state. spaNavigate (pushState) does not trigger the namespace update.
  await page.goto(`/kuadrant/apikey-approvals/ns/${ns}`);
  await page.waitForLoadState('networkidle');
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

// Apply test-delete-product fixture via kubectl
// Used by delete test to ensure product exists for each run
export async function ensureDeleteProductFixture(): Promise<void> {
  const { execFileSync } = await import('child_process');
  const path = await import('path');
  const fixturesPath = path.join(__dirname, '../manifests/test-apiproduct-fixtures.yaml');

  try {
    execFileSync('kubectl', ['apply', '-f', fixturesPath], { stdio: 'ignore' });
  } catch (error) {
    console.warn('Failed to apply test-delete-product fixture:', error);
  }
}

export { TEST_NAMESPACE };
