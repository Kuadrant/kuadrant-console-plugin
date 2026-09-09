import { consoleFetch, HttpError } from '@openshift-console/dynamic-plugin-sdk';
import {
  encodeMCPHeader,
  MCPParameterHeader,
  parameterHeaderBindings,
  parameterHeaders,
} from './headers';

// MCP Streamable HTTP client. It speaks JSON-RPC 2.0 through the Console
// plugin proxy, handles JSON and SSE responses, and keeps the session ID in
// memory only (the caller holds it in React state).

export const MCP_PROTOCOL_VERSION = '2026-07-28';
export const MCP_LEGACY_PROTOCOL_VERSION = '2025-11-25';
export type MCPProtocolMode =
  | 'auto'
  | typeof MCP_PROTOCOL_VERSION
  | typeof MCP_LEGACY_PROTOCOL_VERSION;
export interface MCPConnection {
  protocolVersion: string;
  sessionId: string | null;
}
const CLIENT_INFO = { name: 'kuadrant-mcp-inspector', version: '0.0.0' };
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
  resultType?: 'complete' | 'input_required';
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
  resultType?: 'complete' | 'input_required';
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
  status?: number;
  constructor(err: JsonRpcError, status?: number) {
    super(err.message);
    this.name = 'MCPRpcError';
    this.code = err.code;
    this.data = err.data;
    this.status = status;
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

// Connection 401: caller asks the user for an MCP bearer token.
export class MCPUnauthorizedError extends MCPHttpError {
  constructor() {
    super(401, 'MCP authentication required (http 401)');
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
  protocolMode?: MCPProtocolMode;
}

export class MCPClient {
  private readonly endpoint: string;
  private token?: string;
  private sessionId: string | null = null;
  private nextId = 1;
  private protocolVersion: string = MCP_LEGACY_PROTOCOL_VERSION;
  private readonly protocolMode: MCPProtocolMode;
  private toolHeaders = new Map<string, MCPParameterHeader[]>();
  private rejectedTools = new Set<string>();

  constructor(endpoint: string, options: MCPClientOptions = {}) {
    this.endpoint = endpoint;
    this.token = options.token;
    this.protocolMode = options.protocolMode ?? 'auto';
  }

  async connect(): Promise<MCPConnection> {
    this.sessionId = null;
    this.toolHeaders.clear();
    this.rejectedTools.clear();
    if (this.protocolMode !== MCP_LEGACY_PROTOCOL_VERSION) {
      this.protocolVersion = MCP_PROTOCOL_VERSION;
      let supported: string[] | undefined;
      try {
        const discovery = await this.call<{ supportedVersions: string[] }>('server/discover', {});
        if (
          !Array.isArray(discovery.supportedVersions) ||
          !discovery.supportedVersions.every((version) => typeof version === 'string')
        ) {
          throw new Error('Invalid MCP discovery response: missing supportedVersions');
        }
        supported = discovery.supportedVersions;
      } catch (error) {
        if (error instanceof MCPRpcError && error.code === -32022) {
          const versions = (error.data as { supported?: unknown } | undefined)?.supported;
          if (
            !Array.isArray(versions) ||
            !versions.every((version) => typeof version === 'string') ||
            versions.includes(MCP_PROTOCOL_VERSION)
          )
            throw error;
          supported = versions;
        } else {
          const legacyResponse =
            (error instanceof MCPRpcError &&
              ![-32020, -32021, -32022].includes(error.code) &&
              ((error.code === -32601 && (error.status === undefined || error.status === 200)) ||
                (error.status !== undefined && [400, 404, 405].includes(error.status)))) ||
            (error instanceof MCPHttpError && [400, 404, 405].includes(error.status));
          if (this.protocolMode !== 'auto' || !legacyResponse) throw error;
        }
      }
      if (supported?.includes(MCP_PROTOCOL_VERSION)) {
        return { protocolVersion: this.protocolVersion, sessionId: null };
      }
      if (
        this.protocolMode !== 'auto' ||
        (supported && !supported.includes(MCP_LEGACY_PROTOCOL_VERSION))
      ) {
        throw new Error(
          `No compatible MCP protocol version (server supports: ${
            supported?.join(', ') || 'legacy initialization only'
          })`,
        );
      }
    }
    this.protocolVersion = MCP_LEGACY_PROTOCOL_VERSION;
    await this.initialize();
    await this.sendInitialized();
    return { protocolVersion: this.protocolVersion, sessionId: this.sessionId };
  }

  // initialize handshake. captures Mcp-Session-Id off the response headers.
  private async initialize(): Promise<void> {
    const id = this.nextId++;
    const res = await this.post({
      jsonrpc: '2.0',
      id,
      method: 'initialize',
      params: {
        protocolVersion: this.protocolVersion,
        capabilities: {},
        clientInfo: CLIENT_INFO,
      },
    });
    if (!res.ok) {
      throw await this.responseError(res, id, 'initialize failed');
    }
    const message = await parseRpcMessage<Record<string, unknown>>(res, id);
    throwOnRpcError(message);
    if (message.result?.protocolVersion !== MCP_LEGACY_PROTOCOL_VERSION) {
      throw new Error(`Unsupported MCP protocol version: ${message.result?.protocolVersion}`);
    }
    this.protocolVersion = message.result.protocolVersion;
    this.sessionId = res.headers.get('Mcp-Session-Id');
  }

  // notifications/initialized: a notification (no id), server replies 202 with no body.
  private async sendInitialized(): Promise<void> {
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
    this.toolHeaders.clear();
    this.rejectedTools.clear();
    const tools =
      this.protocolVersion === MCP_PROTOCOL_VERSION
        ? items.filter((tool) => {
            try {
              this.toolHeaders.set(tool.name, parameterHeaderBindings(tool.inputSchema));
              return true;
            } catch (error) {
              this.rejectedTools.add(tool.name);
              console.warn(`MCP tool ${tool.name} excluded:`, error);
              return false;
            }
          })
        : items;
    return { ...last, tools };
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
    const request = this.request(method, params);
    const startedAt = Date.now();
    const res = await this.post(request);
    if (!res.ok) {
      throw await this.responseError(res, request.id, `${method} failed`);
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
    const request = this.request(method, params);
    const res = await this.post(request);
    if (!res.ok) {
      throw await this.responseError(res, request.id, `${method} failed`);
    }
    const message = await parseRpcMessage<T>(res, request.id);
    throwOnRpcError(message);
    return message.result as T;
  }

  private request(method: string, params: Record<string, unknown>): JsonRpcRequest {
    return {
      jsonrpc: '2.0',
      id: this.nextId++,
      method,
      params:
        this.protocolVersion === MCP_PROTOCOL_VERSION
          ? {
              ...params,
              _meta: {
                ...(params._meta as Record<string, unknown> | undefined),
                'io.modelcontextprotocol/protocolVersion': this.protocolVersion,
                'io.modelcontextprotocol/clientCapabilities': {},
                'io.modelcontextprotocol/clientInfo': CLIENT_INFO,
              },
            }
          : params,
    };
  }

  private async responseError(res: Response, id: number | string, context: string): Promise<Error> {
    if (res.status === 401) return new MCPUnauthorizedError();
    if (res.status === 404 && this.sessionId) return new MCPSessionExpiredError();
    try {
      const message = await parseRpcMessage<unknown>(res, id);
      if (message.error) return new MCPRpcError(message.error, res.status);
    } catch {
      // Proxies and legacy servers may return a non-JSON error body.
    }
    return this.httpErrorFor(res.status, context);
  }

  // 404 on a session-scoped call means the session expired.
  private httpErrorFor(status: number, context: string): Error {
    if (status === 401) return new MCPUnauthorizedError();
    if (status === 404 && this.sessionId) {
      return new MCPSessionExpiredError();
    }
    return new MCPHttpError(status, `${context} (http ${status})`);
  }

  private async post(body: Record<string, unknown>): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': this.protocolVersion,
    };
    if (this.protocolVersion === MCP_PROTOCOL_VERSION) {
      headers['Mcp-Method'] = String(body.method);
      const params = body.params as Record<string, unknown>;
      if (body.method === 'tools/call' || body.method === 'prompts/get') {
        headers['Mcp-Name'] = encodeMCPHeader(String(params.name));
      }
      if (body.method === 'tools/call') {
        const name = String(params.name);
        if (this.rejectedTools.has(name))
          throw new Error(`Invalid MCP tool header schema: ${name}`);
        Object.assign(
          headers,
          parameterHeaders(
            this.toolHeaders.get(name) ?? [],
            params.arguments as Record<string, unknown>,
          ),
        );
      }
    }
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
  const result = message.result as { resultType?: string } | undefined;
  if (
    result?.resultType !== undefined &&
    !['complete', 'input_required'].includes(result.resultType)
  ) {
    throw new Error(`Unsupported MCP result type: ${result.resultType}`);
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
  if (message.id === null || message.id === undefined) {
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
