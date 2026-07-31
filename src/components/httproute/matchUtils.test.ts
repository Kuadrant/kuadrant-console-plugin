import {
  generateMatchesForYAML,
  parseMatchesFromYAML,
  validateMatchesInRule,
  formatMatchesForDisplay,
} from './matchUtils';
import type { HTTPRouteMatch } from './types';

// ── generateMatchesForYAML ───────────────────────────────────────────────────

describe('generateMatchesForYAML', () => {
  it('returns an empty array when matches is an empty array', () => {
    expect(generateMatchesForYAML([])).toEqual([]);
  });

  it('converts a single match with path and method', () => {
    const matches: HTTPRouteMatch[] = [
      {
        id: 'match-1',
        pathType: 'PathPrefix',
        pathValue: '/api',
        method: 'GET',
        headers: [],
        queryParams: [],
      },
    ];

    const result = generateMatchesForYAML(matches);

    expect(result).toEqual([
      {
        path: {
          type: 'PathPrefix',
          value: '/api',
        },
        method: 'GET',
      },
    ]);
  });

  it('omits method when it is empty', () => {
    const matches: HTTPRouteMatch[] = [
      {
        id: 'match-1',
        pathType: 'Exact',
        pathValue: '/users',
        method: '',
        headers: [],
        queryParams: [],
      },
    ];

    const result = generateMatchesForYAML(matches);

    expect(result).toEqual([
      {
        path: {
          type: 'Exact',
          value: '/users',
        },
      },
    ]);
  });

  it('includes headers when present with valid name and value', () => {
    const matches: HTTPRouteMatch[] = [
      {
        id: 'match-1',
        pathType: 'PathPrefix',
        pathValue: '/',
        method: 'GET',
        headers: [
          { id: 'h1', type: 'Exact', name: 'X-Custom', value: 'val1' },
          { id: 'h2', type: 'RegularExpression', name: 'X-Regex', value: '.*' },
        ],
        queryParams: [],
      },
    ];

    const result = generateMatchesForYAML(matches);

    expect(result).toEqual([
      {
        path: {
          type: 'PathPrefix',
          value: '/',
        },
        method: 'GET',
        headers: [
          { type: 'Exact', name: 'X-Custom', value: 'val1' },
          { type: 'RegularExpression', name: 'X-Regex', value: '.*' },
        ],
      },
    ]);
  });

  it('filters out headers with empty name or value', () => {
    const matches: HTTPRouteMatch[] = [
      {
        id: 'match-1',
        pathType: 'PathPrefix',
        pathValue: '/',
        method: 'GET',
        headers: [
          { id: 'h1', type: 'Exact', name: 'Valid', value: 'val' },
          { id: 'h2', type: 'Exact', name: '', value: 'no-name' },
          { id: 'h3', type: 'Exact', name: 'No-Val', value: '  ' },
        ],
        queryParams: [],
      },
    ];

    const result = generateMatchesForYAML(matches);

    expect(result).toEqual([
      {
        path: {
          type: 'PathPrefix',
          value: '/',
        },
        method: 'GET',
        headers: [{ type: 'Exact', name: 'Valid', value: 'val' }],
      },
    ]);
  });

  it('includes queryParams when present with valid name and value', () => {
    const matches: HTTPRouteMatch[] = [
      {
        id: 'match-1',
        pathType: 'PathPrefix',
        pathValue: '/',
        method: 'GET',
        headers: [],
        queryParams: [
          { id: 'q1', type: 'Exact', name: 'user', value: 'alice' },
          { id: 'q2', type: 'RegularExpression', name: 'pattern', value: '[a-z]+' },
        ],
      },
    ];

    const result = generateMatchesForYAML(matches);

    expect(result).toEqual([
      {
        path: {
          type: 'PathPrefix',
          value: '/',
        },
        method: 'GET',
        queryParams: [
          { type: 'Exact', name: 'user', value: 'alice' },
          { type: 'RegularExpression', name: 'pattern', value: '[a-z]+' },
        ],
      },
    ]);
  });

  it('filters out queryParams with empty name or value', () => {
    const matches: HTTPRouteMatch[] = [
      {
        id: 'match-1',
        pathType: 'PathPrefix',
        pathValue: '/',
        method: 'GET',
        headers: [],
        queryParams: [
          { id: 'q1', type: 'Exact', name: 'valid', value: 'val' },
          { id: 'q2', type: 'Exact', name: '', value: 'no-name' },
          { id: 'q3', type: 'Exact', name: 'no-val', value: '' },
        ],
      },
    ];

    const result = generateMatchesForYAML(matches);

    expect(result).toEqual([
      {
        path: {
          type: 'PathPrefix',
          value: '/',
        },
        method: 'GET',
        queryParams: [{ type: 'Exact', name: 'valid', value: 'val' }],
      },
    ]);
  });

  it('converts multiple matches', () => {
    const matches: HTTPRouteMatch[] = [
      {
        id: 'match-1',
        pathType: 'PathPrefix',
        pathValue: '/api',
        method: 'GET',
        headers: [],
        queryParams: [],
      },
      {
        id: 'match-2',
        pathType: 'Exact',
        pathValue: '/users',
        method: 'POST',
        headers: [],
        queryParams: [],
      },
    ];

    const result = generateMatchesForYAML(matches);

    expect(result).toEqual([
      {
        path: {
          type: 'PathPrefix',
          value: '/api',
        },
        method: 'GET',
      },
      {
        path: {
          type: 'Exact',
          value: '/users',
        },
        method: 'POST',
      },
    ]);
  });
});

// ── parseMatchesFromYAML ─────────────────────────────────────────────────────

describe('parseMatchesFromYAML', () => {
  it('returns an empty array when yamlMatches is undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(parseMatchesFromYAML(undefined as any)).toEqual([]);
  });

  it('returns an empty array when yamlMatches is not an array', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(parseMatchesFromYAML({} as any)).toEqual([]);
  });

  it('parses a match with path only', () => {
    const yamlMatches = [
      {
        path: { type: 'PathPrefix', value: '/api' },
      },
    ];

    const result = parseMatchesFromYAML(yamlMatches);

    expect(result).toHaveLength(1);
    expect(result[0].pathType).toBe('PathPrefix');
    expect(result[0].pathValue).toBe('/api');
    expect(result[0].method).toBe('');
    expect(result[0].headers).toEqual([]);
    expect(result[0].queryParams).toEqual([]);
  });

  it('parses a match with method', () => {
    const yamlMatches = [
      {
        path: { type: 'Exact', value: '/users' },
        method: 'POST',
      },
    ];

    const result = parseMatchesFromYAML(yamlMatches);

    expect(result[0].method).toBe('POST');
  });

  it('parses a match with headers', () => {
    const yamlMatches = [
      {
        path: { type: 'PathPrefix', value: '/' },
        headers: [
          { type: 'Exact', name: 'X-Custom', value: 'val1' },
          { type: 'RegularExpression', name: 'X-Regex', value: '.*' },
        ],
      },
    ];

    const result = parseMatchesFromYAML(yamlMatches);

    expect(result[0].headers).toHaveLength(2);
    expect(result[0].headers?.[0].type).toBe('Exact');
    expect(result[0].headers?.[0].name).toBe('X-Custom');
    expect(result[0].headers?.[0].value).toBe('val1');
    expect(result[0].headers?.[0].id).toBeDefined();
  });

  it('parses a match with queryParams', () => {
    const yamlMatches = [
      {
        path: { type: 'PathPrefix', value: '/' },
        queryParams: [
          { type: 'Exact', name: 'user', value: 'alice' },
          { type: 'RegularExpression', name: 'pattern', value: '[a-z]+' },
        ],
      },
    ];

    const result = parseMatchesFromYAML(yamlMatches);

    expect(result[0].queryParams).toHaveLength(2);
    expect(result[0].queryParams?.[0].type).toBe('Exact');
    expect(result[0].queryParams?.[0].name).toBe('user');
    expect(result[0].queryParams?.[0].value).toBe('alice');
    expect(result[0].queryParams?.[0].id).toBeDefined();
  });

  it('provides default values for missing path fields', () => {
    const yamlMatches = [{}];

    const result = parseMatchesFromYAML(yamlMatches);

    expect(result[0].pathType).toBe('PathPrefix');
    expect(result[0].pathValue).toBe('/');
  });

  it('provides default type for headers missing type', () => {
    const yamlMatches = [
      {
        path: { type: 'PathPrefix', value: '/' },
        headers: [{ name: 'X-Custom', value: 'val' }],
      },
    ];

    const result = parseMatchesFromYAML(yamlMatches);

    expect(result[0].headers?.[0].type).toBe('Exact');
  });

  it('provides default type for queryParams missing type', () => {
    const yamlMatches = [
      {
        path: { type: 'PathPrefix', value: '/' },
        queryParams: [{ name: 'user', value: 'alice' }],
      },
    ];

    const result = parseMatchesFromYAML(yamlMatches);

    expect(result[0].queryParams?.[0].type).toBe('Exact');
  });

  it('parses multiple matches', () => {
    const yamlMatches = [
      {
        path: { type: 'PathPrefix', value: '/api' },
      },
      {
        path: { type: 'Exact', value: '/users' },
        method: 'POST',
      },
    ];

    const result = parseMatchesFromYAML(yamlMatches);

    expect(result).toHaveLength(2);
    expect(result[0].pathValue).toBe('/api');
    expect(result[1].pathValue).toBe('/users');
    expect(result[1].method).toBe('POST');
  });
});

// ── validateMatchesInRule ────────────────────────────────────────────────────

describe('validateMatchesInRule', () => {
  it('returns true when matches array is empty', () => {
    expect(validateMatchesInRule([])).toBe(true);
  });

  it('returns true when all matches have pathType, pathValue, and method', () => {
    const matches: HTTPRouteMatch[] = [
      {
        id: 'match-1',
        pathType: 'PathPrefix',
        pathValue: '/api',
        method: 'GET',
        headers: [],
        queryParams: [],
      },
      {
        id: 'match-2',
        pathType: 'Exact',
        pathValue: '/users',
        method: 'POST',
        headers: [],
        queryParams: [],
      },
    ];

    expect(validateMatchesInRule(matches)).toBe(true);
  });

  it('returns false when any match is missing pathType', () => {
    const matches: HTTPRouteMatch[] = [
      {
        id: 'match-1',
        pathType: '',
        pathValue: '/api',
        method: 'GET',
        headers: [],
        queryParams: [],
      },
    ];

    expect(validateMatchesInRule(matches)).toBe(false);
  });

  it('returns false when any match is missing pathValue', () => {
    const matches: HTTPRouteMatch[] = [
      {
        id: 'match-1',
        pathType: 'PathPrefix',
        pathValue: '',
        method: 'GET',
        headers: [],
        queryParams: [],
      },
    ];

    expect(validateMatchesInRule(matches)).toBe(false);
  });

  it('returns true when method is empty (method is optional)', () => {
    const matches: HTTPRouteMatch[] = [
      {
        id: 'match-1',
        pathType: 'PathPrefix',
        pathValue: '/api',
        method: '',
        headers: [],
        queryParams: [],
      },
    ];

    expect(validateMatchesInRule(matches)).toBe(true);
  });
});

// ── formatMatchesForDisplay ──────────────────────────────────────────────────

describe('formatMatchesForDisplay', () => {
  it('returns "—" when matches is undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(formatMatchesForDisplay(undefined as any)).toBe('—');
  });

  it('returns "—" when matches is an empty array', () => {
    expect(formatMatchesForDisplay([])).toBe('—');
  });

  it('formats a single match as "pathType pathValue / method"', () => {
    const matches: HTTPRouteMatch[] = [
      {
        id: 'match-1',
        pathType: 'PathPrefix',
        pathValue: '/api',
        method: 'GET',
        headers: [],
        queryParams: [],
      },
    ];

    expect(formatMatchesForDisplay(matches)).toBe('PathPrefix /api / GET');
  });

  it('formats multiple matches separated by commas', () => {
    const matches: HTTPRouteMatch[] = [
      {
        id: 'match-1',
        pathType: 'PathPrefix',
        pathValue: '/api',
        method: 'GET',
        headers: [],
        queryParams: [],
      },
      {
        id: 'match-2',
        pathType: 'Exact',
        pathValue: '/users',
        method: 'POST',
        headers: [],
        queryParams: [],
      },
    ];

    expect(formatMatchesForDisplay(matches)).toBe('PathPrefix /api / GET, Exact /users / POST');
  });
});
