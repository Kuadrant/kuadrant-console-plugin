import { getModelFromResource, getResourceNameFromKind } from './getModelFromResource';

// ── getResourceNameFromKind ───────────────────────────────────────────────────

describe('getResourceNameFromKind', () => {
  it('returns lowercase plural with +s for kinds not ending in y', () => {
    expect(getResourceNameFromKind('HTTPRoute')).toBe('httproutes');
  });

  it('returns lowercase plural with +s when kind ends in y preceded by a vowel', () => {
    expect(getResourceNameFromKind('Gateway')).toBe('gateways');
  });

  it('returns ies plural when kind ends in y preceded by a consonant', () => {
    expect(getResourceNameFromKind('AuthPolicy')).toBe('authpolicies');
  });

  it('returns ies plural for RateLimitPolicy', () => {
    expect(getResourceNameFromKind('RateLimitPolicy')).toBe('ratelimitpolicies');
  });

  it('returns ies plural for DNSPolicy', () => {
    expect(getResourceNameFromKind('DNSPolicy')).toBe('dnspolicies');
  });

  it('returns "ies" when kind is the single letter "y"', () => {
    expect(getResourceNameFromKind('y')).toBe('ies');
  });

  it('returns "s" when kind is an empty string', () => {
    expect(getResourceNameFromKind('')).toBe('s');
  });
});

// ── getModelFromResource ──────────────────────────────────────────────────────

describe('getModelFromResource', () => {
  const makeResource = (overrides = {}) => ({
    apiVersion: 'kuadrant.io/v1',
    kind: 'AuthPolicy',
    metadata: { name: 'my-policy', namespace: 'default' },
    ...overrides,
  });

  it('extracts apiGroup as the part before / in apiVersion', () => {
    const model = getModelFromResource(makeResource());
    expect(model.apiGroup).toBe('kuadrant.io');
  });

  it('extracts apiVersion as the part after / in apiVersion', () => {
    const model = getModelFromResource(makeResource());
    expect(model.apiVersion).toBe('v1');
  });

  it('sets plural to the pluralized kind', () => {
    const model = getModelFromResource(makeResource());
    expect(model.plural).toBe('authpolicies');
  });

  it('sets namespaced to true when metadata.namespace is present', () => {
    const model = getModelFromResource(makeResource());
    expect(model.namespaced).toBe(true);
  });

  it('sets namespaced to false when metadata.namespace is absent', () => {
    const model = getModelFromResource(makeResource({ metadata: { name: 'my-policy' } }));
    expect(model.namespaced).toBe(false);
  });

  it('sets abbr to the first character of kind', () => {
    const model = getModelFromResource(makeResource());
    expect(model.abbr).toBe('A');
  });

  it('uses pluralization rule for kinds ending in y preceded by a vowel', () => {
    const model = getModelFromResource(makeResource({ kind: 'Gateway' }));
    expect(model.plural).toBe('gateways');
  });

  it('uses ies pluralization for kinds ending in y preceded by a consonant', () => {
    const model = getModelFromResource(makeResource({ kind: 'DNSPolicy' }));
    expect(model.plural).toBe('dnspolicies');
  });

  it('sets apiVersion to undefined when apiVersion has no slash (core resource like "v1")', () => {
    const model = getModelFromResource(makeResource({ apiVersion: 'v1' }));
    expect(model.apiVersion).toBeUndefined();
  });

  it('sets abbr to empty string when kind is empty', () => {
    const model = getModelFromResource(makeResource({ kind: '' }));
    expect(model.abbr).toBe('');
  });

  it('sets namespaced to false when metadata.namespace is an empty string', () => {
    const model = getModelFromResource(
      makeResource({ metadata: { name: 'my-policy', namespace: '' } }),
    );
    expect(model.namespaced).toBe(false);
  });

  it('sets label to the kind as-is', () => {
    const model = getModelFromResource(makeResource());
    expect(model.label).toBe('AuthPolicy');
  });

  it('sets labelPlural to the pluralized kind', () => {
    const model = getModelFromResource(makeResource());
    expect(model.labelPlural).toBe('authpolicies');
  });
});
