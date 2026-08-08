import {
  generateUniqueId,
  removeCertsAndTlsOptionsForPassthrough,
} from './gatewayCreateEditHelpers';

describe('generateUniqueId', () => {
  it('returns a string with the default prefix when no prefix is provided', () => {
    const id = generateUniqueId();
    expect(id).toMatch(/^item_\d+_\d+_[a-z0-9]+$/);
  });

  it('returns a string with the provided prefix', () => {
    const id = generateUniqueId('listener');
    expect(id).toMatch(/^listener_\d+_\d+_[a-z0-9]+$/);
  });

  it('produces different IDs on successive calls', () => {
    const id1 = generateUniqueId('test');
    const id2 = generateUniqueId('test');
    expect(id1).not.toBe(id2);
  });
});

describe('removeCertsAndTlsOptionsForPassthrough', () => {
  it('clears certificateRefs and tlsOptions for HTTPS + Passthrough', () => {
    const listener = {
      protocol: 'HTTPS' as const,
      tlsMode: 'Passthrough' as const,
      certificateRefs: [{ name: 'cert1' }],
      tlsOptions: [{ key: 'val' }],
    };

    const result = removeCertsAndTlsOptionsForPassthrough(listener);

    expect(result.certificateRefs).toEqual([]);
    expect(result.tlsOptions).toEqual([]);
  });

  it('clears certificateRefs and tlsOptions for TLS + Passthrough', () => {
    const listener = {
      protocol: 'TLS' as const,
      tlsMode: 'Passthrough' as const,
      certificateRefs: [{ name: 'cert1' }],
      tlsOptions: [{ key: 'val' }],
    };

    const result = removeCertsAndTlsOptionsForPassthrough(listener);

    expect(result.certificateRefs).toEqual([]);
    expect(result.tlsOptions).toEqual([]);
  });

  it('leaves certificateRefs and tlsOptions unchanged for HTTPS + Terminate', () => {
    const listener = {
      protocol: 'HTTPS' as const,
      tlsMode: 'Terminate' as const,
      certificateRefs: [{ name: 'cert1' }],
      tlsOptions: [{ key: 'val' }],
    };

    const result = removeCertsAndTlsOptionsForPassthrough(listener);

    expect(result.certificateRefs).toEqual([{ name: 'cert1' }]);
    expect(result.tlsOptions).toEqual([{ key: 'val' }]);
  });

  it('leaves listener unchanged for HTTP protocol', () => {
    const listener = {
      protocol: 'HTTP' as const,
      tlsMode: 'Terminate' as const,
      certificateRefs: [{ name: 'cert1' }],
      tlsOptions: [{ key: 'val' }],
    };

    const result = removeCertsAndTlsOptionsForPassthrough(listener);

    expect(result).toEqual(listener);
  });

  it('leaves listener unchanged for TCP protocol', () => {
    const listener = {
      protocol: 'TCP' as const,
      tlsMode: 'Terminate' as const,
      certificateRefs: [{ name: 'cert1' }],
      tlsOptions: [{ key: 'val' }],
    };

    const result = removeCertsAndTlsOptionsForPassthrough(listener);

    expect(result).toEqual(listener);
  });

  it('leaves listener unchanged for UDP protocol', () => {
    const listener = {
      protocol: 'UDP' as const,
      tlsMode: 'Terminate' as const,
      certificateRefs: [{ name: 'cert1' }],
      tlsOptions: [{ key: 'val' }],
    };

    const result = removeCertsAndTlsOptionsForPassthrough(listener);

    expect(result).toEqual(listener);
  });
});
