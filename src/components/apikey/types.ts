import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

export type Condition = {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
};

export interface APIKey extends K8sResourceCommon {
  spec: {
    apiProductRef: {
      name: string;
      namespace: string;
    };
    secretRef: {
      name: string;
    };
    planTier: string;
    requestedBy?: {
      userId?: string;
      email?: string;
    };
    useCase?: string;
  };
  status?: {
    conditions?: Condition[];
    limits?: any;
    authScheme?: any;
    apiHostname?: string;
  };
}

export interface APIKeyRequest extends K8sResourceCommon {
  spec: {
    apiKeyRef: {
      name: string;
      namespace: string;
    };
    requestedBy?: {
      userId?: string;
      email?: string;
    };
    useCase?: string;
    planTier: string;
    apiProductRef: {
      name: string;
      namespace: string;
    };
  };
  status?: {
    conditions?: Condition[];
  };
}

export interface APIKeyApproval extends K8sResourceCommon {
  spec: {
    apiKeyRequestRef: {
      name: string;
    };
    approved: boolean;
    reviewedBy?: string;
    reviewedAt?: string;
    reason?: string;
    message?: string;
  };
}
