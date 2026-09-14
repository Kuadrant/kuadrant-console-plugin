import { MCPClient, MCPRpcError, MCPSessionExpiredError, MCPUnauthorizedError } from './client';
import { consoleFetch, HttpError } from '@openshift-console/dynamic-plugin-sdk';

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  consoleFetch: jest.fn(),
  HttpError: class HttpError extends Error {},
}));

const jsonResponse = (body: unknown, status = 200, statusText = 'OK', sessionId?: string) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type'
          ? 'application/json'
          : name.toLowerCase() === 'mcp-session-id'
          ? sessionId ?? null
          : null,
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
  const sent = () =>
    (consoleFetch as jest.Mock).mock.calls.map(([, init]) => ({
      body: JSON.parse(init.body),
      headers: init.headers,
    }));
  const discovery = (versions = ['2026-07-28', '2025-11-25']) =>
    jsonResponse({
      jsonrpc: '2.0',
      id: 1,
      result: { supportedVersions: versions, capabilities: { tools: {} } },
    });
  beforeEach(() => {
    (consoleFetch as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(['json', 'sse'])(
    'connects to a modern gateway over %s without initializing or sending a session',
    async (format) => {
      const listed = { jsonrpc: '2.0', id: 2, result: { resultType: 'complete', tools: [] } };
      (consoleFetch as jest.Mock)
        .mockResolvedValueOnce(discovery())
        .mockResolvedValueOnce(format === 'sse' ? sseResponse([listed]) : jsonResponse(listed));
      const client = new MCPClient('/backend');
      expect(await client.connect()).toEqual({ protocolVersion: '2026-07-28', sessionId: null });
      await client.toolsList();
      expect(sent().map(({ body }) => body.method)).toEqual(['server/discover', 'tools/list']);
      for (const { body, headers } of sent()) {
        expect(body.params._meta).toMatchObject({
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientCapabilities': {},
        });
        expect(headers['MCP-Protocol-Version']).toBe('2026-07-28');
        expect(headers['Mcp-Method']).toBe(body.method);
        expect(headers['Mcp-Session-Id']).toBeUndefined();
      }
    },
  );

  it.each([undefined, 'session-legacy'])(
    'falls back to a legacy handshake (session %s)',
    async (sessionId) => {
      (consoleFetch as jest.Mock)
        .mockResolvedValueOnce(
          jsonResponse(
            { jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'Initialize first' } },
            400,
          ),
        )
        .mockResolvedValueOnce(
          jsonResponse(
            { jsonrpc: '2.0', id: 2, result: { protocolVersion: '2025-11-25' } },
            200,
            'OK',
            sessionId,
          ),
        )
        .mockResolvedValueOnce(jsonResponse(undefined, 202))
        .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 3, result: { tools: [] } }));
      const client = new MCPClient('/backend');
      expect(await client.connect()).toEqual({
        protocolVersion: '2025-11-25',
        sessionId: sessionId ?? null,
      });
      await client.toolsList();
      expect(sent().map(({ body }) => body.method)).toEqual([
        'server/discover',
        'initialize',
        'notifications/initialized',
        'tools/list',
      ]);
      const last = sent()[3];
      expect(last.headers['MCP-Protocol-Version']).toBe('2025-11-25');
      expect(last.headers['Mcp-Session-Id']).toBe(sessionId);
      expect(last.headers['Mcp-Method']).toBeUndefined();
      expect(last.body.params._meta).toBeUndefined();
    },
  );

  it.each(['discovery', 'version-error'])(
    'uses an advertised legacy version from %s',
    async (source) => {
      (consoleFetch as jest.Mock)
        .mockResolvedValueOnce(
          source === 'discovery'
            ? discovery(['2025-11-25'])
            : jsonResponse(
                {
                  jsonrpc: '2.0',
                  id: 1,
                  error: {
                    code: -32022,
                    message: 'Unsupported protocol version',
                    data: { supported: ['2025-11-25'] },
                  },
                },
                400,
              ),
        )
        .mockResolvedValueOnce(
          jsonResponse({ jsonrpc: '2.0', id: 2, result: { protocolVersion: '2025-11-25' } }),
        )
        .mockResolvedValueOnce(jsonResponse(undefined, 202));
      expect((await new MCPClient('/backend').connect()).protocolVersion).toBe('2025-11-25');
    },
  );

  it('pins legacy without probing and rejects an unsupported initialize version', async () => {
    (consoleFetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: { protocolVersion: '2024-11-05' },
      }),
    );
    await expect(
      new MCPClient('/backend', { protocolMode: '2025-11-25' }).connect(),
    ).rejects.toThrow('Unsupported MCP protocol version: 2024-11-05');
    expect(sent().map(({ body }) => body.method)).toEqual(['initialize']);
  });

  it('does not downgrade a pinned modern client', async () => {
    (consoleFetch as jest.Mock).mockResolvedValueOnce(discovery(['2025-11-25']));
    await expect(
      new MCPClient('/backend', { protocolMode: '2026-07-28' }).connect(),
    ).rejects.toThrow('No compatible MCP protocol version');
    expect(consoleFetch).toHaveBeenCalledTimes(1);
  });

  it.each([-32020, -32021, -32022])(
    'preserves modern error %s without blindly downgrading',
    async (code) => {
      (consoleFetch as jest.Mock).mockResolvedValueOnce(
        jsonResponse(
          {
            jsonrpc: '2.0',
            error: { code, message: 'Modern protocol error', data: { supported: ['2099-01-01'] } },
          },
          400,
        ),
      );
      await expect(new MCPClient('/backend').connect()).rejects.toThrow();
      expect(consoleFetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([401, 403, 500])('does not downgrade HTTP %s', async (status) => {
    (consoleFetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, status));
    const connecting = new MCPClient('/backend').connect();
    if (status === 401) await expect(connecting).rejects.toBeInstanceOf(MCPUnauthorizedError);
    else await expect(connecting).rejects.toMatchObject({ status });
    expect(consoleFetch).toHaveBeenCalledTimes(1);
  });

  it('preserves an HTTP JSON-RPC method error for unsupported prompts', async () => {
    const response = jsonResponse(
      { jsonrpc: '2.0', id: 2, error: { code: -32601, message: 'No prompts' } },
      404,
    );
    (consoleFetch as jest.Mock)
      .mockResolvedValueOnce(discovery())
      .mockRejectedValueOnce(Object.assign(new HttpError('HTTP error'), { response }));
    const client = new MCPClient('/backend');
    await client.connect();
    await expect(client.promptsList()).rejects.toMatchObject({ code: -32601, status: 404 });
  });

  it.each([undefined, 'expired'])(
    'only classifies a legacy 404 as expired when a session exists (%s)',
    async (sessionId) => {
      (consoleFetch as jest.Mock)
        .mockResolvedValueOnce(
          jsonResponse(
            { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-11-25' } },
            200,
            'OK',
            sessionId,
          ),
        )
        .mockResolvedValueOnce(jsonResponse(undefined, 202))
        .mockResolvedValueOnce(
          jsonResponse({ jsonrpc: '2.0', id: 2, error: { code: -32601, message: 'Missing' } }, 404),
        );
      const client = new MCPClient('/backend', { protocolMode: '2025-11-25' });
      await client.connect();
      await expect(client.toolsList()).rejects.toBeInstanceOf(
        sessionId ? MCPSessionExpiredError : MCPRpcError,
      );
    },
  );

  it('mirrors tool parameters and names while protecting protocol metadata', async () => {
    (consoleFetch as jest.Mock)
      .mockResolvedValueOnce(discovery())
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: '2.0',
          id: 2,
          result: {
            tools: [
              {
                name: 'greet',
                inputSchema: {
                  type: 'object',
                  properties: {
                    tenant: { type: 'string', 'x-mcp-header': 'Tenant' },
                  },
                },
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: '2.0',
          id: 3,
          result: { resultType: 'input_required', requestState: 'opaque' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 4, result: { messages: [] } }));
    const client = new MCPClient('/backend');
    await client.connect();
    await client.toolsList();
    const exchange = await client.toolsCallWithDetails(
      'greet',
      { tenant: ' padded ' },
      {
        traceId: 'trace-1',
        'io.modelcontextprotocol/protocolVersion': 'wrong',
        'io.modelcontextprotocol/clientCapabilities': { sampling: {} },
      },
    );
    expect(exchange.result.resultType).toBe('input_required');
    expect(exchange.request).toEqual(sent()[2].body);
    expect(sent()[2].headers).toMatchObject({
      'Mcp-Method': 'tools/call',
      'Mcp-Name': 'greet',
      'Mcp-Param-Tenant': '=?base64?IHBhZGRlZCA=?=',
    });
    expect(sent()[2].body.params._meta).toMatchObject({
      traceId: 'trace-1',
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientCapabilities': {},
    });
    await client.promptsGetWithDetails('世界', {});
    expect(sent()[3].headers['Mcp-Name']).toBe('=?base64?5LiW55WM?=');
  });

  it('excludes invalid header schemas without losing valid tools', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (consoleFetch as jest.Mock).mockResolvedValueOnce(discovery()).mockResolvedValueOnce(
      jsonResponse({
        jsonrpc: '2.0',
        id: 2,
        result: {
          tools: [
            { name: 'valid', inputSchema: { type: 'object' } },
            {
              name: 'invalid',
              inputSchema: {
                type: 'object',
                properties: { x: { type: 'number', 'x-mcp-header': 'X' } },
              },
            },
          ],
        },
      }),
    );
    const client = new MCPClient('/backend');
    await client.connect();
    expect((await client.toolsList()).tools.map((tool) => tool.name)).toEqual(['valid']);
    await expect(client.toolsCallWithDetails('invalid', { x: 1 })).rejects.toThrow(
      'Invalid MCP tool header schema',
    );
    expect(consoleFetch).toHaveBeenCalledTimes(2);
  });

  it('rejects unknown result types rather than reporting success', async () => {
    (consoleFetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: { resultType: 'future-extension' },
      }),
    );
    await expect(new MCPClient('/backend').toolsCallWithDetails('greet', {})).rejects.toThrow(
      'Unsupported MCP result type',
    );
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
