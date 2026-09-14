const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const yaml = require('js-yaml');

const resources = yaml.loadAll(readFileSync(join(__dirname, 'mcp-demo.yaml'), 'utf8'));
const find = (kind, name) =>
  resources.find((resource) => resource.kind === kind && resource.metadata.name === name);

test('both demo backends have distinct prefixes and complete Gateway routing', () => {
  const registrations = resources.filter((resource) => resource.kind === 'MCPServerRegistration');
  assert.deepEqual(registrations.map((resource) => resource.spec.prefix).sort(), [
    'stateless_',
    'toystore_',
  ]);
  const extension = find('MCPGatewayExtension', 'mcp-gateway-extension');
  const gateway = find('Gateway', extension.spec.targetRef.name);
  assert.equal(gateway.metadata.namespace, extension.spec.targetRef.namespace);
  assert.equal(gateway.spec.listeners[0].name, extension.spec.targetRef.sectionName);
  const grant = find('ReferenceGrant', 'mcp-demo-gateway');
  assert.equal(grant.metadata.namespace, gateway.metadata.namespace);
  assert.deepEqual(grant.spec.from, [
    {
      group: 'mcp.kuadrant.io',
      kind: 'MCPGatewayExtension',
      namespace: extension.metadata.namespace,
    },
  ]);
  assert.deepEqual(grant.spec.to, [
    { group: 'gateway.networking.k8s.io', kind: 'Gateway', name: gateway.metadata.name },
  ]);
  for (const registration of registrations) {
    const route = find('HTTPRoute', registration.spec.targetRef.name);
    assert.equal(route.metadata.namespace, registration.metadata.namespace);
    assert.deepEqual(route.spec.parentRefs[0], {
      name: gateway.metadata.name,
      namespace: gateway.metadata.namespace,
      sectionName: 'mcp',
    });
    const backend = route.spec.rules[0].backendRefs[0];
    const service = find('Service', backend.name);
    const deployment = find('Deployment', backend.name);
    assert.equal(service.metadata.namespace, route.metadata.namespace);
    assert.equal(deployment.metadata.namespace, service.metadata.namespace);
    assert.deepEqual(service.spec.selector, deployment.spec.template.metadata.labels);
    assert.equal(service.spec.ports[0].port, backend.port);
    assert.equal(
      service.spec.ports[0].targetPort,
      deployment.spec.template.spec.containers[0].ports[0].containerPort,
    );
    assert.ok(find('Namespace', registration.metadata.namespace));
  }
});

test('uses the published stateful and stateless samples with HTTP enabled', () => {
  const stateful = find('Deployment', 'mcp-test-server').spec.template.spec.containers[0];
  assert.equal(stateful.image, 'ghcr.io/kuadrant/mcp-gateway/test-server1:latest');
  assert.deepEqual(stateful.args, ['--http', '0.0.0.0:9090']);
  const stateless = find('Deployment', 'mcp-test-stateless-server').spec.template.spec
    .containers[0];
  assert.equal(stateless.image, 'ghcr.io/kuadrant/mcp-gateway/test-stateless-server:latest');
  assert.equal(stateless.imagePullPolicy, 'IfNotPresent');
  assert.deepEqual(stateless.env, [
    { name: 'MCP_TRANSPORT', value: 'http' },
    { name: 'PORT', value: '9090' },
  ]);
});
