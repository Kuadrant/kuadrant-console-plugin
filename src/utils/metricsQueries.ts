export const TOTAL_REQUESTS_QUERY = `sum by (source_workload, source_workload_namespace) (increase(istio_requests_total[24h]))`;

export const ERROR_REQUEST_QUERY = `sum by (source_workload, source_workload_namespace) (increase(istio_requests_total{response_code!~"2(.*)|3(.*)"}[24h]))`;

export const ERRORS_BY_CODE_QUERY = `sum by (response_code, source_workload, source_workload_namespace) (increase(istio_requests_total{response_code!~"2(.*)|3(.*)"}[24h]))`;

/**
 * Constructs a gateway lookup key for metric data based on namespace, name, and workload suffix.
 *
 * @param namespace - Kubernetes namespace of the gateway
 * @param name - Name of the gateway resource
 * @param workloadSuffix - Suffix appended to gateway name in metrics (e.g., "-openshift-default" for OSSM 3)
 * @returns Lookup key in format "namespace/name<suffix>"
 *
 * @example
 * // OSSM 3 (with -openshift-default suffix):
 * buildGatewayKey('ingress-gateway', 'my-gateway', '-openshift-default') // "ingress-gateway/my-gateway-openshift-default"
 */
export const buildGatewayKey = (
  namespace: string,
  name: string,
  workloadSuffix: string,
): string => {
  return `${namespace}/${name}${workloadSuffix}`;
};
