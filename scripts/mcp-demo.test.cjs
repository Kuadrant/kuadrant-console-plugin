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
  const extensions = resources.filter((resource) => resource.kind === 'MCPGatewayExtension');
  assert.equal(extensions.length, 2);
  assert.equal(new Set(extensions.map((extension) => extension.metadata.namespace)).size, 2);
  assert.equal(new Set(extensions.map((extension) => extension.spec.publicHost)).size, 2);
  const gateways = extensions.map((extension) => {
    const gateway = find('Gateway', extension.spec.targetRef.name);
    assert.equal(gateway.metadata.namespace, extension.spec.targetRef.namespace);
    assert.equal(gateway.spec.listeners[0].name, extension.spec.targetRef.sectionName);
    assert.equal(
      extension.spec.privateHost,
      `${gateway.metadata.name}-istio.${gateway.metadata.namespace}.svc.cluster.local:80`,
    );
    assert.ok(find('Namespace', extension.metadata.namespace));
    const parameters = find('ConfigMap', gateway.spec.infrastructure.parametersRef.name);
    assert.equal(parameters.metadata.namespace, gateway.metadata.namespace);
    assert.equal(yaml.load(parameters.data.service).spec.loadBalancerClass, 'oinc.io/metallb');
    const grant = resources.find(
      (resource) =>
        resource.kind === 'ReferenceGrant' &&
        resource.spec.to.some((target) => target.name === gateway.metadata.name),
    );
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
    return gateway;
  });
  for (const registration of registrations) {
    const route = find('HTTPRoute', registration.spec.targetRef.name);
    assert.equal(route.metadata.namespace, registration.metadata.namespace);
    assert.deepEqual(
      route.spec.parentRefs,
      gateways.map((gateway) => ({
        name: gateway.metadata.name,
        namespace: gateway.metadata.namespace,
        sectionName: 'mcp',
      })),
    );
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

test('only the authenticated demo gateway requires the bearer token token', () => {
  const policies = resources.filter((resource) => resource.kind === 'AuthPolicy');
  assert.equal(policies.length, 1);
  const policy = policies[0];
  const gateway = find('Gateway', 'mcp-gateway-auth');
  assert.equal(policy.metadata.namespace, gateway.metadata.namespace);
  assert.deepEqual(policy.spec.targetRef, {
    group: 'gateway.networking.k8s.io',
    kind: 'Gateway',
    name: gateway.metadata.name,
    sectionName: gateway.spec.listeners[0].name,
  });
  const authentication = policy.spec.rules.authentication['bearer-token'];
  assert.deepEqual(authentication.credentials, { authorizationHeader: { prefix: 'Bearer' } });
  const secret = find('Secret', 'mcp-demo-token');
  assert.equal(secret.metadata.namespace, 'kuadrant-system');
  assert.equal(secret.metadata.labels['authorino.kuadrant.io/managed-by'], 'authorino');
  for (const [label, value] of Object.entries(authentication.apiKey.selector.matchLabels)) {
    assert.equal(secret.metadata.labels[label], value);
  }
  assert.equal(secret.stringData.api_key, 'token');
  assert.equal(policy.spec.rules.response.unauthenticated.code, 401);
  assert.equal(
    policy.spec.rules.response.unauthenticated.headers['WWW-Authenticate'].value,
    'Bearer',
  );
  const networkPolicies = resources.filter((resource) => resource.kind === 'NetworkPolicy');
  assert.equal(networkPolicies.length, 2);
  assert.deepEqual(
    networkPolicies.map((resource) => resource.spec.ingress[0].ports[0].port).sort((a, b) => a - b),
    [8082, 50051],
  );
  for (const networkPolicy of networkPolicies) {
    assert.equal(networkPolicy.metadata.namespace, 'kuadrant-system');
    assert.deepEqual(networkPolicy.spec.ingress[0].from, [
      {
        namespaceSelector: {
          matchLabels: { 'kubernetes.io/metadata.name': gateway.metadata.namespace },
        },
        podSelector: {
          matchLabels: { 'gateway.networking.k8s.io/gateway-name': gateway.metadata.name },
        },
      },
    ]);
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
