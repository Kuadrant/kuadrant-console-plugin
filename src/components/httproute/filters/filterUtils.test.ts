import {
  createDefaultFilter,
  generateFiltersForYAML,
  parseFiltersFromYAML,
  getFilterSummary,
  isFilterConfigValid,
  validateFiltersStep,
} from './filterUtils';
import type { HTTPRouteFilter } from './filterTypes';

// ── createDefaultFilter ──────────────────────────────────────────────────────

describe('createDefaultFilter', () => {
  it('creates a default RequestHeaderModifier filter', () => {
    const filter = createDefaultFilter('RequestHeaderModifier');
    expect(filter).toEqual({
      type: 'RequestHeaderModifier',
      requestHeaderModifier: {},
    });
  });

  it('creates a default ResponseHeaderModifier filter', () => {
    const filter = createDefaultFilter('ResponseHeaderModifier');
    expect(filter).toEqual({
      type: 'ResponseHeaderModifier',
      responseHeaderModifier: {},
    });
  });

  it('creates a default URLRewrite filter', () => {
    const filter = createDefaultFilter('URLRewrite');
    expect(filter).toEqual({
      type: 'URLRewrite',
      urlRewrite: {},
    });
  });

  it('creates a default RequestRedirect filter with scheme and statusCode', () => {
    const filter = createDefaultFilter('RequestRedirect');
    expect(filter).toEqual({
      type: 'RequestRedirect',
      requestRedirect: { scheme: 'https', statusCode: 301 },
    });
  });

  it('creates a default RequestMirror filter with empty backendRef name', () => {
    const filter = createDefaultFilter('RequestMirror');
    expect(filter).toEqual({
      type: 'RequestMirror',
      requestMirror: { backendRef: { name: '' } },
    });
  });
});

// ── generateFiltersForYAML ───────────────────────────────────────────────────

describe('generateFiltersForYAML', () => {
  it('returns an empty array when filters is an empty array', () => {
    expect(generateFiltersForYAML([])).toEqual([]);
  });

  it('serializes a RequestHeaderModifier with add/set/remove', () => {
    const filters: HTTPRouteFilter[] = [
      {
        type: 'RequestHeaderModifier',
        requestHeaderModifier: {
          add: [{ id: 'a1', name: 'X-Add', value: 'val1' }],
          set: [{ id: 's1', name: 'X-Set', value: 'val2' }],
          remove: ['X-Remove'],
        },
      },
    ];

    const result = generateFiltersForYAML(filters);

    expect(result).toEqual([
      {
        type: 'RequestHeaderModifier',
        requestHeaderModifier: {
          add: [{ name: 'X-Add', value: 'val1' }],
          set: [{ name: 'X-Set', value: 'val2' }],
          remove: ['X-Remove'],
        },
      },
    ]);
  });

  it('serializes a ResponseHeaderModifier with add/set/remove', () => {
    const filters: HTTPRouteFilter[] = [
      {
        type: 'ResponseHeaderModifier',
        responseHeaderModifier: {
          add: [{ id: 'a1', name: 'X-Response', value: 'rval' }],
          set: [],
          remove: ['X-Resp-Remove'],
        },
      },
    ];

    const result = generateFiltersForYAML(filters);

    expect(result).toEqual([
      {
        type: 'ResponseHeaderModifier',
        responseHeaderModifier: {
          add: [{ name: 'X-Response', value: 'rval' }],
          remove: ['X-Resp-Remove'],
        },
      },
    ]);
  });

  it('serializes a RequestRedirect with all fields', () => {
    const filters: HTTPRouteFilter[] = [
      {
        type: 'RequestRedirect',
        requestRedirect: {
          scheme: 'https',
          hostname: 'example.com',
          port: 8443,
          statusCode: 302,
          path: {
            type: 'ReplaceFullPath',
            replaceFullPath: '/new',
          },
        },
      },
    ];

    const result = generateFiltersForYAML(filters);

    expect(result).toEqual([
      {
        type: 'RequestRedirect',
        requestRedirect: {
          scheme: 'https',
          hostname: 'example.com',
          port: 8443,
          statusCode: 302,
          path: {
            type: 'ReplaceFullPath',
            replaceFullPath: '/new',
          },
        },
      },
    ]);
  });

  it('serializes a URLRewrite with hostname and path', () => {
    const filters: HTTPRouteFilter[] = [
      {
        type: 'URLRewrite',
        urlRewrite: {
          hostname: 'rewritten.com',
          path: {
            type: 'ReplacePrefixMatch',
            replacePrefixMatch: '/api',
          },
        },
      },
    ];

    const result = generateFiltersForYAML(filters);

    expect(result).toEqual([
      {
        type: 'URLRewrite',
        urlRewrite: {
          hostname: 'rewritten.com',
          path: {
            type: 'ReplacePrefixMatch',
            replacePrefixMatch: '/api',
          },
        },
      },
    ]);
  });

  it('serializes a RequestMirror with backendRef name and port', () => {
    const filters: HTTPRouteFilter[] = [
      {
        type: 'RequestMirror',
        requestMirror: {
          backendRef: { name: 'mirror-svc', port: 9000 },
        },
      },
    ];

    const result = generateFiltersForYAML(filters);

    expect(result).toEqual([
      {
        type: 'RequestMirror',
        requestMirror: {
          backendRef: { name: 'mirror-svc', port: 9000 },
        },
      },
    ]);
  });

  it('strips empty/whitespace-only header values from add/set/remove', () => {
    const filters: HTTPRouteFilter[] = [
      {
        type: 'RequestHeaderModifier',
        requestHeaderModifier: {
          add: [
            { name: 'Valid', value: 'ok' },
            { name: '', value: 'empty-name' },
            { name: 'Empty-Val', value: '  ' },
          ],
        },
      },
    ];

    const result = generateFiltersForYAML(filters);

    expect(result).toEqual([
      {
        type: 'RequestHeaderModifier',
        requestHeaderModifier: {
          add: [{ name: 'Valid', value: 'ok' }],
        },
      },
    ]);
  });

  it('omits filter when RequestHeaderModifier has no valid data', () => {
    const filters: HTTPRouteFilter[] = [
      {
        type: 'RequestHeaderModifier',
        requestHeaderModifier: {},
      },
    ];

    const result = generateFiltersForYAML(filters);

    expect(result).toEqual([]);
  });
});

// ── parseFiltersFromYAML ─────────────────────────────────────────────────────

describe('parseFiltersFromYAML', () => {
  it('returns an empty array when filters is undefined', () => {
    expect(parseFiltersFromYAML(undefined)).toEqual([]);
  });

  it('returns an empty array when filters is an empty array', () => {
    expect(parseFiltersFromYAML([])).toEqual([]);
  });

  it('parses a RequestHeaderModifier and adds IDs to header arrays', () => {
    const yamlFilters: HTTPRouteFilter[] = [
      {
        type: 'RequestHeaderModifier',
        requestHeaderModifier: {
          add: [{ name: 'X-Add', value: 'val1' }],
          set: [{ name: 'X-Set', value: 'val2' }],
          remove: ['X-Remove'],
        },
      },
    ];

    const result = parseFiltersFromYAML(yamlFilters);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('RequestHeaderModifier');
    if (result[0].type === 'RequestHeaderModifier') {
      expect(result[0].requestHeaderModifier?.add).toHaveLength(1);
      expect(result[0].requestHeaderModifier?.add?.[0].name).toBe('X-Add');
      expect(result[0].requestHeaderModifier?.add?.[0].id).toBeDefined();
      expect(result[0].requestHeaderModifier?.remove).toEqual(['X-Remove']);
    }
  });

  it('parses a ResponseHeaderModifier and adds IDs to header arrays', () => {
    const yamlFilters: HTTPRouteFilter[] = [
      {
        type: 'ResponseHeaderModifier',
        responseHeaderModifier: {
          add: [{ name: 'X-Response', value: 'rval' }],
          remove: ['X-Resp-Remove'],
        },
      },
    ];

    const result = parseFiltersFromYAML(yamlFilters);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('ResponseHeaderModifier');
    if (result[0].type === 'ResponseHeaderModifier') {
      expect(result[0].responseHeaderModifier?.add).toHaveLength(1);
      expect(result[0].responseHeaderModifier?.add?.[0].id).toBeDefined();
    }
  });

  it('parses a RequestRedirect with all fields', () => {
    const yamlFilters: HTTPRouteFilter[] = [
      {
        type: 'RequestRedirect',
        requestRedirect: {
          scheme: 'https',
          hostname: 'example.com',
          port: 8443,
          statusCode: 302,
          path: {
            type: 'ReplaceFullPath',
            replaceFullPath: '/new',
          },
        },
      },
    ];

    const result = parseFiltersFromYAML(yamlFilters);

    expect(result).toEqual([
      {
        type: 'RequestRedirect',
        requestRedirect: {
          scheme: 'https',
          hostname: 'example.com',
          port: 8443,
          statusCode: 302,
          path: {
            type: 'ReplaceFullPath',
            replaceFullPath: '/new',
          },
        },
      },
    ]);
  });

  it('parses a URLRewrite with hostname and path', () => {
    const yamlFilters: HTTPRouteFilter[] = [
      {
        type: 'URLRewrite',
        urlRewrite: {
          hostname: 'rewritten.com',
          path: {
            type: 'ReplacePrefixMatch',
            replacePrefixMatch: '/api',
          },
        },
      },
    ];

    const result = parseFiltersFromYAML(yamlFilters);

    expect(result).toEqual([
      {
        type: 'URLRewrite',
        urlRewrite: {
          hostname: 'rewritten.com',
          path: {
            type: 'ReplacePrefixMatch',
            replacePrefixMatch: '/api',
          },
        },
      },
    ]);
  });

  it('parses a RequestMirror with backendRef', () => {
    const yamlFilters: HTTPRouteFilter[] = [
      {
        type: 'RequestMirror',
        requestMirror: {
          backendRef: { name: 'mirror-svc', port: 9000 },
        },
      },
    ];

    const result = parseFiltersFromYAML(yamlFilters);

    expect(result).toEqual([
      {
        type: 'RequestMirror',
        requestMirror: {
          backendRef: { name: 'mirror-svc', port: 9000 },
        },
      },
    ]);
  });

  it('handles missing optional fields in RequestRedirect', () => {
    const yamlFilters: HTTPRouteFilter[] = [
      {
        type: 'RequestRedirect',
        requestRedirect: {},
      },
    ];

    const result = parseFiltersFromYAML(yamlFilters);

    expect(result).toEqual([
      {
        type: 'RequestRedirect',
        requestRedirect: {},
      },
    ]);
  });
});

// ── getFilterSummary ─────────────────────────────────────────────────────────

describe('getFilterSummary', () => {
  it('returns empty string when filter is null', () => {
    expect(getFilterSummary(null as unknown as HTTPRouteFilter)).toBe('');
  });

  it('returns summary for RequestHeaderModifier with add/set/remove counts', () => {
    const filter: HTTPRouteFilter = {
      type: 'RequestHeaderModifier',
      requestHeaderModifier: {
        add: [{ name: 'X-Add', value: 'val1' }],
        set: [{ name: 'X-Set', value: 'val2' }],
        remove: ['X-Remove'],
      },
    };

    const summary = getFilterSummary(filter);

    expect(summary).toBe('RequestHeaderModifier — add:1 | set:1 | remove:1');
  });

  it('returns summary for ResponseHeaderModifier with add count only', () => {
    const filter: HTTPRouteFilter = {
      type: 'ResponseHeaderModifier',
      responseHeaderModifier: {
        add: [{ name: 'X-Response', value: 'rval' }],
      },
    };

    const summary = getFilterSummary(filter);

    expect(summary).toBe('ResponseHeaderModifier — add:1');
  });

  it('returns summary for URLRewrite with hostname and path', () => {
    const filter: HTTPRouteFilter = {
      type: 'URLRewrite',
      urlRewrite: {
        hostname: 'rewritten.com',
        path: {
          type: 'ReplaceFullPath',
          replaceFullPath: '/new',
        },
      },
    };

    const summary = getFilterSummary(filter);

    expect(summary).toBe('URLRewrite — host → rewritten.com | ReplaceFullPath → /new');
  });

  it('returns summary for RequestRedirect with scheme, hostname, port, statusCode', () => {
    const filter: HTTPRouteFilter = {
      type: 'RequestRedirect',
      requestRedirect: {
        scheme: 'https',
        hostname: 'example.com',
        port: 8443,
        statusCode: 302,
      },
    };

    const summary = getFilterSummary(filter);

    expect(summary).toBe('RequestRedirect — https | example.com | 8443 | 302');
  });

  it('returns summary for RequestMirror with backendRef name and port', () => {
    const filter: HTTPRouteFilter = {
      type: 'RequestMirror',
      requestMirror: {
        backendRef: { name: 'mirror-svc', port: 9000 },
      },
    };

    const summary = getFilterSummary(filter);

    expect(summary).toBe('RequestMirror — mirror-svc | 9000');
  });

  it('returns type only when RequestHeaderModifier has no data', () => {
    const filter: HTTPRouteFilter = {
      type: 'RequestHeaderModifier',
      requestHeaderModifier: {},
    };

    const summary = getFilterSummary(filter);

    expect(summary).toBe('RequestHeaderModifier');
  });
});

// ── isFilterConfigValid ──────────────────────────────────────────────────────

describe('isFilterConfigValid', () => {
  it('returns true for RequestHeaderModifier with add items', () => {
    const filter: HTTPRouteFilter = {
      type: 'RequestHeaderModifier',
      requestHeaderModifier: {
        add: [{ name: 'X-Add', value: 'val1' }],
      },
    };

    expect(isFilterConfigValid(filter)).toBe(true);
  });

  it('returns true for RequestHeaderModifier with set items', () => {
    const filter: HTTPRouteFilter = {
      type: 'RequestHeaderModifier',
      requestHeaderModifier: {
        set: [{ name: 'X-Set', value: 'val2' }],
      },
    };

    expect(isFilterConfigValid(filter)).toBe(true);
  });

  it('returns true for RequestHeaderModifier with remove items', () => {
    const filter: HTTPRouteFilter = {
      type: 'RequestHeaderModifier',
      requestHeaderModifier: {
        remove: ['X-Remove'],
      },
    };

    expect(isFilterConfigValid(filter)).toBe(true);
  });

  it('returns false for RequestHeaderModifier with no data', () => {
    const filter: HTTPRouteFilter = {
      type: 'RequestHeaderModifier',
      requestHeaderModifier: {},
    };

    expect(isFilterConfigValid(filter)).toBe(false);
  });

  it('returns true for ResponseHeaderModifier with remove items', () => {
    const filter: HTTPRouteFilter = {
      type: 'ResponseHeaderModifier',
      responseHeaderModifier: {
        remove: ['X-Response'],
      },
    };

    expect(isFilterConfigValid(filter)).toBe(true);
  });

  it('returns false for ResponseHeaderModifier with no data', () => {
    const filter: HTTPRouteFilter = {
      type: 'ResponseHeaderModifier',
      responseHeaderModifier: {},
    };

    expect(isFilterConfigValid(filter)).toBe(false);
  });

  it('returns true for RequestRedirect with scheme only', () => {
    const filter: HTTPRouteFilter = {
      type: 'RequestRedirect',
      requestRedirect: {
        scheme: 'https',
      },
    };

    expect(isFilterConfigValid(filter)).toBe(true);
  });

  it('returns true for RequestRedirect with hostname only', () => {
    const filter: HTTPRouteFilter = {
      type: 'RequestRedirect',
      requestRedirect: {
        hostname: 'example.com',
      },
    };

    expect(isFilterConfigValid(filter)).toBe(true);
  });

  it('returns true for RequestRedirect with path', () => {
    const filter: HTTPRouteFilter = {
      type: 'RequestRedirect',
      requestRedirect: {
        path: {
          type: 'ReplaceFullPath',
          replaceFullPath: '/new',
        },
      },
    };

    expect(isFilterConfigValid(filter)).toBe(true);
  });

  it('returns false for RequestRedirect with no data', () => {
    const filter: HTTPRouteFilter = {
      type: 'RequestRedirect',
      requestRedirect: {},
    };

    expect(isFilterConfigValid(filter)).toBe(false);
  });

  it('returns true for URLRewrite with hostname', () => {
    const filter: HTTPRouteFilter = {
      type: 'URLRewrite',
      urlRewrite: {
        hostname: 'rewritten.com',
      },
    };

    expect(isFilterConfigValid(filter)).toBe(true);
  });

  it('returns true for URLRewrite with path', () => {
    const filter: HTTPRouteFilter = {
      type: 'URLRewrite',
      urlRewrite: {
        path: {
          type: 'ReplacePrefixMatch',
          replacePrefixMatch: '/api',
        },
      },
    };

    expect(isFilterConfigValid(filter)).toBe(true);
  });

  it('returns false for URLRewrite with no data', () => {
    const filter: HTTPRouteFilter = {
      type: 'URLRewrite',
      urlRewrite: {},
    };

    expect(isFilterConfigValid(filter)).toBe(false);
  });

  it('returns true for RequestMirror with valid backendRef name', () => {
    const filter: HTTPRouteFilter = {
      type: 'RequestMirror',
      requestMirror: {
        backendRef: { name: 'mirror-svc' },
      },
    };

    expect(isFilterConfigValid(filter)).toBe(true);
  });

  it('returns false for RequestMirror with empty backendRef name', () => {
    const filter: HTTPRouteFilter = {
      type: 'RequestMirror',
      requestMirror: {
        backendRef: { name: '' },
      },
    };

    expect(isFilterConfigValid(filter)).toBe(false);
  });

  it('returns false for RequestMirror with whitespace-only backendRef name', () => {
    const filter: HTTPRouteFilter = {
      type: 'RequestMirror',
      requestMirror: {
        backendRef: { name: '   ' },
      },
    };

    expect(isFilterConfigValid(filter)).toBe(false);
  });
});

// ── validateFiltersStep ──────────────────────────────────────────────────────

describe('validateFiltersStep', () => {
  it('returns true when filters array is empty', () => {
    expect(validateFiltersStep([])).toBe(true);
  });

  it('returns true when all filters are valid', () => {
    const filters: HTTPRouteFilter[] = [
      {
        type: 'RequestHeaderModifier',
        requestHeaderModifier: {
          add: [{ name: 'X-Add', value: 'val1' }],
        },
      },
      {
        type: 'RequestMirror',
        requestMirror: {
          backendRef: { name: 'mirror-svc' },
        },
      },
    ];

    expect(validateFiltersStep(filters)).toBe(true);
  });

  it('returns false when any filter is invalid', () => {
    const filters: HTTPRouteFilter[] = [
      {
        type: 'RequestHeaderModifier',
        requestHeaderModifier: {
          add: [{ name: 'X-Add', value: 'val1' }],
        },
      },
      {
        type: 'RequestMirror',
        requestMirror: {
          backendRef: { name: '' },
        },
      },
    ];

    expect(validateFiltersStep(filters)).toBe(false);
  });
});
