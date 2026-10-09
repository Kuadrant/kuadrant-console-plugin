import { chromium, type FullConfig } from '@playwright/test';
import { existsSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { hasConsoleCredentials, shouldLoginToConsole } from './console-auth';
import { dismissConsoleTour } from './tests/helpers';

export default async function globalTeardown(config: FullConfig): Promise<void> {
  if (process.env.PLAYWRIGHT_STORAGE_STATE || !shouldLoginToConsole() || !hasConsoleCredentials()) {
    return;
  }

  const generatedStorageState = resolve(__dirname, '.auth', 'installed-console.json');
  if (!existsSync(generatedStorageState)) {
    return;
  }

  try {
    const baseURL = config.projects[0]?.use.baseURL;
    if (typeof baseURL !== 'string' || !baseURL) {
      throw new Error('Playwright baseURL is required to log out of the Console.');
    }

    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({
        storageState: generatedStorageState,
        ignoreHTTPSErrors: process.env.E2E_IGNORE_HTTPS_ERRORS === 'true',
      });
      try {
        const page = await context.newPage();
        await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
        await dismissConsoleTour(page);
        await page.locator('[data-test="user-dropdown-toggle"]').click();
        const [response] = await Promise.all([
          page.waitForResponse(
            (candidate) =>
              candidate.request().method() === 'POST' &&
              new URL(candidate.url()).pathname.endsWith('/api/console/logout'),
            { timeout: 30_000 },
          ),
          // kube:admin follows the Console logout request with a separate
          // cross-origin form POST, so keep the browser open through navigation.
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30_000 }),
          page.locator('[data-test="log-out"]').click(),
        ]);
        if (response.status() >= 400) {
          throw new Error(`Console logout failed with HTTP ${response.status()}.`);
        }
      } finally {
        await context.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    unlinkSync(generatedStorageState);
  }
}
