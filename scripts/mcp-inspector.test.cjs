const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const yaml = require('js-yaml');

test('authentication fixture grants only demo gateway access to its auth dependencies', () => {
  const resources = yaml.loadAll(
    readFileSync(join(__dirname, '../e2e/manifests/mcp-inspector-auth.yaml'), 'utf8'),
  );
  const policies = resources.filter((resource) => resource.kind === 'NetworkPolicy');
  assert.equal(policies.length, 2);
  const expectedTargets = new Map([
    [50051, { 'authorino-resource': 'authorino' }],
    [8082, { app: 'kuadrant', 'control-plane': 'controller-manager' }],
  ]);
  for (const policy of policies) {
    assert.equal(policy.metadata.namespace, 'kuadrant-system');
    assert.deepEqual(policy.spec.policyTypes, ['Ingress']);
    assert.equal(policy.spec.ingress.length, 1);
    const rule = policy.spec.ingress[0];
    assert.equal(rule.ports.length, 1);
    assert.equal(rule.ports[0].protocol, 'TCP');
    assert.deepEqual(policy.spec.podSelector.matchLabels, expectedTargets.get(rule.ports[0].port));
    assert.deepEqual(rule.from, [
      {
        namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'gateway-system' } },
        podSelector: { matchLabels: { 'gateway.networking.k8s.io/gateway-name': 'mcp-gateway' } },
      },
    ]);
  }
});
