const resourceGVKMapping: { [key: string]: { group: string; version: string; kind: string } } = {
  Gateway: { group: 'gateway.networking.k8s.io', version: 'v1', kind: 'Gateway' },
  HTTPRoute: { group: 'gateway.networking.k8s.io', version: 'v1', kind: 'HTTPRoute' },
  TLSPolicy: { group: 'kuadrant.io', version: 'v1', kind: 'TLSPolicy' },
  DNSPolicy: { group: 'kuadrant.io', version: 'v1', kind: 'DNSPolicy' },
  AuthPolicy: { group: 'kuadrant.io', version: 'v1', kind: 'AuthPolicy' },
  RateLimitPolicy: { group: 'kuadrant.io', version: 'v1', kind: 'RateLimitPolicy' },
  ConfigMap: { group: '', version: 'v1', kind: 'ConfigMap' },
  Listener: { group: 'gateway.networking.k8s.io', version: 'v1', kind: 'Listener' },
  GatewayClass: { group: 'gateway.networking.k8s.io', version: 'v1', kind: 'GatewayClass' },
  WasmPlugin: { group: 'extensions.istio.io', version: 'v1alpha1', kind: 'WasmPlugin' },
};

export default resourceGVKMapping;
