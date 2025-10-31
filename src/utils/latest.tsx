const resourceGVKMapping: { [key: string]: { group: string; version: string; kind: string } } = {
  Gateway: { group: 'gateway.networking.k8s.io', version: 'v1', kind: 'Gateway' },
  HTTPRoute: { group: 'gateway.networking.k8s.io', version: 'v1', kind: 'HTTPRoute' },
  TLSPolicy: { group: 'kuadrant.io', version: 'v1', kind: 'TLSPolicy' },
  DNSPolicy: { group: 'kuadrant.io', version: 'v1', kind: 'DNSPolicy' },
  AuthPolicy: { group: 'kuadrant.io', version: 'v1', kind: 'AuthPolicy' },
  RateLimitPolicy: { group: 'kuadrant.io', version: 'v1', kind: 'RateLimitPolicy' },
  ConfigMap: { group: '', version: 'v1', kind: 'ConfigMap' },
  TokenRateLimitPolicy: { group: 'kuadrant.io', version: 'v1alpha1', kind: 'TokenRateLimitPolicy' },
  OIDCPolicy: { group: 'extensions.kuadrant.io', version: 'v1alpha1', kind: 'OIDCPolicy' },
  PlanPolicy: { group: 'extensions.kuadrant.io', version: 'v1alpha1', kind: 'PlanPolicy' },
  Listener: { group: 'gateway.networking.k8s.io', version: 'v1', kind: 'Listener' },
  GatewayClass: { group: 'gateway.networking.k8s.io', version: 'v1', kind: 'GatewayClass' },
  WasmPlugin: { group: 'extensions.istio.io', version: 'v1alpha1', kind: 'WasmPlugin' },
  Authorino: { group: 'operator.authorino.kuadrant.io', version: 'v1beta1', kind: 'Authorino' },
  Limitador: { group: 'limitador.kuadrant.io', version: 'v1alpha1', kind: 'Limitador' },
  Kuadrant: { group: 'kuadrant.io', version: 'v1beta1', kind: 'Kuadrant' },
  ConsolePlugin: { group: 'console.openshift.io', version: 'v1', kind: 'ConsolePlugin' },
};

export default resourceGVKMapping;
