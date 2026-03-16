import { MetricsConfig } from './topology/configLoader';

/**
 * Builds a Prometheus query for total requests across all gateways.
 *
 * @param config - Metrics configuration containing metric name, query function, and time window
 * @returns Prometheus query string
 *
 * @example
 * // With default config (OpenShift 4.19+):
 * // sum by (source_workload, source_workload_namespace) (rate(istio_request_duration_milliseconds_count[2m]))
 *
 * // With OSSM config:
 * // sum by (source_workload, source_workload_namespace) (increase(istio_requests_total[24h]))
 */
export const buildTotalRequestsQuery = (config: MetricsConfig): string => {
  return `sum by (source_workload, source_workload_namespace) (${config.queryFunction}(${config.metricName}[${config.timeWindow}]))`;
};

/**
 * Builds a Prometheus query for error requests (non-2xx/3xx responses) across all gateways.
 *
 * @param config - Metrics configuration containing metric name, query function, time window, and success pattern
 * @returns Prometheus query string
 *
 * @example
 * // With default config (OpenShift 4.19+):
 * // sum by (source_workload, source_workload_namespace) (rate(istio_request_duration_milliseconds_count{response_code!~"2(.*)|3(.*)"}[2m]))
 */
export const buildErrorRequestsQuery = (config: MetricsConfig): string => {
  return `sum by (source_workload, source_workload_namespace) (${config.queryFunction}(${config.metricName}{response_code!~"${config.successCodePattern}"}[${config.timeWindow}]))`;
};

/**
 * Builds a Prometheus query for error requests grouped by response code.
 *
 * @param config - Metrics configuration containing metric name, query function, time window, and success pattern
 * @returns Prometheus query string
 *
 * @example
 * // With default config (OpenShift 4.19+):
 * // sum by (response_code, source_workload, source_workload_namespace) (rate(istio_request_duration_milliseconds_count{response_code!~"2(.*)|3(.*)"}[2m]))
 */
export const buildErrorsByCodeQuery = (config: MetricsConfig): string => {
  return `sum by (response_code, source_workload, source_workload_namespace) (${config.queryFunction}(${config.metricName}{response_code!~"${config.successCodePattern}"}[${config.timeWindow}]))`;
};

/**
 * Constructs a gateway lookup key for metric data based on namespace, name, and workload suffix.
 *
 * @param namespace - Kubernetes namespace of the gateway
 * @param name - Name of the gateway resource
 * @param workloadSuffix - Suffix appended to gateway name in metrics (e.g., "-istio" for OSSM)
 * @returns Lookup key in format "namespace/name<suffix>"
 *
 * @example
 * // OpenShift 4.19+ (no suffix):
 * buildGatewayKey('kuadrant-system', 'my-gateway', '') // "kuadrant-system/my-gateway"
 *
 * // OSSM (with -istio suffix):
 * buildGatewayKey('kuadrant-system', 'my-gateway', '-istio') // "kuadrant-system/my-gateway-istio"
 */
export const buildGatewayKey = (
  namespace: string,
  name: string,
  workloadSuffix: string,
): string => {
  return `${namespace}/${name}${workloadSuffix}`;
};
