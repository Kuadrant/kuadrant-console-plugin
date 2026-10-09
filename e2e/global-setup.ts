import { chromium, type FullConfig } from '@playwright/test';
import { chmodSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { dirname, resolve } from 'path';
import { hasConsoleCredentials, shouldLoginToConsole } from './console-auth';

const generatedStorageState = resolve(__dirname, '.auth', 'installed-console.json');

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const loginToConsole = shouldLoginToConsole();
  const suppliedStorageState = process.env.PLAYWRIGHT_STORAGE_STATE;

  if (suppliedStorageState) {
    const storageStatePath = resolve(process.cwd(), suppliedStorageState);
    if (!existsSync(storageStatePath)) {
      throw new Error(`Playwright storage state file does not exist: ${storageStatePath}`);
    }
    return;
  }

  if (!loginToConsole) {
    return;
  }

  const username = process.env.E2E_CONSOLE_USERNAME;
  const password = process.env.E2E_CONSOLE_PASSWORD;
  if (!hasConsoleCredentials()) {
    throw new Error(
      'Console login requires both E2E_CONSOLE_USERNAME and E2E_CONSOLE_PASSWORD, or PLAYWRIGHT_STORAGE_STATE.',
    );
  }

  if (existsSync(generatedStorageState)) {
    unlinkSync(generatedStorageState);
  }

  const baseURL = config.projects[0]?.use.baseURL;
  if (typeof baseURL !== 'string' || !baseURL) {
    throw new Error('Playwright baseURL is required to create an authenticated storage state.');
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    ignoreHTTPSErrors: process.env.E2E_IGNORE_HTTPS_ERRORS === 'true',
  });

  try {
    const page = await context.newPage();
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });

    const identityProvider = process.env.E2E_CONSOLE_IDENTITY_PROVIDER;
    if (identityProvider) {
      const providerLink = page
        .locator('a, button')
        .filter({ hasText: new RegExp(escapeRegExp(identityProvider), 'i') })
        .first();
      await providerLink.waitFor({ state: 'visible', timeout: 30_000 });
      await providerLink.click();
    }

    const usernameInput = page.locator('input[name="username"], #inputUsername').first();
    const passwordInput = page.locator('input[name="password"], #inputPassword').first();
    await usernameInput.waitFor({ state: 'visible', timeout: 30_000 });
    await usernameInput.fill(username);
    await passwordInput.fill(password);
    await page.locator('button[type="submit"], input[type="submit"]').first().click();

    const userDropdown = page.locator('[data-test="user-dropdown-toggle"]');
    const loginError = page.locator('.pf-v6-c-helper-text__item.pf-m-error').first();
    try {
      const outcome = await Promise.race([
        userDropdown.waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'logged-in'),
        loginError.waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'login-error'),
      ]);
      if (outcome === 'login-error') {
        throw new Error('Console login page reported an error.');
      }
    } catch (error) {
      const currentURL = new URL(page.url());
      const alerts = await page
        .locator('[role="alert"], .alert-danger, .pf-v6-c-helper-text__item.pf-m-error')
        .allTextContents();
      const visibleError = alerts
        .map((alert) => alert.trim())
        .filter(Boolean)
        .join(' ')
        .slice(0, 500);
      const loginFormVisible = await usernameInput.isVisible();
      throw new Error(
        `Console login did not reach the user menu at ${currentURL.origin}${currentURL.pathname}.` +
          (visibleError ? ` Page error: ${visibleError}` : '') +
          (loginFormVisible ? ' The login form is still visible.' : ''),
        { cause: error },
      );
    }

    mkdirSync(dirname(generatedStorageState), { recursive: true, mode: 0o700 });
    chmodSync(dirname(generatedStorageState), 0o700);
    await context.storageState({ path: generatedStorageState });
    chmodSync(generatedStorageState, 0o600);
  } finally {
    await context.close();
    await browser.close();
  }
}
