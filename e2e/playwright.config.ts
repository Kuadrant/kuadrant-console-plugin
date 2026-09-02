import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 1,
  workers: 3,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ['json', { outputFile: 'playwright-results.json' }],
  ],
  use: {
    baseURL: process.env.CONSOLE_URL || 'http://localhost:9000',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'default',
      testIgnore: '**/mcp-external-wizard.spec.ts',
    },
    {
      name: 'light',
      testMatch: '**/mcp-external-wizard.spec.ts',
      use: { colorScheme: 'light' },
    },
    {
      name: 'dark',
      testMatch: '**/mcp-external-wizard.spec.ts',
      use: { colorScheme: 'dark' },
    },
  ],
});
