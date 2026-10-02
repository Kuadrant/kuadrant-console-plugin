const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const yaml = require('js-yaml');

const root = join(__dirname, '..');

function sandbox(t) {
  const dir = mkdtempSync(join(tmpdir(), 'oinc-demo-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'bin'));
  mkdirSync(join(dir, 'scripts'));
  for (const file of [
    'start-local.sh',
    'package.json',
    'scripts/lib.sh',
    'scripts/setup-demo.sh',
  ]) {
    copyFileSync(join(root, file), join(dir, file));
  }
  const log = join(dir, 'commands');
  writeFileSync(log, '');
  const stub = (name, body) =>
    writeFileSync(join(dir, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  const env = {
    ...process.env,
    PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
    DEMO_TEST_LOG: log,
  };
  return {
    dir,
    stub,
    commands: () => readFileSync(log, 'utf8'),
    run: (script, args = [], extraEnv = {}) =>
      spawnSync('/bin/bash', [join(dir, script), ...args], {
        cwd: dir,
        env: { ...env, ...extraEnv },
        encoding: 'utf8',
        timeout: 10000,
      }),
  };
}

for (const existing of [false, true]) {
  for (const demo of [false, true]) {
    test(`startup ${existing ? 'reuses' : 'creates'} cluster with demo ${
      demo ? 'enabled' : 'disabled'
    }`, (t) => {
      const s = sandbox(t);
      s.stub('bin/docker', 'echo kuadrant-console-plugin');
      s.stub(
        'bin/kubectl',
        `if [[ "$*" == 'get nodes' ]]; then exit ${existing ? 0 : 1}; fi\necho 0`,
      );
      s.stub('bin/curl', 'exit 0');
      s.stub('bin/lsof', 'exit 1');
      s.stub('bin/yarn', 'exit 0');
      for (const name of [
        'cluster-setup',
        'setup-demo',
        'setup-inspector-backend',
        'sync-console-plugin-proxy',
      ]) {
        s.stub(`scripts/${name}.sh`, `echo ${name} >> "$DEMO_TEST_LOG"`);
      }
      const result = s.run('start-local.sh', demo ? ['--demo'] : []);
      assert.equal(result.status, 0, result.stderr);
      const calls = s.commands().trim().split('\n');
      assert.equal(calls.includes('cluster-setup'), !existing);
      assert.equal(calls.filter((c) => c === 'setup-demo').length, demo ? 1 : 0);
      if (demo) {
        assert.ok(calls.indexOf('setup-demo') < calls.indexOf('setup-inspector-backend'));
        if (!existing) assert.ok(calls.indexOf('cluster-setup') < calls.indexOf('setup-demo'));
      }
    });
  }
}

test('help and invalid flags exit before starting cluster commands', (t) => {
  const s = sandbox(t);
  s.stub('bin/docker', 'echo unexpected >> "$DEMO_TEST_LOG"; exit 1');
  s.stub('bin/kubectl', 'echo unexpected >> "$DEMO_TEST_LOG"; exit 1');
  assert.match(s.run('start-local.sh', ['--help']).stdout, /ARGS=--demo/);
  const invalid = s.run('start-local.sh', ['--demoo']);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /unknown argument/);
  assert.equal(s.commands(), '');
});

test('Make forwards the demo flag and exposes a standalone seed target', () => {
  assert.match(
    execFileSync('make', ['-n', 'oinc', 'ARGS=--demo'], { cwd: root, encoding: 'utf8' }),
    /start-local.sh --demo/,
  );
  assert.match(
    execFileSync('make', ['-n', 'oinc-demo'], { cwd: root, encoding: 'utf8' }),
    /scripts\/setup-demo.sh/,
  );
});

test('installer refuses a different context before making changes', (t) => {
  const s = sandbox(t);
  s.stub('bin/kubectl', 'echo "$*" >> "$DEMO_TEST_LOG"; echo production');
  const result = s.run('scripts/setup-demo.sh');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /select the oinc context/);
  assert.equal(s.commands(), 'config current-context\n');
});

test('installer stops on missing APIs instead of partially applying the demo', (t) => {
  const s = sandbox(t);
  s.stub(
    'bin/kubectl',
    `
echo "$*" >> "$DEMO_TEST_LOG"
case "$*" in
  'config current-context') echo oinc ;;
  *'wait --for=create crd/'*) exit 1 ;;
esac`,
  );
  const result = s.run('scripts/setup-demo.sh');
  assert.equal(result.status, 1);
  assert.doesNotMatch(s.commands(), /apply -f/);
  assert.doesNotMatch(result.stdout, /demo installed/);
});

for (const mcpExitCode of [0, 1]) {
  test(`demo installer ${
    mcpExitCode
      ? 'stops when MCP setup fails'
      : 'refreshes the shared MCP samples before API samples'
  }`, (t) => {
    const s = sandbox(t);
    s.stub(
      'scripts/setup-mcp-demo.sh',
      `echo shared-mcp-demo >> "$DEMO_TEST_LOG"\nexit ${mcpExitCode}`,
    );
    s.stub(
      'bin/kubectl',
      `
echo "$*" >> "$DEMO_TEST_LOG"
case "$*" in
  'config current-context') echo oinc ;;
  *'get apikeyrequests -n kuadrant-demo-toystore'*)
    printf '%s\\n' kuadrant-demo-consumer/alice-toystore kuadrant-demo-consumer/bob-toystore ;;
  *'get apikeyrequests -n kuadrant-demo-gamestore'*)
    echo kuadrant-demo-consumer/gamestore-client ;;
esac`,
    );
    const result = s.run('scripts/setup-demo.sh');
    const commands = s.commands();
    assert.equal(commands.split('\n').filter((line) => line === 'shared-mcp-demo').length, 1);
    assert.equal(result.status, mcpExitCode, result.stderr);
    if (mcpExitCode) {
      assert.doesNotMatch(commands, /apply -f/);
      assert.doesNotMatch(result.stdout, /demo installed/);
    } else {
      assert.ok(commands.indexOf('shared-mcp-demo') < commands.indexOf('apply -f'));
      assert.match(result.stdout, /demo installed/);
    }
  });
}

test('sample references resolve and consumer plans match their product policies', () => {
  const resources = ['namespaces', 'gateway', 'apis', 'products', 'consumers'].flatMap((file) =>
    yaml.loadAll(readFileSync(join(__dirname, 'demo', `${file}.yaml`), 'utf8')),
  );
  const find = (kind, name, namespace) => {
    const resource = resources.find(
      (r) => r.kind === kind && r.metadata.name === name && r.metadata.namespace === namespace,
    );
    assert.ok(resource, `missing ${kind} ${namespace || ''}/${name}`);
    return resource;
  };
  for (const resource of resources) {
    assert.equal(resource.status, undefined, 'controllers must generate real status');
    if (resource.metadata.namespace) find('Namespace', resource.metadata.namespace);
    if (resource.spec?.targetRef) {
      find(resource.spec.targetRef.kind, resource.spec.targetRef.name, resource.metadata.namespace);
    }
    if (resource.kind === 'HTTPRoute') {
      for (const parent of resource.spec.parentRefs)
        find('Gateway', parent.name, parent.namespace || resource.metadata.namespace);
      for (const rule of resource.spec.rules) {
        for (const backend of rule.backendRefs) {
          const namespace = backend.namespace || resource.metadata.namespace;
          const service = find('Service', backend.name, namespace);
          assert.ok(service.spec.ports.some((port) => port.port === backend.port));
          if (namespace !== resource.metadata.namespace) {
            assert.ok(
              resources.some(
                (r) =>
                  r.kind === 'ReferenceGrant' &&
                  r.metadata.namespace === namespace &&
                  r.spec.from.some(
                    (from) =>
                      from.kind === 'HTTPRoute' && from.namespace === resource.metadata.namespace,
                  ) &&
                  r.spec.to.some((to) => to.kind === 'Service' && to.name === backend.name),
              ),
            );
          }
        }
      }
    }
    if (resource.kind === 'APIKey') {
      const ref = resource.spec.apiProductRef;
      const product = find('APIProduct', ref.name, ref.namespace);
      const secret = find('Secret', resource.spec.secretRef.name, resource.metadata.namespace);
      assert.ok(secret.stringData.api_key);
      assert.ok(
        resources.some(
          (r) =>
            r.kind === 'PlanPolicy' &&
            r.metadata.namespace === ref.namespace &&
            r.spec.targetRef.name === product.spec.targetRef.name &&
            r.spec.plans.some((plan) => plan.tier === resource.spec.planTier),
        ),
      );
    }
  }
});
