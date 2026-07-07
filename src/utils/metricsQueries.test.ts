import {
  buildTotalRequestsQuery,
  buildErrorRequestQuery,
  buildErrorsByCodeQuery,
  buildGatewayKey,
} from './metricsQueries';

describe('buildTotalRequestsQuery', () => {
  it('returns cluster-wide query when no namespace is provided', () => {
    const query = buildTotalRequestsQuery();
    expect(query).toContain('sum by (source_workload, source_workload_namespace)');
    expect(query).toContain('istio_requests_total');
    expect(query).toContain('increase(');
    expect(query).toContain('[24h]');
    expect(query).not.toContain('source_workload_namespace=');
  });

  it('returns namespace-filtered query when namespace is provided', () => {
    const query = buildTotalRequestsQuery('my-namespace');
    expect(query).toContain('source_workload_namespace="my-namespace"');
    expect(query).toContain('istio_requests_total');
    expect(query).toContain('increase(');
    expect(query).toContain('[24h]');
  });

  it('escapes special characters in namespace values', () => {
    const query = buildTotalRequestsQuery('ns-with"quotes');
    expect(query).toContain('source_workload_namespace="ns-with\\"quotes"');
  });
});

describe('buildErrorRequestQuery', () => {
  it('returns cluster-wide error query when no namespace is provided', () => {
    const query = buildErrorRequestQuery();
    expect(query).toContain('response_code!~"2(.*)|3(.*)"');
    expect(query).toContain('istio_requests_total');
    expect(query).not.toContain('source_workload_namespace=');
  });

  it('returns namespace-filtered error query when namespace is provided', () => {
    const query = buildErrorRequestQuery('prod');
    expect(query).toContain('source_workload_namespace="prod"');
    expect(query).toContain('response_code!~"2(.*)|3(.*)"');
  });
});

describe('buildErrorsByCodeQuery', () => {
  it('returns cluster-wide errors-by-code query when no namespace is provided', () => {
    const query = buildErrorsByCodeQuery();
    expect(query).toContain('sum by (response_code, source_workload, source_workload_namespace)');
    expect(query).toContain('response_code!~"2(.*)|3(.*)"');
    expect(query).not.toContain('source_workload_namespace=');
  });

  it('returns namespace-filtered errors-by-code query when namespace is provided', () => {
    const query = buildErrorsByCodeQuery('staging');
    expect(query).toContain('source_workload_namespace="staging"');
    expect(query).toContain('sum by (response_code, source_workload, source_workload_namespace)');
  });

  it('includes the response_code grouping that buildErrorRequestQuery does not', () => {
    const byCode = buildErrorsByCodeQuery();
    const errors = buildErrorRequestQuery();
    expect(byCode).toContain('sum by (response_code,');
    expect(errors).not.toContain('response_code,');
  });
});

describe('buildGatewayKey', () => {
  it('combines namespace, name, and suffix into a lookup key', () => {
    expect(buildGatewayKey('ingress-gateway', 'my-gateway', '-openshift-default')).toBe(
      'ingress-gateway/my-gateway-openshift-default',
    );
  });

  it('works with an empty suffix', () => {
    expect(buildGatewayKey('default', 'gw', '')).toBe('default/gw');
  });
});
