const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const repoRoot = resolve(__dirname, '..');
const generatedStatePath = resolve(repoRoot, 'e2e/.auth/installed-console.json');

function runNode(script, overrides = {}) {
  const env = {
    ...process.env,
    E2E_USE_INSTALLED_CONSOLE: 'false',
    E2E_CONSOLE_LOGIN: 'false',
    E2E_CONSOLE_USERNAME: 'e2e-user',
    E2E_CONSOLE_PASSWORD: 'e2e-password',
    E2E_IGNORE_HTTPS_ERRORS: 'false',
    CONSOLE_URL: 'http://localhost:9000',
    PLAYWRIGHT_STORAGE_STATE: '',
    ...overrides,
  };
  const result = spawnSync(process.execPath, ['-r', 'ts-node/register', '-e', script], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test('local-console credentials do not enable generated storage state by default', () => {
  const storageState = runNode(
    "const config = require('./e2e/playwright.config.ts').default; console.log(JSON.stringify(config.use.storageState ?? null));",
  );
  assert.equal(JSON.parse(storageState), null);
});

test('local-console login can be explicitly enabled', () => {
  const storageState = runNode(
    "const config = require('./e2e/playwright.config.ts').default; console.log(JSON.stringify(config.use.storageState ?? null));",
    { E2E_CONSOLE_LOGIN: 'true' },
  );
  assert.equal(JSON.parse(storageState), generatedStatePath);
});

test('installed-console credentials still enable generated storage state', () => {
  const storageState = runNode(
    "const config = require('./e2e/playwright.config.ts').default; console.log(JSON.stringify(config.use.storageState ?? null));",
    { E2E_USE_INSTALLED_CONSOLE: 'true' },
  );
  assert.equal(JSON.parse(storageState), generatedStatePath);
});

test('local-console credentials do not trigger browser login during global setup', () => {
  const output = runNode(`
    const Module = require('node:module');
    const originalLoad = Module._load;
    let launchCount = 0;
    Module._load = function(request, parent, isMain) {
      if (request === '@playwright/test') {
        return { chromium: { launch: async () => { launchCount += 1; throw new Error('unexpected login'); } } };
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    const setup = require('./e2e/global-setup.ts').default;
    setup({ projects: [{ use: { baseURL: 'http://localhost:9000' } }] }).then(() => {
      console.log(JSON.stringify(launchCount));
    }).catch((error) => { console.error(error); process.exitCode = 1; });
  `);
  assert.equal(JSON.parse(output), 0);
});

test('local-console credentials do not remove generated storage state during teardown', () => {
  const removedState = runNode(`
    const fs = require('node:fs');
    const originalExistsSync = fs.existsSync;
    const originalUnlinkSync = fs.unlinkSync;
    let removedState = false;
    fs.existsSync = (path) => String(path) === ${JSON.stringify(
      generatedStatePath,
    )} || originalExistsSync(path);
    fs.unlinkSync = (path) => {
      if (String(path) === ${JSON.stringify(generatedStatePath)}) removedState = true;
      else originalUnlinkSync(path);
    };
    const teardown = require('./e2e/global-teardown.ts').default;
    teardown().then(() => console.log(JSON.stringify(removedState)));
  `);
  assert.equal(JSON.parse(removedState), false);
});
