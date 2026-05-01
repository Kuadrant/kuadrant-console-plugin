import { APIKeyRequest } from './types';

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
