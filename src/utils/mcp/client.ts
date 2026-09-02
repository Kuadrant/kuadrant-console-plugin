import { consoleFetch, HttpError } from '@openshift-console/dynamic-plugin-sdk';

// MCP Streamable HTTP client. It speaks JSON-RPC 2.0 through the Console
// plugin proxy, handles JSON and SSE responses, and keeps the session ID in
// memory only (the caller holds it in React state).

export const MCP_PROTOCOL_VERSION = '2025-11-25';
const MAX_LIST_PAGES = 100;

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: T;
  error?: JsonRpcError;
}

export interface JsonRpcRequest extends Record<string, unknown> {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params: Record<string, unknown>;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
    [key: string]: unknown;
  };
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ToolsListResult {
  tools: MCPTool[];
  nextCursor?: string;
  [key: string]: unknown;
}

export interface ToolsCallResult {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
  [key: string]: unknown;
}

export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
  [key: string]: unknown;
}

export interface MCPPrompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: MCPPromptArgument[];
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PromptsListResult {
  prompts: MCPPrompt[];
  nextCursor?: string;
  [key: string]: unknown;
}

export interface PromptMessage {
  role: string;
  content: { type: string; text?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface PromptsGetResult {
  description?: string;
  messages?: PromptMessage[];
  [key: string]: unknown;
}

export interface MCPCallExchange<T> {
  result: T;
  request: JsonRpcRequest;
  response: JsonRpcResponse<T>;
  status: number;
  statusText: string;
  durationMs: number;
}

// json-rpc level error (server returned an error object).
export class MCPRpcError extends Error {
  code: number;
  data?: unknown;
  constructor(err: JsonRpcError) {
    super(err.message);
    this.name = 'MCPRpcError';
    this.code = err.code;
    this.data = err.data;
  }
}

// transport error (non-2xx that is not a 404 session expiry).
export class MCPHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'MCPHttpError';
    this.status = status;
  }
}

// initialize 401: caller asks the user for an MCP bearer token.
export class MCPUnauthorizedError extends MCPHttpError {
  constructor() {
    super(401, 'initialize failed (http 401)');
    this.name = 'MCPUnauthorizedError';
  }
}

// distinct so the page can prompt "session expired, reconnect".
export class MCPSessionExpiredError extends Error {
  constructor() {
    super('session expired');
    this.name = 'MCPSessionExpiredError';
  }
}

export interface MCPClientOptions {
  token?: string;
}

export class MCPClient {
  private readonly endpoint: string;
  private token?: string;
  private sessionId: string | null = null;
  private nextId = 1;

  constructor(endpoint: string, options: MCPClientOptions = {}) {
    this.endpoint = endpoint;
    this.token = options.token;
  }

  // initialize handshake. captures Mcp-Session-Id off the response headers.
  async initialize(): Promise<string | null> {
    const id = this.nextId++;
    const res = await this.post({
      jsonrpc: '2.0',
      id,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'kuadrant-mcp-inspector', version: '0.0.0' },
      },
    });
    if (!res.ok) {
      if (res.status === 401) {
        throw new MCPUnauthorizedError();
      }
      throw new MCPHttpError(res.status, `initialize failed (http ${res.status})`);
    }
    const headerSession = res.headers.get('Mcp-Session-Id');
    if (headerSession) {
      this.sessionId = headerSession;
    }
    const message = await parseRpcMessage<Record<string, unknown>>(res, id);
    throwOnRpcError(message);
    return this.sessionId;
  }

  // notifications/initialized: a notification (no id), server replies 202 with no body.
  async sendInitialized(): Promise<void> {
    const res = await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    if (!res.ok) {
      throw this.httpErrorFor(res.status, 'notifications/initialized failed');
    }
  }

  async toolsList(): Promise<ToolsListResult> {
    const { last, items } = await this.listPages<ToolsListResult, MCPTool>(
      'tools/list',
      (page) => page.tools,
    );
    return { ...last, tools: items };
  }

  async toolsCallWithDetails(
    name: string,
    args: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<MCPCallExchange<ToolsCallResult>> {
    return this.callWithDetails<ToolsCallResult>('tools/call', {
      name,
      arguments: args,
      ...(metadata && Object.keys(metadata).length > 0 ? { _meta: metadata } : {}),
    });
  }

  async promptsList(): Promise<PromptsListResult> {
    const { last, items } = await this.listPages<PromptsListResult, MCPPrompt>(
      'prompts/list',
      (page) => page.prompts,
    );
    return { ...last, prompts: items };
  }

  // list results are cursor-paginated. follow nextCursor so search covers
  // every page, and stop on a repeated cursor rather than loop forever.
  private async listPages<TResult extends { nextCursor?: string }, TItem>(
    method: string,
    itemsOf: (page: TResult) => TItem[] | undefined,
  ): Promise<{ last: TResult; items: TItem[] }> {
    const items: TItem[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (;;) {
      const page = await this.call<TResult>(method, cursor ? { cursor } : {});
      items.push(...(itemsOf(page) ?? []));
      cursor = page.nextCursor;
      if (!cursor) {
        return { last: page, items };
      }
      if (cursors.has(cursor) || cursors.size >= MAX_LIST_PAGES) {
        throw new Error(`${method} pagination did not terminate`);
      }
      cursors.add(cursor);
    }
  }

  async promptsGetWithDetails(
    name: string,
    args: Record<string, string>,
  ): Promise<MCPCallExchange<PromptsGetResult>> {
    return this.callWithDetails<PromptsGetResult>('prompts/get', { name, arguments: args });
  }

  // like call, but keeps the wire exchange for the inspector output
  private async callWithDetails<T>(
    method: string,
    params: Record<string, unknown>,
  ): Promise<MCPCallExchange<T>> {
    const request: JsonRpcRequest = { jsonrpc: '2.0', id: this.nextId++, method, params };
    const startedAt = Date.now();
    const res = await this.post(request);
    if (!res.ok) {
      throw this.httpErrorFor(res.status, `${method} failed`);
    }
    const response = await parseRpcMessage<T>(res, request.id);
    const durationMs = Date.now() - startedAt;
    throwOnRpcError(response);
    return {
      result: response.result as T,
      request,
      response,
      status: res.status,
      statusText: res.statusText,
      durationMs,
    };
  }

  private async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    const res = await this.post({ jsonrpc: '2.0', id, method, params });
    if (!res.ok) {
      throw this.httpErrorFor(res.status, `${method} failed`);
    }
    const message = await parseRpcMessage<T>(res, id);
    throwOnRpcError(message);
    return message.result as T;
  }

  // 404 on a session-scoped call means the session expired.
  private httpErrorFor(status: number, context: string): Error {
    if (status === 404 && this.sessionId) {
      return new MCPSessionExpiredError();
    }
    return new MCPHttpError(status, `${context} (http ${status})`);
  }

  private async post(body: Record<string, unknown>): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
    };
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }
    if (this.token) {
      // Console owns the ordinary Authorization header and replaces it with
      // the current OpenShift user token. The backend translates this explicit
      // MCP credential to Authorization only for the selected MCP gateway.
      headers['X-Kuadrant-MCP-Authorization'] = `Bearer ${this.token}`;
    }
    try {
      return await consoleFetch(this.endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify(body),
      });
    } catch (error) {
      // The MCP handshake needs the upstream status to distinguish an
      // authentication challenge. consoleFetch deliberately throws on non-2xx
      // responses, but its HttpError retains the original response.
      if (error instanceof HttpError && error.response) {
        return error.response;
      }
      throw error;
    }
  }
}

function throwOnRpcError(message: JsonRpcResponse<unknown>): void {
  if (message.error) {
    throw new MCPRpcError(message.error);
  }
}

// responses are either application/json or an sse stream. a request-scoped
// stream may carry notifications ahead of the response, so pick the envelope
// that answers this request rather than the first one.
async function parseRpcMessage<T>(res: Response, id: number | string): Promise<JsonRpcResponse<T>> {
  const contentType = res.headers.get('Content-Type') || '';
  const text = await res.text();
  const envelopes = contentType.includes('text/event-stream')
    ? sseMessages(text)
    : [JSON.parse(text)];
  const message = envelopes.find((envelope) => isResponseTo(envelope, id));
  if (!message) {
    throw new MCPHttpError(res.status, `no json-rpc response for request ${id}`);
  }
  return message as JsonRpcResponse<T>;
}

// a response carries our id with a result or error. an error with a null id
// is the server saying it could not read the request, which is also ours.
function isResponseTo(
  envelope: unknown,
  id: number | string,
): envelope is JsonRpcResponse<unknown> {
  if (!envelope || typeof envelope !== 'object') {
    return false;
  }
  const message = envelope as JsonRpcResponse<unknown>;
  if (message.jsonrpc !== '2.0') {
    return false;
  }
  if (message.id === null) {
    return 'error' in message;
  }
  return String(message.id) === String(id) && ('result' in message || 'error' in message);
}

// every `data:` payload in the stream that parses as json
function sseMessages(raw: string): unknown[] {
  return raw.split(/\r?\n\r?\n/).flatMap((event) => {
    const dataLines = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());
    if (dataLines.length === 0) {
      return [];
    }
    try {
      return [JSON.parse(dataLines.join('\n'))];
    } catch {
      return [];
    }
  });
}
