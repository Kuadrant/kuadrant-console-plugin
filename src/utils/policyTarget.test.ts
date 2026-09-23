import { getCreatePolicyUrl, getPolicyTargetFromSearch, PolicyTargetKind } from './policyTarget';
import { RESOURCE_POLICY_MAP } from './resources';

const searchOf = (url: string) => url.slice(url.indexOf('?'));

describe('getCreatePolicyUrl', () => {
  it('builds the create url in the given namespace', () => {
    expect(getCreatePolicyUrl('RateLimitPolicy', 'hello-rhcl')).toBe(
      '/k8s/ns/hello-rhcl/kuadrant.io~v1~RateLimitPolicy/~new',
    );
  });

  it('carries the target kind and name', () => {
    expect(
      getCreatePolicyUrl('RateLimitPolicy', 'hello-rhcl', {
        kind: 'HTTPRoute',
        name: 'hello-route',
      }),
    ).toBe(
      '/k8s/ns/hello-rhcl/kuadrant.io~v1~RateLimitPolicy/~new?targetKind=HTTPRoute&targetName=hello-route',
    );
  });
});

describe('getPolicyTargetFromSearch', () => {
  it('reads the target from the query string', () => {
    expect(
      getPolicyTargetFromSearch('RateLimitPolicy', '?targetKind=HTTPRoute&targetName=hello-route'),
    ).toEqual({ kind: 'HTTPRoute', name: 'hello-route' });
  });

  it('returns null when no target is given', () => {
    expect(getPolicyTargetFromSearch('RateLimitPolicy', '')).toBeNull();
  });

  it('rejects a kind the policy cannot target', () => {
    expect(
      getPolicyTargetFromSearch('DNSPolicy', '?targetKind=HTTPRoute&targetName=hello-route'),
    ).toBeNull();
  });

  it('rejects a kind that is not a policy target', () => {
    expect(
      getPolicyTargetFromSearch('RateLimitPolicy', '?targetKind=Service&targetName=hello'),
    ).toBeNull();
  });

  it('rejects a missing name', () => {
    expect(getPolicyTargetFromSearch('RateLimitPolicy', '?targetKind=HTTPRoute')).toBeNull();
  });

  it('rejects a name that is not a valid resource name', () => {
    expect(
      getPolicyTargetFromSearch('RateLimitPolicy', '?targetKind=HTTPRoute&targetName=Not_Valid'),
    ).toBeNull();
  });

  it('round-trips every target a policy accepts', () => {
    Object.entries(RESOURCE_POLICY_MAP).forEach(([targetKind, policyKinds]) => {
      policyKinds.forEach((policyKind) => {
        const target = { kind: targetKind as PolicyTargetKind, name: 'my-target' };
        const url = getCreatePolicyUrl(policyKind, 'my-ns', target);
        expect(getPolicyTargetFromSearch(policyKind, searchOf(url))).toEqual(target);
      });
    });
  });
});
