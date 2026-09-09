const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildPolicy, discoverAddresses } = require('./oinc-network-policy.cjs');

const backend = { name: 'kuadrant-console-plugin', namespace: 'kuadrant-system', port: 9443 };
const hostContainer = {
  HostConfig: {
    NetworkMode: 'host',
    ExtraHosts: ['kuadrant-console-plugin.kuadrant-system.svc:192.0.2.20'],
  },
  NetworkSettings: { Networks: { host: { IPAddress: '', GlobalIPv6Address: '' } } },
};

const service = {
  metadata: { namespace: 'kuadrant-system' },
  spec: {
    selector: {
      app: 'kuadrant-console-plugin',
      'app.kubernetes.io/managed-by': 'kuadrant-operator',
    },
    ports: [{ port: 9443, targetPort: 9443 }],
  },
};

test('restricts ingress to the backend and current Console host addresses', () => {
  const policy = buildPolicy(service, '192.0.2.3 2001:db8::1 192.0.2.3\n');
  assert.equal(policy.metadata.namespace, service.metadata.namespace);
  assert.deepEqual(policy.spec.podSelector.matchLabels, service.spec.selector);
  assert.deepEqual(policy.spec.policyTypes, ['Ingress']);
  assert.deepEqual(policy.spec.ingress, [
    {
      from: [{ ipBlock: { cidr: '192.0.2.3/32' } }, { ipBlock: { cidr: '2001:db8::1/128' } }],
      ports: [{ protocol: 'TCP', port: 9443 }],
    },
  ]);
  assert.equal(policy.spec.egress, undefined);
});

test('refresh replaces the previous address', () => {
  assert.deepEqual(buildPolicy(service, '192.0.2.4').spec.ingress[0].from, [
    { ipBlock: { cidr: '192.0.2.4/32' } },
  ]);
});

test('fails closed for missing or invalid addresses and unexpected Services', () => {
  for (const addresses of ['', ' ', '192.0.2.3/24', 'not-an-ip']) {
    assert.throws(() => buildPolicy(service, addresses));
  }
  assert.throws(() =>
    buildPolicy({ ...service, spec: { ...service.spec, selector: {} } }, '192.0.2.3'),
  );
  assert.throws(() =>
    buildPolicy(
      { ...service, spec: { ...service.spec, ports: [{ port: 9443, targetPort: 80 }] } },
      '192.0.2.3',
    ),
  );
});

test('bridge discovery keeps current container addresses without querying host routes', () => {
  const addresses = discoverAddresses(
    {
      HostConfig: { NetworkMode: 'bridge' },
      NetworkSettings: {
        Networks: {
          bridge: { IPAddress: '192.0.2.3', GlobalIPv6Address: '2001:db8::1' },
        },
      },
    },
    backend,
    () => assert.fail('Host route lookup is only for host networking'),
  );
  assert.deepEqual(buildPolicy(service, addresses).spec.ingress[0].from, [
    { ipBlock: { cidr: '192.0.2.3/32' } },
    { ipBlock: { cidr: '2001:db8::1/128' } },
  ]);
});

test('Linux host discovery queries the exact backend route and allows only its source', () => {
  const container = {
    ...hostContainer,
    HostConfig: {
      ...hostContainer.HostConfig,
      ExtraHosts: [
        'unrelated-service.kuadrant-system.svc:192.0.2.99',
        ...hostContainer.HostConfig.ExtraHosts,
      ],
    },
  };
  const addresses = discoverAddresses(container, backend, (command, args, options) => {
    assert.equal(command, 'ip');
    assert.deepEqual(args, ['-j', 'route', 'get', '192.0.2.20']);
    assert.deepEqual(options, { encoding: 'utf8' });
    return JSON.stringify([{ dst: '192.0.2.20', prefsrc: '192.0.2.1' }]);
  });
  assert.deepEqual(buildPolicy(service, addresses).spec.ingress[0].from, [
    { ipBlock: { cidr: '192.0.2.1/32' } },
  ]);
});

test('host discovery preserves IPv6 destinations and exact source prefixes', () => {
  const addresses = discoverAddresses(
    {
      HostConfig: {
        NetworkMode: 'host',
        ExtraHosts: ['kuadrant-console-plugin.kuadrant-system.svc:2001:db8::20'],
      },
    },
    backend,
    (command, args) => {
      assert.equal(command, 'ip');
      assert.deepEqual(args, ['-j', 'route', 'get', '2001:db8::20']);
      return JSON.stringify([{ prefsrc: '2001:db8::1' }]);
    },
  );
  assert.deepEqual(buildPolicy(service, addresses).spec.ingress[0].from, [
    { ipBlock: { cidr: '2001:db8::1/128' } },
  ]);
});

test('host discovery fails closed before route lookup for missing or invalid backend mappings', () => {
  for (const mappings of [
    [],
    ['different-service.kuadrant-system.svc:192.0.2.20'],
    ['kuadrant-console-plugin.kuadrant-system.svc:not-an-ip'],
    ['kuadrant-console-plugin.kuadrant-system.svc:192.0.2.0/24'],
    [...hostContainer.HostConfig.ExtraHosts, ...hostContainer.HostConfig.ExtraHosts],
  ]) {
    let called = false;
    assert.throws(
      () =>
        discoverAddresses(
          { HostConfig: { NetworkMode: 'host', ExtraHosts: mappings } },
          backend,
          () => {
            called = true;
            return '[]';
          },
        ),
      /Expected one IP mapping/,
    );
    assert.equal(called, false);
  }
});

test('host discovery fails closed for unusable route output and command failures', () => {
  for (const output of [
    '[]',
    '{}',
    'invalid-json',
    '[{}]',
    '[null]',
    '[{"prefsrc":"invalid"}]',
    '[{"prefsrc":"192.0.2.0/24"}]',
    '[{"prefsrc":"2001:db8::1"}]',
  ]) {
    assert.throws(() => discoverAddresses(hostContainer, backend, () => output));
  }
  assert.throws(
    () =>
      discoverAddresses(hostContainer, backend, () => {
        throw new Error('route lookup failed');
      }),
    /route lookup failed/,
  );
});

test('bridge discovery still fails closed when the container has no addresses', () => {
  assert.throws(
    () => buildPolicy(service, discoverAddresses({ NetworkSettings: {} }, backend)),
    /No usable OINC Console source IP/,
  );
});
