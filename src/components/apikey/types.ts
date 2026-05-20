import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

// APIKeyRequest types (shadow resource in owner's namespace)
export interface APIKeyRequest extends K8sResourceCommon {
  spec: APIKeyRequestSpec;
  status?: APIKeyRequestStatus;
}

export interface APIKeyRequestSpec {
  apiProductRef: { name: string }; // local ref to APIProduct in same namespace
  planTier: string;
  useCase: string;
  requestedBy: {
    userId: string;
    email: string;
  };
  apiKeyRef: {
    name: string;
    namespace: string; // cross-namespace ref to original APIKey
  };
}

export interface APIKeyRequestStatus {
  conditions?: {
    type: string;
    status: string;
    lastTransitionTime?: string;
    reason?: string;
    message?: string;
  }[];
}

// APIKeyApproval types (created by owner to approve/reject)
export interface APIKeyApproval extends K8sResourceCommon {
  spec: APIKeyApprovalSpec;
  status?: APIKeyApprovalStatus;
}

export interface APIKeyApprovalSpec {
  apiKeyRequestRef: { name: string }; // local ref to APIKeyRequest
  approved: boolean;
  reviewedBy: string;
  reviewedAt: string; // ISO 8601
  reason?: string;
  message?: string;
}

export interface APIKeyApprovalStatus {
  conditions?: {
    type: string;
    status: string;
    lastTransitionTime?: string;
    reason?: string;
    message?: string;
  }[];
}
