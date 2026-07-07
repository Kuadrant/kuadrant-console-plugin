import {
  getAPIKeyPhase,
  getPolicyKinds,
  getTopologyDefaultKinds,
  getPoliciesForResource,
  getGVK,
  getResourceMetadata,
} from './resources';
import type { APIKey } from './resources';

// ── getPolicyKinds ────────────────────────────────────────────────────────────

describe('getPolicyKinds', () => {
  it('includes all known policy kinds', () => {
    const kinds = getPolicyKinds();
    expect(kinds).toEqual(
      expect.arrayContaining([
        'AuthPolicy',
        'RateLimitPolicy',
        'DNSPolicy',
        'TLSPolicy',
        'TokenRateLimitPolicy',
        'OIDCPolicy',
        'PlanPolicy',
      ]),
    );
  });

  it('does not include non-policy kinds like Gateway', () => {
    const kinds = getPolicyKinds();
    expect(kinds).not.toContain('Gateway');
  });

  it('does not include non-policy kinds like HTTPRoute', () => {
    const kinds = getPolicyKinds();
    expect(kinds).not.toContain('HTTPRoute');
  });
});

// ── getTopologyDefaultKinds ───────────────────────────────────────────────────

describe('getTopologyDefaultKinds', () => {
  it('includes Gateway and HTTPRoute which are shown by default', () => {
    const kinds = getTopologyDefaultKinds();
    expect(kinds).toEqual(expect.arrayContaining(['Gateway', 'HTTPRoute']));
  });

  it('includes policy kinds that are shown by default', () => {
    const kinds = getTopologyDefaultKinds();
    expect(kinds).toEqual(expect.arrayContaining(['AuthPolicy', 'RateLimitPolicy']));
  });

  it('does not include APIKey which is not shown by default', () => {
    const kinds = getTopologyDefaultKinds();
    expect(kinds).not.toContain('APIKey');
  });

  it('does not include APIKeyRequest which is not shown by default', () => {
    const kinds = getTopologyDefaultKinds();
    expect(kinds).not.toContain('APIKeyRequest');
  });
});

// ── getPoliciesForResource ────────────────────────────────────────────────────

describe('getPoliciesForResource', () => {
  it('returns the policies that can target a Gateway', () => {
    const policies = getPoliciesForResource('Gateway');
    expect(policies).toEqual(
      expect.arrayContaining(['AuthPolicy', 'DNSPolicy', 'RateLimitPolicy', 'TLSPolicy']),
    );
  });

  it('returns the policies that can target an HTTPRoute', () => {
    const policies = getPoliciesForResource('HTTPRoute');
    expect(policies).toEqual(expect.arrayContaining(['AuthPolicy', 'RateLimitPolicy']));
  });

  it('does not include DNSPolicy for HTTPRoute', () => {
    const policies = getPoliciesForResource('HTTPRoute');
    expect(policies).not.toContain('DNSPolicy');
  });

  it('returns an empty array for a kind with no policy mappings', () => {
    expect(getPoliciesForResource('APIKey')).toEqual([]);
  });
});

// ── getGVK ────────────────────────────────────────────────────────────────────
// getGVK is a direct registry lookup — only valid ResourceKind values are accepted
// (enforced by TypeScript). toEqual catches wrong field values so no separate
// "wrong data" tests are needed.

describe('getGVK', () => {
  it('returns the correct GVK for Gateway', () => {
    expect(getGVK('Gateway')).toEqual({
      group: 'gateway.networking.k8s.io',
      version: 'v1',
      kind: 'Gateway',
    });
  });

  it('returns the correct GVK for AuthPolicy', () => {
    expect(getGVK('AuthPolicy')).toEqual({
      group: 'kuadrant.io',
      version: 'v1',
      kind: 'AuthPolicy',
    });
  });
});

// ── getResourceMetadata ───────────────────────────────────────────────────────

describe('getResourceMetadata', () => {
  it('returns metadata with isPolicy true for AuthPolicy', () => {
    expect(getResourceMetadata('AuthPolicy').isPolicy).toBe(true);
  });

  it('returns metadata with isPolicy false for Gateway', () => {
    expect(getResourceMetadata('Gateway').isPolicy).toBe(false);
  });
});

// ── getAPIKeyPhase ────────────────────────────────────────────────────────────

const makeAPIKey = (conditions: { type: string; status: string }[] = []): APIKey =>
  ({
    apiVersion: 'devportal.kuadrant.io/v1alpha1',
    kind: 'APIKey',
    metadata: { name: 'my-key', namespace: 'default' },
    status: { conditions },
  } as APIKey);

describe('getAPIKeyPhase', () => {
  it('returns Pending when there are no conditions', () => {
    expect(getAPIKeyPhase(makeAPIKey([]))).toBe('Pending');
  });

  it('returns Pending when status is undefined', () => {
    const apiKey = { ...makeAPIKey(), status: undefined };
    expect(getAPIKeyPhase(apiKey)).toBe('Pending');
  });

  it('returns Approved when Approved condition has status True', () => {
    expect(getAPIKeyPhase(makeAPIKey([{ type: 'Approved', status: 'True' }]))).toBe('Approved');
  });

  it('returns Denied when Denied condition has status True', () => {
    expect(getAPIKeyPhase(makeAPIKey([{ type: 'Denied', status: 'True' }]))).toBe('Denied');
  });

  it('returns Failed when Failed condition has status True', () => {
    expect(getAPIKeyPhase(makeAPIKey([{ type: 'Failed', status: 'True' }]))).toBe('Failed');
  });

  it('returns Pending when explicit Pending condition has status True', () => {
    expect(getAPIKeyPhase(makeAPIKey([{ type: 'Pending', status: 'True' }]))).toBe('Pending');
  });

  // A condition only counts when its status is the string 'True'.
  // Testing Approved with 'False' is representative — the same check applies to all types.
  it('returns Pending when Approved condition has status False', () => {
    expect(getAPIKeyPhase(makeAPIKey([{ type: 'Approved', status: 'False' }]))).toBe('Pending');
  });

  it('returns Approved when both Approved and Denied are True — Approved has higher priority', () => {
    expect(
      getAPIKeyPhase(
        makeAPIKey([
          { type: 'Approved', status: 'True' },
          { type: 'Denied', status: 'True' },
        ]),
      ),
    ).toBe('Approved');
  });

  it('returns Denied when both Denied and Failed are True — Denied has higher priority', () => {
    expect(
      getAPIKeyPhase(
        makeAPIKey([
          { type: 'Denied', status: 'True' },
          { type: 'Failed', status: 'True' },
        ]),
      ),
    ).toBe('Denied');
  });

  it('returns Failed when both Failed and Pending are True — Failed has higher priority', () => {
    expect(
      getAPIKeyPhase(
        makeAPIKey([
          { type: 'Failed', status: 'True' },
          { type: 'Pending', status: 'True' },
        ]),
      ),
    ).toBe('Failed');
  });

  it('returns Pending when condition type is unrecognised', () => {
    expect(getAPIKeyPhase(makeAPIKey([{ type: 'Unknown', status: 'True' }]))).toBe('Pending');
  });
});
