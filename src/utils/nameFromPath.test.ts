import extractResourceNameFromURL, {
  extractKindFromURL,
  extractNamespaceFromURL,
} from './nameFromPath';

describe('extractResourceNameFromURL', () => {
  it('returns the segment after the GVK for a standard v1 path', () => {
    expect(
      extractResourceNameFromURL('/k8s/ns/my-ns/gateway.networking.k8s.io~v1~Gateway/my-gateway'),
    ).toBe('my-gateway');
  });

  it('returns the segment after the GVK for a v1alpha1 version path', () => {
    expect(
      extractResourceNameFromURL('/k8s/ns/my-ns/kuadrant.io~v1alpha1~AuthPolicy/my-policy'),
    ).toBe('my-policy');
  });

  it('returns the segment after the GVK for a v2beta3 version path', () => {
    expect(
      extractResourceNameFromURL('/k8s/ns/my-ns/kuadrant.io~v2beta3~RateLimitPolicy/my-policy'),
    ).toBe('my-policy');
  });

  it('returns the segment immediately after the GVK ignoring any subpath', () => {
    expect(
      extractResourceNameFromURL(
        '/k8s/ns/my-ns/gateway.networking.k8s.io~v1~HTTPRoute/my-route/policies',
      ),
    ).toBe('my-route');
  });

  it('returns null when the path is an empty string', () => {
    expect(extractResourceNameFromURL('')).toBeNull();
  });

  it('returns null when the path has no group~vX~Kind segment', () => {
    expect(extractResourceNameFromURL('/k8s/ns/my-ns/not-a-gvk')).toBeNull();
  });

  it('returns null when the path ends at the GVK segment with no name after it', () => {
    expect(
      extractResourceNameFromURL('/k8s/ns/my-ns/gateway.networking.k8s.io~v1~Gateway'),
    ).toBeNull();
  });
});

describe('extractKindFromURL', () => {
  it('returns the Kind from a standard v1 path', () => {
    expect(
      extractKindFromURL('/k8s/ns/my-ns/gateway.networking.k8s.io~v1~HTTPRoute/my-route'),
    ).toBe('HTTPRoute');
  });

  it('returns the Kind from a v1alpha1 version path', () => {
    expect(extractKindFromURL('/k8s/ns/my-ns/kuadrant.io~v1alpha1~AuthPolicy/my-policy')).toBe(
      'AuthPolicy',
    );
  });

  it('returns the Kind from a v2beta3 version path', () => {
    expect(extractKindFromURL('/k8s/ns/my-ns/kuadrant.io~v2beta3~RateLimitPolicy/my-policy')).toBe(
      'RateLimitPolicy',
    );
  });

  it('returns null when the path is an empty string', () => {
    expect(extractKindFromURL('')).toBeNull();
  });

  it('returns null when the path has no group~vX~Kind segment', () => {
    expect(extractKindFromURL('/k8s/ns/my-ns/not-a-gvk')).toBeNull();
  });
});

describe('extractNamespaceFromURL', () => {
  it('returns the segment after /ns/ as the namespace', () => {
    expect(
      extractNamespaceFromURL(
        '/k8s/ns/my-namespace/gateway.networking.k8s.io~v1~Gateway/my-gateway',
      ),
    ).toBe('my-namespace');
  });

  it('returns the namespace when there is no resource name after the GVK', () => {
    expect(
      extractNamespaceFromURL('/k8s/ns/my-namespace/gateway.networking.k8s.io~v1~Gateway'),
    ).toBe('my-namespace');
  });

  it('returns null when the path is an empty string', () => {
    expect(extractNamespaceFromURL('')).toBeNull();
  });

  it('returns null when the path has no /ns/ segment', () => {
    expect(extractNamespaceFromURL('/k8s/cluster/gateway.networking.k8s.io~v1~Gateway')).toBeNull();
  });

  it('returns null when /ns/ is the last segment with nothing after it', () => {
    expect(extractNamespaceFromURL('/k8s/ns/')).toBeNull();
  });
});
