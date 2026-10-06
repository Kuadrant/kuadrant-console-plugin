import { existsSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { hasConsoleCredentials, shouldLoginToConsole } from './console-auth';

export default async function globalTeardown(): Promise<void> {
  if (process.env.PLAYWRIGHT_STORAGE_STATE || !shouldLoginToConsole() || !hasConsoleCredentials()) {
    return;
  }

  const generatedStorageState = resolve(__dirname, '.auth', 'installed-console.json');
  if (existsSync(generatedStorageState)) {
    unlinkSync(generatedStorageState);
  }
}
