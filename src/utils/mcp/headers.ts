// MCP 2026-07-28 Streamable HTTP mirrors selected body fields into headers.
// https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
export interface MCPParameterHeader {
  name: string;
  path: string[];
  type: 'string' | 'integer' | 'boolean';
}

export function encodeMCPHeader(value: string): string {
  if (
    /^[\t\x20-\x7e]*$/.test(value) &&
    value.trim() === value &&
    !(value.startsWith('=?base64?') && value.endsWith('?='))
  ) {
    return value;
  }
  const bytes = new TextEncoder().encode(value);
  return `=?base64?${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))}?=`;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

// Only a chain of properties is eligible. Still inspect other subschemas so
// invalid annotations exclude the tool rather than silently dropping headers.
export function parameterHeaderBindings(schema: unknown): MCPParameterHeader[] {
  const bindings: MCPParameterHeader[] = [];
  const names = new Set<string>();
  const visit = (node: unknown, path: string[], eligible: boolean, depth: number) => {
    if (!isObject(node)) return;
    if (depth > 64) throw new Error('Tool schema exceeds the supported nesting depth');
    if (Object.prototype.hasOwnProperty.call(node, 'x-mcp-header')) {
      const name = node['x-mcp-header'];
      const type = node.type;
      if (
        !eligible ||
        path.length === 0 ||
        typeof name !== 'string' ||
        !/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name) ||
        names.has(name.toLowerCase()) ||
        (type !== 'string' && type !== 'integer' && type !== 'boolean')
      ) {
        throw new Error('Invalid or duplicate x-mcp-header annotation');
      }
      names.add(name.toLowerCase());
      bindings.push({ name: `Mcp-Param-${name}`, path, type });
    }
    if (isObject(node.properties)) {
      Object.entries(node.properties).forEach(([key, child]) =>
        visit(child, [...path, key], eligible, depth + 1),
      );
    }
    for (const key of ['patternProperties', '$defs', 'definitions', 'dependentSchemas']) {
      const children = node[key];
      if (isObject(children)) {
        Object.values(children).forEach((child) => visit(child, path, false, depth + 1));
      }
    }
    for (const key of [
      'items',
      'prefixItems',
      'contains',
      'additionalProperties',
      'unevaluatedProperties',
      'unevaluatedItems',
      'propertyNames',
      'not',
      'if',
      'then',
      'else',
      'oneOf',
      'anyOf',
      'allOf',
    ]) {
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach((item) => visit(item, path, false, depth + 1));
      } else {
        visit(child, path, false, depth + 1);
      }
    }
  };
  visit(schema, [], true, 0);
  return bindings;
}

export function parameterHeaders(
  bindings: MCPParameterHeader[],
  args: Record<string, unknown>,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const binding of bindings) {
    let value: unknown = args;
    for (const key of binding.path) {
      value =
        isObject(value) && Object.prototype.hasOwnProperty.call(value, key)
          ? value[key]
          : undefined;
    }
    if (value === undefined || value === null) continue;
    if (
      (binding.type === 'integer' && !Number.isSafeInteger(value)) ||
      (binding.type !== 'integer' && typeof value !== binding.type)
    ) {
      throw new Error(`Invalid value for ${binding.path.join('.')}: expected ${binding.type}`);
    }
    headers[binding.name] = encodeMCPHeader(String(value));
  }
  return headers;
}
