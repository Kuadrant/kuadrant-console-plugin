import { MCPClient } from './client';

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
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns request, response, HTTP status and duration for a tool call', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: { content: [{ type: 'text', text: 'Hello, Ada!' }] },
      }),
    );
    jest.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(145);
    const client = new MCPClient('https://mcp.example.test/mcp', { token: 'test-token' });

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
    expect(global.fetch).toHaveBeenCalledWith(
      'https://mcp.example.test/mcp',
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'MCP-Protocol-Version': '2025-11-25',
        }),
      }),
    );
  });
});
