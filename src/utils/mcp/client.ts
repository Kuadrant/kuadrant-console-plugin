import { consoleFetch, HttpError } from '@openshift-console/dynamic-plugin-sdk';

// MCP Streamable HTTP client. It speaks JSON-RPC 2.0 through the Console
// plugin proxy, handles JSON and SSE responses, and keeps the session ID in
// memory only (the caller holds it in React state).

export const MCP_PROTOCOL_VERSION = '2025-11-25';

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

export interface InitializeResult {
  protocolVersion: string;
  capabilities?: Record<string, unknown>;
  serverInfo?: { name?: string; version?: string };
  instructions?: string;
  [key: string]: unknown;
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

// initialize 401: caller starts PKCE from WWW-Authenticate (RFC 9728).
export class MCPUnauthorizedError extends MCPHttpError {
  wwwAuthenticate: string | null;
  constructor(wwwAuthenticate: string | null) {
    super(401, 'initialize failed (http 401)');
    this.name = 'MCPUnauthorizedError';
    this.wwwAuthenticate = wwwAuthenticate;
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

  getSessionId(): string | null {
    return this.sessionId;
  }

  // initialize handshake. captures Mcp-Session-Id off the response headers.
  async initialize(): Promise<{ result: InitializeResult; sessionId: string | null }> {
    const res = await this.post({
      jsonrpc: '2.0',
      id: this.nextId++,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'kuadrant-mcp-inspector', version: '0.0.0' },
      },
    });
    if (!res.ok) {
      if (res.status === 401) {
        throw new MCPUnauthorizedError(res.headers.get('WWW-Authenticate'));
      }
      throw new MCPHttpError(res.status, `initialize failed (http ${res.status})`);
    }
    const headerSession = res.headers.get('Mcp-Session-Id');
    if (headerSession) {
      this.sessionId = headerSession;
    }
    const message = await parseRpcMessage<InitializeResult>(res);
    throwOnRpcError(message);
    return { result: message.result as InitializeResult, sessionId: this.sessionId };
  }

  // notifications/initialized: a notification (no id), server replies 202 with no body.
  async sendInitialized(): Promise<void> {
    const res = await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    if (!res.ok) {
      throw this.httpErrorFor(res.status, 'notifications/initialized failed');
    }
  }

  async toolsList(): Promise<ToolsListResult> {
    return this.call<ToolsListResult>('tools/list', {});
  }

  async toolsCall(name: string, args: Record<string, unknown>): Promise<ToolsCallResult> {
    return (await this.toolsCallWithDetails(name, args)).result;
  }

  async toolsCallWithDetails(
    name: string,
    args: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<MCPCallExchange<ToolsCallResult>> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.nextId++,
      method: 'tools/call',
      params: {
        name,
        arguments: args,
        ...(metadata && Object.keys(metadata).length > 0 ? { _meta: metadata } : {}),
      },
    };
    const startedAt = Date.now();
    const res = await this.post(request);
    if (!res.ok) {
      throw this.httpErrorFor(res.status, 'tools/call failed');
    }
    const response = await parseRpcMessage<ToolsCallResult>(res);
    const durationMs = Date.now() - startedAt;
    throwOnRpcError(response);
    return {
      result: response.result as ToolsCallResult,
      request,
      response,
      status: res.status,
      statusText: res.statusText,
      durationMs,
    };
  }

  private async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const res = await this.post({ jsonrpc: '2.0', id: this.nextId++, method, params });
    if (!res.ok) {
      throw this.httpErrorFor(res.status, `${method} failed`);
    }
    const message = await parseRpcMessage<T>(res);
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
      // The MCP handshake needs the upstream status and WWW-Authenticate
      // header. consoleFetch deliberately throws on non-2xx responses, but its
      // HttpError retains the original response for this purpose.
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

// responses are either application/json or an sse stream carrying the
// json-rpc message in `data:` lines. buffer the body and extract the message.
async function parseRpcMessage<T>(res: Response): Promise<JsonRpcResponse<T>> {
  const contentType = res.headers.get('Content-Type') || '';
  const text = await res.text();
  if (contentType.includes('text/event-stream')) {
    const message = extractSseRpcMessage<T>(text);
    if (!message) {
      throw new MCPHttpError(res.status, 'no json-rpc message in event stream');
    }
    return message;
  }
  return JSON.parse(text) as JsonRpcResponse<T>;
}

// walk sse events, return the first `data:` payload that parses to a
// json-rpc response envelope.
function extractSseRpcMessage<T>(raw: string): JsonRpcResponse<T> | null {
  const events = raw.split(/\r?\n\r?\n/);
  for (const event of events) {
    const dataLines = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());
    if (dataLines.length === 0) {
      continue;
    }
    try {
      const parsed = JSON.parse(dataLines.join('\n')) as JsonRpcResponse<T>;
      if (parsed && parsed.jsonrpc === '2.0') {
        return parsed;
      }
    } catch {
      // not json, try next event
    }
  }
  return null;
}
