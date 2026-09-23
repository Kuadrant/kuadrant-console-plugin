import { getCreatePolicyUrlForNode } from './navigationHelpers';

describe('getCreatePolicyUrlForNode', () => {
  it('creates the policy in the route namespace, targeting the route', () => {
    expect(
      getCreatePolicyUrlForNode('RateLimitPolicy', 'HTTPRoute', 'hello-rhcl/hello-route'),
    ).toBe(
      '/k8s/ns/hello-rhcl/kuadrant.io~v1~RateLimitPolicy/~new?targetKind=HTTPRoute&targetName=hello-route',
    );
  });

  it('creates the policy in the gateway namespace, targeting the gateway', () => {
    expect(
      getCreatePolicyUrlForNode('DNSPolicy', 'Gateway', 'openshift-ingress/default-gateway'),
    ).toBe(
      '/k8s/ns/openshift-ingress/kuadrant.io~v1~DNSPolicy/~new?targetKind=Gateway&targetName=default-gateway',
    );
  });

  it('returns null for a node without a namespace', () => {
    expect(getCreatePolicyUrlForNode('RateLimitPolicy', 'HTTPRoute', 'hello-route')).toBeNull();
  });

  it('returns null when the policy cannot target the node', () => {
    expect(
      getCreatePolicyUrlForNode('DNSPolicy', 'HTTPRoute', 'hello-rhcl/hello-route'),
    ).toBeNull();
  });

  it('returns null for an unknown policy type', () => {
    expect(
      getCreatePolicyUrlForNode('NotAPolicy', 'HTTPRoute', 'hello-rhcl/hello-route'),
    ).toBeNull();
  });
});
