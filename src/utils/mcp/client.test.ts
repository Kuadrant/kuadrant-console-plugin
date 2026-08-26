import { MCPClient } from './client';
import { consoleFetch } from '@openshift-console/dynamic-plugin-sdk';

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  consoleFetch: jest.fn(),
  HttpError: class HttpError extends Error {},
}));

const jsonResponse = (body: unknown, status = 200, statusText = 'OK') =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response);

describe('MCPClient', () => {
  beforeEach(() => {
    (consoleFetch as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns request, response, HTTP status and duration for a tool call', async () => {
    (consoleFetch as jest.Mock).mockResolvedValue(
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: { content: [{ type: 'text', text: 'Hello, Ada!' }] },
      }),
    );
    jest.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(145);
    const client = new MCPClient(
      '/api/proxy/plugin/kuadrant-console-plugin/backend/api/mcp/v1/mcpgatewayextensions/test-ns/test',
      { token: 'test-token' },
    );

    const exchange = await client.toolsCallWithDetails(
      'toystore_greet',
      { name: 'Ada' },
      { traceId: 'trace-1' },
    );

    expect(exchange).toEqual({
      result: { content: [{ type: 'text', text: 'Hello, Ada!' }] },
      request: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'toystore_greet',
          arguments: { name: 'Ada' },
          _meta: { traceId: 'trace-1' },
        },
      },
      response: {
        jsonrpc: '2.0',
        id: 1,
        result: { content: [{ type: 'text', text: 'Hello, Ada!' }] },
      },
      status: 200,
      statusText: 'OK',
      durationMs: 45,
    });
    expect(consoleFetch).toHaveBeenCalledWith(
      '/api/proxy/plugin/kuadrant-console-plugin/backend/api/mcp/v1/mcpgatewayextensions/test-ns/test',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: expect.objectContaining({
          'X-Kuadrant-MCP-Authorization': 'Bearer test-token',
          'MCP-Protocol-Version': '2025-11-25',
        }),
      }),
    );
  });
});
