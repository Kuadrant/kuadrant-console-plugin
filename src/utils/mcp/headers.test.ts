import { encodeMCPHeader, parameterHeaderBindings, parameterHeaders } from './headers';

describe('MCP routing headers', () => {
  it.each([
    ['us-west1', 'us-west1'],
    ['Hello, 世界', '=?base64?SGVsbG8sIOS4lueVjA==?='],
    [' padded ', '=?base64?IHBhZGRlZCA=?='],
    ['line1\nline2', '=?base64?bGluZTEKbGluZTI=?='],
    ['=?base64?literal?=', '=?base64?PT9iYXNlNjQ/bGl0ZXJhbD89?='],
  ])('encodes %s according to the transport specification', (value, expected) => {
    expect(encodeMCPHeader(value)).toBe(expected);
  });

  it('extracts nested properties, preserves false and zero, and omits null/missing values', () => {
    const bindings = parameterHeaderBindings({
      type: 'object',
      properties: {
        config: {
          type: 'object',
          properties: {
            tenant: { type: 'string', 'x-mcp-header': 'Tenant' },
            enabled: { type: 'boolean', 'x-mcp-header': 'Enabled' },
            count: { type: 'integer', 'x-mcp-header': 'Count' },
            optional: { type: 'string', 'x-mcp-header': 'Optional' },
            missing: { type: 'string', 'x-mcp-header': 'Missing' },
          },
        },
      },
    });
    expect(
      parameterHeaders(bindings, {
        config: { tenant: 'test', enabled: false, count: 0, optional: null },
      }),
    ).toEqual({
      'Mcp-Param-Tenant': 'test',
      'Mcp-Param-Enabled': 'false',
      'Mcp-Param-Count': '0',
    });
    expect(() =>
      parameterHeaders(bindings, { config: { count: Number.MAX_SAFE_INTEGER + 1 } }),
    ).toThrow('expected integer');
    expect(() => parameterHeaders(bindings, { config: { enabled: 'false' } })).toThrow(
      'expected boolean',
    );
  });

  it.each([
    { type: 'string', 'x-mcp-header': 'Root' },
    { properties: { x: { type: 'number', 'x-mcp-header': 'X' } } },
    { properties: { x: { type: 'string', 'x-mcp-header': '' } } },
    { properties: { x: { type: 'string', 'x-mcp-header': 'not valid' } } },
    {
      properties: {
        x: { type: 'string', 'x-mcp-header': 'X' },
        y: { type: 'string', 'x-mcp-header': 'x' },
      },
    },
    { properties: { list: { type: 'array', items: { type: 'string', 'x-mcp-header': 'X' } } } },
    { allOf: [{ properties: { x: { type: 'string', 'x-mcp-header': 'X' } } }] },
    {
      $defs: { item: { type: 'string', 'x-mcp-header': 'X' } },
      properties: { x: { $ref: '#/$defs/item' } },
    },
  ])('rejects invalid annotations: %j', (schema) => {
    expect(() => parameterHeaderBindings(schema)).toThrow('x-mcp-header');
  });

  it('does not interpret example data or a property named x-mcp-header as schema annotations', () => {
    expect(
      parameterHeaderBindings({
        properties: {
          'x-mcp-header': { type: 'string', examples: [{ 'x-mcp-header': 'data' }] },
        },
      }),
    ).toEqual([]);
  });
});
