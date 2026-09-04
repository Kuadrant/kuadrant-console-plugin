import { toolServerNameResolver } from './serverNames';
import { MCPServerRegistration } from '../../components/mcp/types';

const registration = (name: string, prefix?: string): MCPServerRegistration => ({
  apiVersion: 'mcp.kuadrant.io/v1',
  kind: 'MCPServerRegistration',
  metadata: { name, namespace: 'toystore' },
  spec: { targetRef: { name: `${name}-route` }, prefix },
});

describe('toolServerNameResolver', () => {
  it('maps a tool to the registration owning its prefix', () => {
    const resolve = toolServerNameResolver([registration('toystore-mcp-server', 'toystore_')]);

    expect(resolve('toystore_greet')).toBe('toystore-mcp-server');
    expect(resolve('weather_lookup')).toBeUndefined();
  });

  it('prefers the longest matching prefix', () => {
    const resolve = toolServerNameResolver([
      registration('toy-server', 'toy_'),
      registration('toystore-server', 'toystore_'),
    ]);

    expect(resolve('toystore_greet')).toBe('toystore-server');
    expect(resolve('toy_box')).toBe('toy-server');
  });

  it('ignores registrations without a prefix and missing lists', () => {
    expect(toolServerNameResolver([registration('bare')])('bare_tool')).toBeUndefined();
    expect(toolServerNameResolver(undefined)('toystore_greet')).toBeUndefined();
    expect(toolServerNameResolver(null)('toystore_greet')).toBeUndefined();
  });
});
