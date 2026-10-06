const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const yaml = require('js-yaml');

test('gateway-system is created with its ownership label in one API request', () => {
  const setup = readFileSync(join(__dirname, '../e2e/setup.sh'), 'utf8');
  const namespaceManifest = setup.match(/kubectl create -f - <<EOF\n([\s\S]*?)\nEOF/);
  assert.ok(namespaceManifest, 'setup should create the Gateway namespace from one manifest');
  const namespace = yaml.load(namespaceManifest[1]);
  assert.equal(namespace.kind, 'Namespace');
  assert.equal(namespace.metadata.name, 'gateway-system');
  assert.equal(namespace.metadata.labels['kuadrant.io/e2e-owned'], 'console-plugin');
  assert.doesNotMatch(setup, /kubectl label namespace "?\$\{?namespace\}?"?/);
});

test('OINC and existing-cluster setup share the HTTPRoute test Gateway definition', () => {
  const repoDir = join(__dirname, '..');
  const render = (mode) =>
    yaml.load(
      execFileSync(
        'bash',
        ['-c', 'source scripts/lib.sh; render_http_route_gateway "$1"', 'render-gateway', mode],
        { cwd: repoDir, encoding: 'utf8' },
      ),
    );
  const existing = render('existing');
  const oinc = render('oinc');

  for (const gateway of [existing, oinc]) {
    assert.equal(gateway.kind, 'Gateway');
    assert.equal(gateway.metadata.name, 'kuadrant-ingressgateway');
    assert.equal(gateway.metadata.namespace, 'gateway-system');
    assert.equal(gateway.spec.gatewayClassName, 'istio');
    assert.deepEqual(gateway.spec.listeners, [
      { name: 'http', port: 80, protocol: 'HTTP', allowedRoutes: { namespaces: { from: 'All' } } },
    ]);
  }
  assert.equal(existing.metadata.labels['kuadrant.io/e2e-owned'], 'console-plugin');
  assert.equal(existing.spec.infrastructure, undefined);
  assert.equal(oinc.spec.infrastructure.parametersRef.name, 'metallb-gateway-params');

  const existingSetup = readFileSync(join(repoDir, 'e2e/setup.sh'), 'utf8');
  const oincSetup = readFileSync(join(repoDir, 'scripts/cluster-setup.sh'), 'utf8');
  assert.match(existingSetup, /render_http_route_gateway existing \| kubectl create -f -/);
  assert.match(oincSetup, /render_http_route_gateway oinc \| kubectl apply -f -/);
});
