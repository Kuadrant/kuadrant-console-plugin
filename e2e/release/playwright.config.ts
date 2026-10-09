import { defineConfig } from '@playwright/test';
import { resolve } from 'path';
import baseConfig from '../playwright.config';

// Reuses the normal test settings and adds release Console authentication
export default defineConfig({
  ...baseConfig,
  testDir: resolve(__dirname, '../tests'),
  // Log in once before tests and reuse the saved browser session
  globalSetup: resolve(__dirname, 'global-setup.ts'),
  use: {
    ...baseConfig.use,
    baseURL: process.env.CONSOLE_URL,
    storageState: resolve(__dirname, '../../playwright-storage-state.json'),
    ignoreHTTPSErrors: true,
  },
});
