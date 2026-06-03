import { k8sCreate, k8sList, k8sUpdate } from '@openshift-console/dynamic-plugin-sdk';
import { getModelFromResource } from '../../utils/getModelFromResource';
import { APIKeyRequest, APIKeyApproval } from './types';

/**
 * Derive status from APIKeyRequest conditions
 * Status priority: Approved > Denied > Pending
 */
export const getRequestStatus = (request: APIKeyRequest): 'Pending' | 'Approved' | 'Denied' => {
  if (!request.status?.conditions || request.status.conditions.length === 0) {
    return 'Pending';
  }

  const approved = request.status.conditions.find(
    (c) => c.type === 'Approved' && c.status === 'True',
  );
  if (approved) return 'Approved';

  const denied = request.status.conditions.find((c) => c.type === 'Denied' && c.status === 'True');
  if (denied) return 'Denied';

  return 'Pending';
};

/**
 * Get status sort weight for descending sort (pending > approved > denied)
 */
export const getStatusSortWeight = (status: string): number => {
  switch (status) {
    case 'Pending':
      return 3;
    case 'Approved':
      return 2;
    case 'Denied':
      return 1;
    default:
      return 0;
  }
};

/**
 * Truncate use case text with ellipsis
 */
export const truncateUseCase = (text: string, maxLength = 50): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

/**
 * Handle API key approval or denial by creating/updating an APIKeyApproval resource
 * For active keys (Approved status), updates the existing approval
 * For pending keys, creates a new approval
 */
export const handleAPIKeyApprovalOrDenial = async (
  request: APIKeyRequest,
  approved: boolean,
  currentUser: string,
  message?: string,
): Promise<void> => {
  const requestName = request.metadata?.name || request.metadata.name;
  const namespace = request.metadata?.namespace || request.metadata.namespace;
  const requestStatus = getRequestStatus(request);

  const approvalSpec = {
    apiKeyRequestRef: { name: requestName },
    approved,
    reviewedBy: currentUser,
    reviewedAt: new Date().toISOString(),
    reason: approved ? 'ApprovedByOwner' : 'DeniedByOwner',
    message: message || (approved ? 'Approved' : 'Denied'),
  };

  // Create a minimal approval object for getModelFromResource
  const approvalForModel: APIKeyApproval = {
    apiVersion: 'devportal.kuadrant.io/v1alpha1',
    kind: 'APIKeyApproval',
    metadata: {
      name: 'placeholder',
      namespace: namespace || 'placeholder',
    },
    spec: approvalSpec,
  };

  const model = getModelFromResource(approvalForModel);

  if (requestStatus === 'Approved') {
    // Active key - find and update existing approval
    const approvalsResponse = await k8sList<APIKeyApproval>({
      model,
      queryParams: { ns: namespace },
    });

    const approvalsList = Array.isArray(approvalsResponse)
      ? approvalsResponse
      : approvalsResponse.items || [];

    const existingApproval = approvalsList.find(
      (approval) => approval.spec.apiKeyRequestRef.name === requestName,
    );

    if (!existingApproval) {
      throw new Error(
        `Could not find existing approval for active API key: ${requestName}. Found ${approvalsList.length} approvals in namespace ${namespace}`,
      );
    }

    await k8sUpdate({
      model,
      data: {
        ...existingApproval,
        spec: approvalSpec,
      },
    });
  } else {
    // Pending key - create new approval
    const newApproval: APIKeyApproval = {
      apiVersion: 'devportal.kuadrant.io/v1alpha1',
      kind: 'APIKeyApproval',
      metadata: {
        name: `${requestName}-approval`,
        namespace,
      },
      spec: approvalSpec,
    };

    await k8sCreate({ model, data: newApproval });
  }
};
