// Development-only ingress for the standalone OINC Console, not an OpenShift pod.
const { execFileSync } = require('node:child_process');
const { isIP } = require('node:net');

function discoverAddresses(container, backend, run = execFileSync) {
  if (container.HostConfig?.NetworkMode !== 'host') {
    return Object.values(container.NetworkSettings?.Networks ?? {})
      .flatMap((network) => [network.IPAddress, network.GlobalIPv6Address])
      .filter(Boolean)
      .join(' ');
  }

  // Linux OINC shares the host network. Resolve the source of the route to
  // this backend's shadow LoadBalancer, rather than guessing a host interface.
  const host = `${backend.name}.${backend.namespace}.svc`;
  const mappings = (container.HostConfig.ExtraHosts ?? []).filter((entry) =>
    entry.startsWith(`${host}:`),
  );
  const destination = mappings[0]?.slice(host.length + 1);
  if (mappings.length !== 1 || !destination || !isIP(destination)) {
    throw new Error('Expected one IP mapping for the OINC backend service host');
  }
  const routes = JSON.parse(run('ip', ['-j', 'route', 'get', destination], { encoding: 'utf8' }));
  const source = Array.isArray(routes) && routes.length === 1 ? routes[0]?.prefsrc : undefined;
  if (typeof source !== 'string' || !isIP(source) || isIP(source) !== isIP(destination)) {
    throw new Error('No usable source IP in the OINC backend host route');
  }
  return source;
}

function buildPolicy(service, addresses) {
  const selector = service.spec?.selector;
  if (!service.metadata?.namespace || selector?.app !== 'kuadrant-console-plugin') {
    throw new Error('Expected the operator-managed kuadrant-console-plugin Service');
  }
  if (!service.spec.ports?.some((port) => port.port === 9443 && port.targetPort === 9443)) {
    throw new Error('Expected the plugin HTTPS Service on target port 9443');
  }
  const ips = [...new Set(addresses.trim().split(/\s+/).filter(Boolean))];
  if (!ips.length || ips.some((ip) => !isIP(ip))) {
    throw new Error('No usable OINC Console source IP; configure a CNI-specific dev ingress rule');
  }
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: {
      name: 'oinc-mcp-inspector-console-ingress',
      namespace: service.metadata.namespace,
      labels: { 'app.kubernetes.io/managed-by': 'oinc' },
    },
    spec: {
      podSelector: { matchLabels: selector },
      policyTypes: ['Ingress'],
      ingress: [
        {
          from: ips.map((ip) => ({ ipBlock: { cidr: `${ip}/${isIP(ip) === 4 ? 32 : 128}` } })),
          ports: [{ protocol: 'TCP', port: 9443 }],
        },
      ],
    },
  };
}

if (require.main === module) {
  const runtime = process.argv[2];
  if (!['docker', 'podman'].includes(runtime)) throw new Error('Expected docker or podman');
  const readResource = (...args) =>
    JSON.parse(
      execFileSync('kubectl', ['--context=oinc', 'get', ...args, '-o', 'json'], {
        encoding: 'utf8',
      }),
    );
  const plugin = readResource('consoleplugin', 'kuadrant-console-plugin');
  const backend = plugin.spec.proxy.find((proxy) => proxy.alias === 'backend')?.endpoint.service;
  if (!backend || backend.port !== 9443)
    throw new Error('Expected the operator-reconciled backend proxy');
  const service = readResource('service', backend.name, '-n', backend.namespace);
  const container = JSON.parse(
    execFileSync(runtime, ['inspect', '--format', '{{json .}}', 'oinc-console'], {
      encoding: 'utf8',
    }),
  );
  const addresses = discoverAddresses(container, backend);
  process.stdout.write(JSON.stringify(buildPolicy(service, addresses)));
}

module.exports = { buildPolicy, discoverAddresses };
