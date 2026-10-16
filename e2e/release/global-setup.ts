import { chromium, FullConfig } from '@playwright/test';
import { resolve } from 'path';

/**
 * Logs Playwright into the release Console once and saves the browser session
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const username = process.env.CONSOLE_LOGIN_USERNAME;
  const password = process.env.CONSOLE_LOGIN_PASSWORD;
  // The release runner exports CONSOLE_URL. Do not rely on the inherited
  // project config exposing the top-level baseURL here, as that can be absent
  // in FullConfig even though Playwright has a base URL at runtime.
  const baseURL = process.env.CONSOLE_URL || config.projects[0]?.use.baseURL;

  if (!username || !password || typeof baseURL !== 'string' || !baseURL) {
    throw new Error(
      'Release E2E login is not configured: CONSOLE_URL, CONSOLE_LOGIN_USERNAME, and CONSOLE_LOGIN_PASSWORD are required',
    );
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });

    const usernameInput = page.locator('input[name="username"]');
    if (!(await usernameInput.isVisible({ timeout: 5_000 }).catch(() => false))) {
      // OpenShift may first show the identity-provider chooser.
      const htpasswd = page.getByRole('link', { name: 'HTPasswd', exact: true });
      await htpasswd.waitFor({ state: 'visible', timeout: 20_000 });
      await htpasswd.click();
    }

    await usernameInput.waitFor({ state: 'visible', timeout: 20_000 });
    await usernameInput.fill(username);
    await page.locator('input[name="password"]').fill(password);
    await Promise.all([
      page.waitForURL(
        (url) => !url.pathname.startsWith('/oauth/') && !url.pathname.startsWith('/auth/'),
        { timeout: 30_000 },
      ),
      page.locator('button[type="submit"], input[type="submit"]').first().click(),
    ]);
    await page.waitForLoadState('domcontentloaded');
    await page.locator('[data-test="user-dropdown-toggle"]').waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    await context.storageState({ path: resolve(process.cwd(), 'playwright-storage-state.json') });
  } finally {
    await browser.close();
  }
}
