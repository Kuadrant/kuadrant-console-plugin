import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

export type ApprovalMode = 'manual' | 'automatic';
export type PublishStatus = 'Published' | 'Unpublished';

export interface TargetRef {
  group: string;
  kind: string;
  name: string;
  namespace?: string;
}

export interface Documentation {
  openAPISpecURL?: string;
  docsURL?: string;
}

export interface ContactInfo {
  team?: string;
  email?: string;
  slack?: string;
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

export interface APIProductStatus {
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
}

export interface APIProduct extends K8sResourceCommon {
  spec: APIProductSpec;
  status?: APIProductStatus;
}

export interface PlanPolicy extends K8sResourceCommon {
  spec?: {
    targetRef?: {
      group?: string;
      kind?: string;
      name?: string;
      namespace?: string;
    };
  };
}
