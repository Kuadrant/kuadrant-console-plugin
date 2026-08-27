/**
 * Validation utilities for Kubernetes resource fields.
 * Each validation function returns null if valid, or an error message string.
 * Caller should apply t() to the returned error message.
 */

/**
 * Validates a required field is not empty.
 * @param value - The field value to validate
 * @returns null if valid, error message if invalid
 */
export const validateRequired = (value: string | undefined | null): string | null => {
  if (!value || value.trim() === '') {
    return 'This field is required';
  }
  return null;
};

/**
 * Validates a Kubernetes resource name (DNS-1123 subdomain format).
 * Rules:
 * - Must contain only lowercase alphanumeric characters, '-', or '.'
 * - Must start and end with an alphanumeric character
 * - Maximum length: 253 characters
 *
 * Used for: resource names, namespaces
 *
 * @param name - The name to validate
 * @returns null if valid, i18n error key if invalid
 */
export const validateK8sName = (name: string): string | null => {
  if (!name) {
    return null; // Empty check should be done separately with validateRequired
  }

  if (name.length > 253) {
    return 'Name must be no more than 253 characters';
  }

  // DNS-1123 subdomain regex: lowercase alphanumeric, '-', '.'
  // Must start and end with alphanumeric
  const dns1123SubdomainRegex = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/;

  if (!dns1123SubdomainRegex.test(name)) {
    return 'Name must consist of lowercase alphanumeric characters, "-", or ".", and must start and end with an alphanumeric character';
  }

  return null;
};

/**
 * Validates a DNS-1123 label.
 * Rules:
 * - Must contain only lowercase alphanumeric characters or '-'
 * - Must start and end with an alphanumeric character
 * - Maximum length: 63 characters
 *
 * Used for: Gateway listener/section names and namespace names (via
 * {@link validateNamespace}). NOTE: this is NOT a validator for Kubernetes
 * label *values* — those additionally permit uppercase, '_', and '.'.
 *
 * @param label - The label to validate
 * @returns null if valid, i18n error key if invalid
 */
export const validateK8sLabel = (label: string): string | null => {
  if (!label) {
    return null; // Empty check should be done separately with validateRequired
  }

  if (label.length > 63) {
    return 'Label must be no more than 63 characters';
  }

  // DNS-1123 label regex: lowercase alphanumeric and '-' only
  // Must start and end with alphanumeric
  const dns1123LabelRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

  if (!dns1123LabelRegex.test(label)) {
    return 'Label must consist of lowercase alphanumeric characters or "-", and must start and end with an alphanumeric character';
  }

  return null;
};

/**
 * Validates a port number.
 * Rules:
 * - Must be between 1 and 65535 (inclusive)
 *
 * @param port - The port number to validate
 * @returns null if valid, i18n error key if invalid
 */
export const validatePort = (port: number | string): string | null => {
  // For string input, only a plain run of digits is a valid port. Number()
  // would otherwise accept exponent/decimal/whitespace forms such as '1e2'
  // (→ 100), '1.5', or ' 80 ', letting malformed input slip through.
  if (typeof port === 'string' && !/^\d+$/.test(port.trim())) {
    return 'Port must be a valid number';
  }

  const portNum = typeof port === 'string' ? Number(port) : port;

  if (isNaN(portNum) || !Number.isInteger(portNum)) {
    return 'Port must be a valid number';
  }

  if (portNum < 1 || portNum > 65535) {
    return 'Port must be between 1 and 65535';
  }

  return null;
};

/**
 * Validates a Kubernetes namespace name.
 * Namespace names must be DNS-1123 labels (no dots allowed, unlike resource names).
 *
 * @param namespace - The namespace to validate
 * @returns null if valid, i18n error key if invalid
 */
export const validateNamespace = (namespace: string): string | null => {
  return validateK8sLabel(namespace);
};

/**
 * i18n extraction marker.
 *
 * The validators above return raw English message strings that call sites feed
 * through `t(errorKey)`. i18next-parser can't follow those dynamic `t(variable)`
 * calls, so it would neither add these keys nor keep them (keepRemoved is off).
 * Listing every message here as a literal `t('...')` lets `yarn i18n` extract
 * and preserve them. This function is never invoked at runtime — it exists
 * purely so the parser can see the literals. Keep it in sync with the strings
 * returned above.
 */
export const _validationI18nKeys = (t: (key: string) => string): string[] => [
  t('This field is required'),
  t('Name must be no more than 253 characters'),
  t(
    'Name must consist of lowercase alphanumeric characters, "-", or ".", and must start and end with an alphanumeric character',
  ),
  t('Label must be no more than 63 characters'),
  t(
    'Label must consist of lowercase alphanumeric characters or "-", and must start and end with an alphanumeric character',
  ),
  t('Port must be a valid number'),
  t('Port must be between 1 and 65535'),
];
