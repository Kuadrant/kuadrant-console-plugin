import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

export interface LocalObjectReference {
  name: string;
}

export interface CrossNamespaceObjectReference {
  name: string;
  namespace: string;
}

export interface RequestedBy {
  userId: string;
  email: string;
}

export interface APIKeySpec {
  // Cross-namespace reference to APIProduct
  apiProductRef: CrossNamespaceObjectReference;

  // Namespace-local reference to consumer's secret containing API key
  secretRef: LocalObjectReference;

  // Rate limiting plan tier
  planTier: string;

  // Who requested this API key
  requestedBy: RequestedBy;

  // Use case justification
  useCase: string;
}

export interface Condition {
  type: string; // 'Approved' | 'Denied' | 'Failed'
  status: string; // 'True' | 'False' | 'Unknown'
  lastTransitionTime?: string;
  reason?: string;
  message?: string;
}

export interface RateLimits {
  daily?: number;
  monthly?: number;
  custom?: Array<{
    limit: number;
    window: string;
  }>;
}

export interface AuthScheme {
  credentials?: {
    authorizationHeader?: {
      prefix: string;
    };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticationSpec?: any; // Complex kuadrant auth spec
}

export interface APIKeyStatus {
  conditions?: Condition[];
  limits?: RateLimits;
  authScheme?: AuthScheme;
  apiHostname?: string;
}

export interface APIKey extends K8sResourceCommon {
  spec: APIKeySpec;
  status?: APIKeyStatus;
}

// Phase derived from conditions (not stored in CRD)
export type APIKeyPhase = 'Pending' | 'Approved' | 'Denied' | 'Failed';

// Aliases for K8s resource types (for form compatibility)
export type APIKeyKind = APIKey;

// APIProduct types
export interface PlanInfo {
  name: string;
  authenticationSpec?: unknown;
}

export interface APIProductSpec {
  targetRef: {
    group: string;
    kind: string;
    name: string;
    namespace?: string;
  };
  description?: string;
}

export interface APIProductStatus {
  discoveredPlans?: PlanInfo[];
  openAPISpec?: string;
  conditions?: Condition[];
}

export interface APIProduct extends K8sResourceCommon {
  spec: APIProductSpec;
  status?: APIProductStatus;
}

export type APIProductKind = APIProduct;
