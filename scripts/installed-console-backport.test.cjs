const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const repoRoot = resolve(__dirname, '..');

function runWithClusterCLI(script, overrides = {}) {
  const tempDir = mkdtempSync(join(tmpdir(), 'installed-console-test-'));
  const binDir = join(tempDir, 'bin');
  const callLog = join(tempDir, 'calls');
  mkdirSync(binDir);

  const fakeCLI = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const name = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_CALL_LOG, name + ' ' + args.join(' ') + String.fromCharCode(10));
if (name === 'oinc') process.exit(42);
if (name === 'npx') process.exit(0);
if (name === 'oc') {
  if (args[0] === 'config' && args[1] === 'current-context') {
    process.stdout.write(process.env.FAKE_OC_CONTEXT || 'test-context');
  } else if (args[0] === 'whoami') {
    process.stdout.write('https://api.example.test');
  } else if (args[0] === 'get' && args[1] === 'route') {
    process.stdout.write('console.example.test');
  }
  process.exit(0);
}
if (name === 'kubectl') {
  const command = args.find((arg) => !arg.startsWith('--kubeconfig='));
  if (command === 'config' && args.includes('current-context')) {
    process.stdout.write('test-context');
  } else if (command === 'config' && args.includes('view')) {
    if (args.includes('--raw')) process.stdout.write('apiVersion: v1\\nkind: Config\\ncurrent-context: test-context\\n');
    else process.stdout.write('https://api.example.test');
  } else if (command === 'get' && args.includes('crd') && args.includes(process.env.FAKE_MISSING_CRD)) {
    process.exit(1);
  } else if (command === 'get' && args.includes('namespace')) {
    const namespace = args[args.indexOf('namespace') + 1];
    if (args.some((arg) => arg.startsWith('jsonpath='))) {
      process.stdout.write(namespace === 'kuadrant-test' ? (process.env.FAKE_NAMESPACE_OWNER || '') : 'console-plugin');
    } else if (namespace === 'kuadrant-test') {
      process.stdout.write('namespace/kuadrant-test');
    }
  }
  process.exit(0);
}
`;
  for (const name of ['oc', 'kubectl', 'oinc', 'npx']) {
    const file = join(binDir, name);
    writeFileSync(file, fakeCLI);
    chmodSync(file, 0o755);
  }

  try {
    const result = spawnSync('bash', [script], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 5_000,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        FAKE_CALL_LOG: callLog,
        E2E_USE_EXISTING_CLUSTER: 'true',
        E2E_CONSOLE_USERNAME: 'test-user',
        E2E_CONSOLE_PASSWORD: 'test-password',
        PLAYWRIGHT_STORAGE_STATE: '',
        ...overrides,
      },
    });
    return { ...result, calls: existsSync(callLog) ? readFileSync(callLog, 'utf8') : '' };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test('installed runner rejects mismatched CLI contexts before touching the cluster', () => {
  const result = runWithClusterCLI('e2e/run-installed-console.sh', {
    FAKE_OC_CONTEXT: 'other-context',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /oc and kubectl must use the same current context/);
  assert.doesNotMatch(result.calls, /(?:kubectl (?:apply|create|delete)|oinc |npx )/);
});

test('existing-cluster setup checks CRDs before writing fixtures', () => {
  const result = runWithClusterCLI('e2e/setup.sh', {
    FAKE_MISSING_CRD: 'apiproducts.devportal.kuadrant.io',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /E2E fixtures need these CRDs/, `${result.error}\n${result.calls}`);
  assert.doesNotMatch(result.calls, /(?:kubectl (?:apply|create|delete|patch)|oinc )/);
});

test('existing-cluster teardown refuses unowned namespaces before deleting anything', () => {
  const result = runWithClusterCLI('e2e/teardown.sh');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not marked as E2E-owned/);
  assert.doesNotMatch(result.calls, /(?:kubectl delete|oinc )/);
});
