import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

// Shared types for API Management
export interface Condition {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  lastTransitionTime?: string;
  reason?: string;
  message?: string;
}

// APIProduct CRD (extensions.kuadrant.io/v1alpha1)

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
  conditions?: Condition[];
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

// APIKey CRD (devportal.kuadrant.io/v1alpha1)

export interface APIProductReference {
  name: string;
}

export interface RequestedBy {
  userId: string;
  email: string;
}

export interface APIKeySpec {
  apiProductRef: APIProductReference;
  planTier: string;
  useCase: string;
  requestedBy: RequestedBy;
}

export interface AuthScheme {
  authenticationSpec?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  credentials?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface Limits {
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface SecretRef {
  name: string;
  key: string;
}

export interface APIKeyStatus {
  phase?: string; // Values: "Pending", "Approved", "Rejected"
  reviewedBy?: string;
  reviewedAt?: string; // ISO date
  secretRef?: SecretRef;
  canReadSecret?: boolean;
  apiHostname?: string;
  apiKeyValue?: string;
  limits?: Limits;
  authScheme?: AuthScheme;
  conditions?: Condition[];
}

export interface APIKey extends K8sResourceCommon {
  spec: APIKeySpec;
  status?: APIKeyStatus;
}

// TODO: APIKeyRequest and APIKeyApproval CRDs may not be implemented in the backend yet.
// The backend currently uses APIKey with phase-based workflow (Pending → Approved/Rejected).
// These types are kept for potential future implementation.

// APIKeyRequest CRD (shadow resource in owner's namespace)

export interface APIKeyReference {
  name: string;
  namespace: string;
}

export interface LocalAPIProductReference {
  name: string;
}

export interface APIKeyRequestSpec {
  apiProductRef: LocalAPIProductReference;
  planTier: string;
  useCase: string;
  requestedBy: RequestedBy;
  apiKeyRef: APIKeyReference;
}

export interface APIKeyRequestStatus {
  conditions?: Condition[];
}

export interface APIKeyRequest extends K8sResourceCommon {
  spec: APIKeyRequestSpec;
  status?: APIKeyRequestStatus;
}

// APIKeyApproval CRD (owner's approval in their namespace)

export interface APIKeyRequestReference {
  name: string;
}

export interface APIKeyApprovalSpec {
  apiKeyRequestRef: APIKeyRequestReference;
  approved: boolean;
  reviewedBy: string;
  reviewedAt: string;
  reason?: string;
  message?: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface APIKeyApprovalStatus {
  // empty for now
}

export interface APIKeyApproval extends K8sResourceCommon {
  spec: APIKeyApprovalSpec;
  status?: APIKeyApprovalStatus;
}

// Condition type constants
export const APIKeyConditions = {
  Approved: 'Approved',
  Denied: 'Denied',
  Failed: 'Failed',
} as const;
