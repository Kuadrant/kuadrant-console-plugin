// comprehensive resource registry - single source of truth for all kuadrant resources

export interface ResourceGVK {
  group: string;
  version: string;
  kind: string;
}

export interface ResourceMetadata {
  gvk: ResourceGVK;
  // plural name used in resource lists
  plural: string;
  // whether this is a kuadrant policy (has targetRef, shows in policies pages)
  isPolicy: boolean;
  // whether this is a gateway api resource
  isGatewayAPI: boolean;
  // whether this resource should appear in topology by default
  showInTopologyByDefault: boolean;
  // whether this is considered a kuadrant "internal" resource
  isKuadrantInternal: boolean;
  // navigation path for create page (if creatable via UI)
  createPath?: string;
}

// resource definitions
export const RESOURCES = {
  // gateway api resources
  Gateway: {
    gvk: { group: 'gateway.networking.k8s.io', version: 'v1', kind: 'Gateway' },
    plural: 'Gateways',
    isPolicy: false,
    isGatewayAPI: true,
    showInTopologyByDefault: true,
    isKuadrantInternal: false,
  },
  HTTPRoute: {
    gvk: { group: 'gateway.networking.k8s.io', version: 'v1', kind: 'HTTPRoute' },
    plural: 'HTTPRoutes',
    isPolicy: false,
    isGatewayAPI: true,
    showInTopologyByDefault: true,
    isKuadrantInternal: false,
  },
  GatewayClass: {
    gvk: { group: 'gateway.networking.k8s.io', version: 'v1', kind: 'GatewayClass' },
    plural: 'GatewayClasses',
    isPolicy: false,
    isGatewayAPI: true,
    showInTopologyByDefault: false,
    isKuadrantInternal: false,
  },
  Listener: {
    gvk: { group: 'gateway.networking.k8s.io', version: 'v1', kind: 'Listener' },
    plural: 'Listeners',
    isPolicy: false,
    isGatewayAPI: true,
    showInTopologyByDefault: false,
    isKuadrantInternal: false,
  },

  // kuadrant v1 policies
  AuthPolicy: {
    gvk: { group: 'kuadrant.io', version: 'v1', kind: 'AuthPolicy' },
    plural: 'AuthPolicies',
    isPolicy: true,
    isGatewayAPI: false,
    showInTopologyByDefault: true,
    isKuadrantInternal: false,
    createPath: 'KuadrantAuthPolicyCreatePage',
  },
  RateLimitPolicy: {
    gvk: { group: 'kuadrant.io', version: 'v1', kind: 'RateLimitPolicy' },
    plural: 'RateLimitPolicies',
    isPolicy: true,
    isGatewayAPI: false,
    showInTopologyByDefault: true,
    isKuadrantInternal: false,
    createPath: 'KuadrantRateLimitPolicyCreatePage',
  },
  DNSPolicy: {
    gvk: { group: 'kuadrant.io', version: 'v1', kind: 'DNSPolicy' },
    plural: 'DNSPolicies',
    isPolicy: true,
    isGatewayAPI: false,
    showInTopologyByDefault: true,
    isKuadrantInternal: false,
    createPath: 'KuadrantDNSPolicyCreatePage',
  },
  TLSPolicy: {
    gvk: { group: 'kuadrant.io', version: 'v1', kind: 'TLSPolicy' },
    plural: 'TLSPolicies',
    isPolicy: true,
    isGatewayAPI: false,
    showInTopologyByDefault: true,
    isKuadrantInternal: false,
    createPath: 'KuadrantTLSCreatePage',
  },
  DNSRecord: {
    gvk: { group: 'kuadrant.io', version: 'v1alpha1', kind: 'DNSRecord' },
    plural: 'DNSRecords',
    isPolicy: false,
    isGatewayAPI: false,
    showInTopologyByDefault: true,
    isKuadrantInternal: false,
  },

  // kuadrant v1alpha1 policies
  TokenRateLimitPolicy: {
    gvk: { group: 'kuadrant.io', version: 'v1alpha1', kind: 'TokenRateLimitPolicy' },
    plural: 'TokenRateLimitPolicies',
    isPolicy: true,
    isGatewayAPI: false,
    showInTopologyByDefault: true,
    isKuadrantInternal: false,
    createPath: 'KuadrantTokenRateLimitPolicyCreatePage',
  },

  // extensions.kuadrant.io policies
  OIDCPolicy: {
    gvk: { group: 'extensions.kuadrant.io', version: 'v1alpha1', kind: 'OIDCPolicy' },
    plural: 'OIDCPolicies',
    isPolicy: true,
    isGatewayAPI: false,
    showInTopologyByDefault: true,
    isKuadrantInternal: false,
    createPath: 'KuadrantOIDCPolicyCreatePage',
  },
  PlanPolicy: {
    gvk: { group: 'extensions.kuadrant.io', version: 'v1alpha1', kind: 'PlanPolicy' },
    plural: 'PlanPolicies',
    isPolicy: true,
    isGatewayAPI: false,
    showInTopologyByDefault: true,
    isKuadrantInternal: false,
    createPath: 'KuadrantPlanPolicyCreatePage',
  },

  // kuadrant infrastructure
  Kuadrant: {
    gvk: { group: 'kuadrant.io', version: 'v1beta1', kind: 'Kuadrant' },
    plural: 'Kuadrants',
    isPolicy: false,
    isGatewayAPI: false,
    showInTopologyByDefault: true,
    isKuadrantInternal: true,
  },
  Limitador: {
    gvk: { group: 'limitador.kuadrant.io', version: 'v1alpha1', kind: 'Limitador' },
    plural: 'Limitadors',
    isPolicy: false,
    isGatewayAPI: false,
    showInTopologyByDefault: true,
    isKuadrantInternal: true,
  },
  Authorino: {
    gvk: { group: 'operator.authorino.kuadrant.io', version: 'v1beta1', kind: 'Authorino' },
    plural: 'Authorinos',
    isPolicy: false,
    isGatewayAPI: false,
    showInTopologyByDefault: true,
    isKuadrantInternal: true,
  },

  // other resources
  ConfigMap: {
    gvk: { group: '', version: 'v1', kind: 'ConfigMap' },
    plural: 'ConfigMaps',
    isPolicy: false,
    isGatewayAPI: false,
    showInTopologyByDefault: false,
    isKuadrantInternal: true,
  },
  WasmPlugin: {
    gvk: { group: 'extensions.istio.io', version: 'v1alpha1', kind: 'WasmPlugin' },
    plural: 'WasmPlugins',
    isPolicy: false,
    isGatewayAPI: false,
    showInTopologyByDefault: false,
    isKuadrantInternal: false,
  },
  ConsolePlugin: {
    gvk: { group: 'console.openshift.io', version: 'v1', kind: 'ConsolePlugin' },
    plural: 'ConsolePlugins',
    isPolicy: false,
    isGatewayAPI: false,
    showInTopologyByDefault: false,
    isKuadrantInternal: false,
  },
} as const;

// type-safe resource keys
export type ResourceKind = keyof typeof RESOURCES;

// helper functions

// get all policy kinds
export const getPolicyKinds = (): ResourceKind[] => {
  return Object.entries(RESOURCES)
    .filter(([, meta]) => meta.isPolicy)
    .map(([kind]) => kind as ResourceKind);
};

// get all kinds that should show in topology by default
export const getTopologyDefaultKinds = (): ResourceKind[] => {
  return Object.entries(RESOURCES)
    .filter(([, meta]) => meta.showInTopologyByDefault)
    .map(([kind]) => kind as ResourceKind);
};

// get all kuadrant internal resource kinds
export const getKuadrantInternalKinds = (): ResourceKind[] => {
  return Object.entries(RESOURCES)
    .filter(([, meta]) => meta.isKuadrantInternal)
    .map(([kind]) => kind as ResourceKind);
};

// get GVK for a kind
export const getGVK = (kind: ResourceKind): ResourceGVK => {
  return RESOURCES[kind].gvk;
};

// get metadata for a kind
export const getResourceMetadata = (kind: ResourceKind): ResourceMetadata => {
  return RESOURCES[kind];
};

// backwards compatibility - export GVK mapping like latest.tsx
export const resourceGVKMapping: Record<ResourceKind, ResourceGVK> = Object.entries(
  RESOURCES,
).reduce((acc, [kind, meta]) => {
  acc[kind as ResourceKind] = meta.gvk;
  return acc;
}, {} as Record<ResourceKind, ResourceGVK>);

// policy attachment configuration - which policies can target which resources
export const RESOURCE_POLICY_MAP: Partial<Record<ResourceKind, ResourceKind[]>> = {
  Gateway: [
    'AuthPolicy',
    'DNSPolicy',
    'RateLimitPolicy',
    'TLSPolicy',
    'TokenRateLimitPolicy',
    'OIDCPolicy',
    'PlanPolicy',
  ],
  HTTPRoute: ['AuthPolicy', 'RateLimitPolicy', 'TokenRateLimitPolicy', 'OIDCPolicy', 'PlanPolicy'],
};

// get policy kinds that can target a given resource
export const getPoliciesForResource = (resourceKind: ResourceKind): ResourceKind[] => {
  return RESOURCE_POLICY_MAP[resourceKind] || [];
};

export default resourceGVKMapping;
