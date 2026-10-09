import { defineConfig } from '@playwright/test';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { hasConsoleCredentials, shouldLoginToConsole } from './console-auth';

const repoRoot = resolve(__dirname, '..');
const ignoreHTTPSErrorsValue = process.env.E2E_IGNORE_HTTPS_ERRORS || 'false';
if (!['true', 'false'].includes(ignoreHTTPSErrorsValue)) {
  throw new Error(
    `E2E_IGNORE_HTTPS_ERRORS must be 'true' or 'false' (got '${ignoreHTTPSErrorsValue}')`,
  );
}
const loginToConsole = shouldLoginToConsole();
const useInstalledConsole = process.env.E2E_USE_INSTALLED_CONSOLE === 'true';
const generatedStorageState = resolve(__dirname, '.auth', 'installed-console.json');
const suppliedStorageState = process.env.PLAYWRIGHT_STORAGE_STATE;
const storageState = suppliedStorageState
  ? resolve(process.cwd(), suppliedStorageState)
  : loginToConsole && hasConsoleCredentials()
  ? generatedStorageState
  : undefined;

function discoverConsoleURL(): string {
  let host: string;
  try {
    host = execFileSync(
      'oc',
      ['get', 'route', 'console', '-n', 'openshift-console', '-o', 'jsonpath={.spec.host}'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
  } catch {
    throw new Error(
      'Could not discover the OpenShift console route. Set CONSOLE_URL to override route discovery.',
    );
  }

  if (!host) {
    throw new Error(
      'The OpenShift console route has no host. Set CONSOLE_URL to override route discovery.',
    );
  }

  return `https://${host}`;
}

const baseURL =
  process.env.CONSOLE_URL || (useInstalledConsole ? discoverConsoleURL() : 'http://localhost:9000');

export default defineConfig({
  testDir: './tests',
  globalSetup: resolve(__dirname, 'global-setup.ts'),
  globalTeardown: resolve(__dirname, 'global-teardown.ts'),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 1,
  workers: 3,
  reporter: [
    [
      'html',
      {
        open: 'never',
        outputFolder: resolve(
          repoRoot,
          process.env.PLAYWRIGHT_HTML_OUTPUT_DIR || 'playwright-report',
        ),
      },
    ],
    ['list'],
    [
      'json',
      {
        outputFile: resolve(
          repoRoot,
          process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || 'playwright-results.json',
        ),
      },
    ],
  ],
  use: {
    baseURL,
    ...(storageState ? { storageState } : {}),
    ignoreHTTPSErrors: ignoreHTTPSErrorsValue === 'true',
    screenshot: 'only-on-failure',
    // A supplied state remains valid after the run, so traces must not retain its session cookie.
    trace: suppliedStorageState ? 'off' : 'on-first-retry',
    actionTimeout: 10_000,
  },
});
