// Keep Console login and credential checks consistent across Playwright config,
// global setup, and teardown when creating and removing browser storage state.
export function shouldLoginToConsole(): boolean {
  const installedConsoleValue = process.env.E2E_USE_INSTALLED_CONSOLE || 'false';
  if (!['true', 'false'].includes(installedConsoleValue)) {
    throw new Error(
      `E2E_USE_INSTALLED_CONSOLE must be 'true' or 'false' (got '${installedConsoleValue}')`,
    );
  }

  const consoleLoginValue = process.env.E2E_CONSOLE_LOGIN || 'false';
  if (!['true', 'false'].includes(consoleLoginValue)) {
    throw new Error(`E2E_CONSOLE_LOGIN must be 'true' or 'false' (got '${consoleLoginValue}')`);
  }

  return installedConsoleValue === 'true' || consoleLoginValue === 'true';
}

export function hasConsoleCredentials(): boolean {
  return Boolean(process.env.E2E_CONSOLE_USERNAME && process.env.E2E_CONSOLE_PASSWORD);
}
