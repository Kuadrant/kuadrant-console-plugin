import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

// Extended PublishStatus to support full lifecycle (matches design doc)
export type ApprovalMode = 'manual' | 'automatic';
export type PublishStatus = 'Draft' | 'Published' | 'Deprecated' | 'Retired';

export interface TargetRef {
  group: string;
  kind: string;
  name: string;
  namespace?: string;
}

export interface Documentation {
  openAPISpecURL?: string;
  swaggerUI?: string;
  docsURL?: string;
  gitRepository?: string;
  techdocsRef?: string;
}

export interface ContactInfo {
  team?: string;
  email?: string;
  slack?: string;
  url?: string;
}

export interface APIProductSpec {
  displayName: string;
  description?: string;
  version?: string;
  approvalMode?: ApprovalMode;
  publishStatus?: PublishStatus;
  tags?: string[];
  targetRef: TargetRef;
  documentation?: Documentation;
  contact?: ContactInfo;
}

export interface PlanSpec {
  tier: string;
  limits?: any; // planpolicyv1alpha1.Limits - complex type
}

export interface APIProductStatus {
  observedGeneration?: number;
  discoveredPlans?: PlanSpec[];
  conditions?: {
    type: string;
    status: string;
    lastTransitionTime?: string;
    reason?: string;
    message?: string;
  }[];
  openapi?: {
    lastSyncTime?: string;
    maxSizeUsed: number;
    raw?: string;
  };
  discoveredAuthScheme?: any; // kuadrantapiv1.AuthSchemeSpec - complex type
  oidcDiscovery?: any; // OIDCDiscoveryStatus - complex type
}

export interface APIProduct extends K8sResourceCommon {
  spec: APIProductSpec;
  status?: APIProductStatus;
}
