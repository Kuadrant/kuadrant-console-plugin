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

const sseResponse = (events: unknown[], status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/event-stream' : null),
    },
    text: jest
      .fn()
      .mockResolvedValue(
        events.map((event) => `event: message\ndata: ${JSON.stringify(event)}\n\n`).join(''),
      ),
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
  it('lists prompts and gets a prompt with its arguments', async () => {
    (consoleFetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: '2.0',
          id: 1,
          result: {
            prompts: [{ name: 'toystore_greet', arguments: [{ name: 'name', required: true }] }],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: '2.0',
          id: 2,
          result: {
            messages: [{ role: 'user', content: { type: 'text', text: 'Say hi to Ada' } }],
          },
        }),
      );
    jest.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(120);
    const client = new MCPClient('/backend');

    const listed = await client.promptsList();
    expect(listed.prompts[0].name).toBe('toystore_greet');
    expect(JSON.parse((consoleFetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'prompts/list',
      params: {},
    });

    const exchange = await client.promptsGetWithDetails('toystore_greet', { name: 'Ada' });
    expect(exchange.result.messages?.[0].content.text).toBe('Say hi to Ada');
    expect(exchange.request).toEqual({
      jsonrpc: '2.0',
      id: 2,
      method: 'prompts/get',
      params: { name: 'toystore_greet', arguments: { name: 'Ada' } },
    });
    expect(exchange.durationMs).toBe(20);
  });

  it('follows nextCursor across tool pages', async () => {
    (consoleFetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: '2.0',
          id: 1,
          result: { tools: [{ name: 'a' }], nextCursor: 'page-2' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'b' }] } }),
      );
    const client = new MCPClient('/backend');

    const listed = await client.toolsList();

    expect(listed.tools.map((tool) => tool.name)).toEqual(['a', 'b']);
    expect(listed.nextCursor).toBeUndefined();
    expect(JSON.parse((consoleFetch as jest.Mock).mock.calls[1][1].body).params).toEqual({
      cursor: 'page-2',
    });
  });

  it('skips stream notifications and returns the response to the request', async () => {
    (consoleFetch as jest.Mock).mockResolvedValueOnce(
      sseResponse([
        {
          jsonrpc: '2.0',
          method: 'notifications/message',
          params: { level: 'info', data: 'busy' },
        },
        { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'done' }] } },
      ]),
    );
    const client = new MCPClient('/backend');

    const exchange = await client.toolsCallWithDetails('toystore_greet', { name: 'Ada' });

    expect(exchange.result.content?.[0].text).toBe('done');
  });

  it('rejects a stream that never answers the request', async () => {
    (consoleFetch as jest.Mock).mockResolvedValueOnce(
      sseResponse([
        { jsonrpc: '2.0', method: 'notifications/message', params: {} },
        { jsonrpc: '2.0', id: 99, result: { tools: [] } },
      ]),
    );
    const client = new MCPClient('/backend');

    await expect(client.toolsList()).rejects.toThrow('no json-rpc response for request 1');
  });

  it('rejects a list whose cursor never advances', async () => {
    (consoleFetch as jest.Mock).mockImplementation((_url: string, init: RequestInit) =>
      Promise.resolve(
        jsonResponse({
          jsonrpc: '2.0',
          id: JSON.parse(String(init.body)).id,
          result: { prompts: [], nextCursor: 'same' },
        }),
      ),
    );
    const client = new MCPClient('/backend');

    await expect(client.promptsList()).rejects.toThrow('prompts/list pagination did not terminate');
    expect(consoleFetch).toHaveBeenCalledTimes(2);
  });
});
