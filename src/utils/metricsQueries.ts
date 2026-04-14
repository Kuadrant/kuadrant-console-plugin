/**
 * Escapes special characters in PromQL label values
 * @param value - Label value to escape
 * @returns Escaped value safe for PromQL interpolation
 */
const escapePromQLLabelValue = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/**
 * Builds a namespace filter for PromQL queries
 * @param namespace - Optional namespace to filter by
 * @returns PromQL label filter or empty string
 */
const buildNamespaceFilter = (namespace?: string): string =>
  namespace ? `source_workload_namespace="${escapePromQLLabelValue(namespace)}"` : '';

/**
 * Builds a Prometheus query for total requests, optionally filtered by namespace
 * @param namespace - Optional namespace to filter by (omit for cluster-wide)
 * @returns Prometheus query string
 */
export const buildTotalRequestsQuery = (namespace?: string): string => {
  const namespaceFilter = buildNamespaceFilter(namespace);
  return namespaceFilter
    ? `sum by (source_workload, source_workload_namespace) (increase(istio_requests_total{${namespaceFilter}}[24h]))`
    : `sum by (source_workload, source_workload_namespace) (increase(istio_requests_total[24h]))`;
};

/**
 * Builds a Prometheus query for error requests, optionally filtered by namespace
 * @param namespace - Optional namespace to filter by (omit for cluster-wide)
 * @returns Prometheus query string
 */
export const buildErrorRequestQuery = (namespace?: string): string => {
  const namespaceFilter = buildNamespaceFilter(namespace);
  return namespaceFilter
    ? `sum by (source_workload, source_workload_namespace) (increase(istio_requests_total{${namespaceFilter},response_code!~"2(.*)|3(.*)"}[24h]))`
    : `sum by (source_workload, source_workload_namespace) (increase(istio_requests_total{response_code!~"2(.*)|3(.*)"}[24h]))`;
};

/**
 * Builds a Prometheus query for errors by status code, optionally filtered by namespace
 * @param namespace - Optional namespace to filter by (omit for cluster-wide)
 * @returns Prometheus query string
 */
export const buildErrorsByCodeQuery = (namespace?: string): string => {
  const namespaceFilter = buildNamespaceFilter(namespace);
  return namespaceFilter
    ? `sum by (response_code, source_workload, source_workload_namespace) (increase(istio_requests_total{${namespaceFilter},response_code!~"2(.*)|3(.*)"}[24h]))`
    : `sum by (response_code, source_workload, source_workload_namespace) (increase(istio_requests_total{response_code!~"2(.*)|3(.*)"}[24h]))`;
};

/**
 * Constructs a gateway lookup key for metric data based on namespace, name, and workload suffix.
 *
 * @param namespace - Kubernetes namespace of the gateway
 * @param name - Name of the gateway resource
 * @param workloadSuffix - Suffix appended to gateway name in metrics (e.g., "-openshift-default" for OSSM 3, "-istio" for Istio)
 * @returns Lookup key in format "namespace/name<suffix>"
 *
 * @example
 * // OSSM 3 (with -openshift-default suffix):
 * buildGatewayKey('ingress-gateway', 'my-gateway', '-openshift-default') // "ingress-gateway/my-gateway-openshift-default"
 * // Istio gateway (with -istio suffix):
 * buildGatewayKey('api-gateway', 'external', '-istio') // "api-gateway/external-istio"
 */
export const buildGatewayKey = (
  namespace: string,
  name: string,
  workloadSuffix: string,
): string => {
  return `${namespace}/${name}${workloadSuffix}`;
};
