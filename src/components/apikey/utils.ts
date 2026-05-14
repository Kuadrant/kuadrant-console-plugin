import { APIKey, APIKeyPhase, Condition } from './types';

/**
 * Derive APIKey phase from status.conditions following Kubernetes patterns
 * - Pending: Pending condition with status "True" or no conditions (empty array or undefined)
 * - Approved: Approved condition with status "True"
 * - Denied: Denied condition with status "True"
 * - Failed: Failed condition with status "True"
 */
export const getAPIKeyPhase = (apiKey: APIKey): APIKeyPhase => {
  const conditions = apiKey.status?.conditions || [];

  if (conditions.length === 0) {
    return 'Pending';
  }

  // Check for Approved condition
  const approved = conditions.find((c) => c.type === 'Approved' && c.status === 'True');
  if (approved) {
    return 'Approved';
  }

  // Check for Denied condition
  const denied = conditions.find((c) => c.type === 'Denied' && c.status === 'True');
  if (denied) {
    return 'Denied';
  }

  // Check for Failed condition
  const failed = conditions.find((c) => c.type === 'Failed' && c.status === 'True');
  if (failed) {
    return 'Failed';
  }

  // Check for Pending condition
  const pending = conditions.find((c) => c.type === 'Pending' && c.status === 'True');
  if (pending) {
    return 'Pending';
  }

  // Fallback to Pending if no recognized condition
  return 'Pending';
};

/**
 * Get the most relevant condition for display
 */
export const getPrimaryCondition = (apiKey: APIKey): Condition | undefined => {
  const conditions = apiKey.status?.conditions || [];

  // Priority: Approved > Denied > Failed > Pending
  return (
    conditions.find((c) => c.type === 'Approved' && c.status === 'True') ||
    conditions.find((c) => c.type === 'Denied' && c.status === 'True') ||
    conditions.find((c) => c.type === 'Failed' && c.status === 'True') ||
    conditions.find((c) => c.type === 'Pending' && c.status === 'True')
  );
};

/**
 * Get badge variant for status display (PatternFly Label variant)
 */
export const getPhaseVariant = (phase: APIKeyPhase): 'blue' | 'green' | 'red' | 'orange' => {
  switch (phase) {
    case 'Pending':
      return 'blue';
    case 'Approved':
      return 'green';
    case 'Denied':
      return 'red';
    case 'Failed':
      return 'orange';
    default:
      return 'blue';
  }
};
