import * as React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MCPGatewayExtension, MCPServerRegistration } from './types';
import { MCPClient, MCPRpcError, MCPUnauthorizedError } from '../../utils/mcp/client';

let mockExtensions: MCPGatewayExtension[] = [];
let mockExtensionsLoaded = true;
let mockRegistrations: MCPServerRegistration[] = [];
let mockToolsCallWithDetails = jest.fn();
let mockToolsList = jest.fn();
let mockPromptsList = jest.fn();
let mockPromptsGetWithDetails = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      Object.entries(values ?? {}).reduce(
        (translated, [name, value]) => translated.replace(`{{${name}}}`, value),
        key,
      ),
  }),
}));

jest.mock('react-helmet', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  NamespaceBar: () => <div data-test="namespace-bar" />,
  useActiveNamespace: () => ['test-ns'],
  useK8sWatchResource: (resource: { groupVersionKind: { kind: string } }) =>
    resource.groupVersionKind.kind === 'MCPServerRegistration'
      ? [mockRegistrations, true, null]
      : [mockExtensions, mockExtensionsLoaded, null],
}));

jest.mock('../../utils/mcp/client', () => ({
  ...jest.requireActual('../../utils/mcp/client'),
  MCPClient: jest.fn(),
}));

import MCPInspectorPage from './MCPInspectorPage';

const readyExtension: MCPGatewayExtension = {
  apiVersion: 'mcp.kuadrant.io/v1',
  kind: 'MCPGatewayExtension',
  metadata: { name: 'mcp-gateway', namespace: 'test-ns' },
  spec: {
    targetRef: {
      name: 'mcp-gateway',
      sectionName: 'mcp',
    },
    publicHost: 'mcp.example.test',
  },
  status: {
    conditions: [{ type: 'Ready', status: 'True' }],
  },
};

const toystoreRegistration: MCPServerRegistration = {
  apiVersion: 'mcp.kuadrant.io/v1',
  kind: 'MCPServerRegistration',
  metadata: { name: 'toystore-mcp-server', namespace: 'toystore' },
  spec: { targetRef: { name: 'mcp-test-server-route' }, prefix: 'toystore_' },
};

const connectToGateway = async () => {
  fireEvent.change(screen.getByLabelText('Select an MCP gateway extension'), {
    target: { value: 'test-ns/mcp-gateway' },
  });
  await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
};

const pickTool = (search: string, option: RegExp) => {
  fireEvent.change(screen.getByLabelText('Search tools'), { target: { value: search } });
  fireEvent.click(screen.getByRole('option', { name: option }));
};

describe('MCPInspectorPage', () => {
  beforeEach(() => {
    mockExtensions = [];
    mockExtensionsLoaded = true;
    mockRegistrations = [];
    mockToolsCallWithDetails = jest.fn().mockResolvedValue({
      result: { content: [{ type: 'text', text: 'Hello, Ada!' }] },
      request: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'toystore_greet', arguments: { name: 'Ada' } },
      },
      response: {
        jsonrpc: '2.0',
        id: 3,
        result: { content: [{ type: 'text', text: 'Hello, Ada!' }] },
      },
      status: 200,
      statusText: 'OK',
      durationMs: 12,
    });
    mockToolsList = jest.fn().mockResolvedValue({
      tools: [
        {
          name: 'toystore_greet',
          description: 'Say hello',
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'The name to greet' },
            },
            required: ['name'],
          },
        },
      ],
    });
    mockPromptsList = jest.fn().mockResolvedValue({
      prompts: [
        {
          name: 'toystore_greet',
          description: 'greet a person by name',
          arguments: [{ name: 'name', description: 'who to greet', required: true }],
        },
      ],
    });
    mockPromptsGetWithDetails = jest.fn().mockResolvedValue({
      result: { messages: [{ role: 'user', content: { type: 'text', text: 'Say hi to Ada' } }] },
      request: {
        jsonrpc: '2.0',
        id: 4,
        method: 'prompts/get',
        params: { name: 'toystore_greet', arguments: { name: 'Ada' } },
      },
      response: {
        jsonrpc: '2.0',
        id: 4,
        result: { messages: [{ role: 'user', content: { type: 'text', text: 'Say hi to Ada' } }] },
      },
      status: 200,
      statusText: 'OK',
      durationMs: 7,
    });
    (MCPClient as jest.Mock).mockReset();
    (MCPClient as jest.Mock).mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue('session-1'),
      sendInitialized: jest.fn().mockResolvedValue(undefined),
      toolsList: mockToolsList,
      toolsCallWithDetails: mockToolsCallWithDetails,
      promptsList: mockPromptsList,
      promptsGetWithDetails: mockPromptsGetWithDetails,
    }));
  });

  it('guides the user to select a gateway before showing inspector tools', () => {
    render(<MCPInspectorPage />);

    expect(screen.getByRole('heading', { name: 'No connection' })).toBeInTheDocument();
    expect(
      screen.getByText('Connect to a Gateway to view the MCP server tools available.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run tool' })).not.toBeInTheDocument();
  });

  it('connects to a ready gateway and shows its tools workspace', async () => {
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);

    fireEvent.change(screen.getByLabelText('Select an MCP gateway extension'), {
      target: { value: 'test-ns/mcp-gateway' },
    });

    await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: 'Tools' })).toBeInTheDocument();
    expect(screen.getByText('No authentication')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search tools'), { target: { value: 'toy' } });
    expect(screen.getByRole('option', { name: /toystore_greet/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Bearer token (optional)')).not.toBeInTheDocument();
    expect(screen.getByText('0 requests')).toBeInTheDocument();
    expect(screen.getByText('0 warnings')).toBeInTheDocument();
    expect(screen.getByText('0 errors')).toBeInTheDocument();
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('offers an in-memory bearer token after an authentication challenge', async () => {
    (MCPClient as jest.Mock).mockImplementationOnce(() => ({
      initialize: jest.fn().mockRejectedValue(new MCPUnauthorizedError()),
    }));
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);

    fireEvent.change(screen.getByLabelText('Select an MCP gateway extension'), {
      target: { value: 'test-ns/mcp-gateway' },
    });

    const dialog = await screen.findByRole('dialog', { name: 'Authentication required' });
    expect(dialog).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in with OIDC' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Bearer token'), { target: { value: 'test-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect with bearer token' }));

    await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
    expect(MCPClient).toHaveBeenLastCalledWith(
      '/api/proxy/plugin/kuadrant-console-plugin/backend/api/mcp/v1/mcpgatewayextensions/test-ns/mcp-gateway',
      { token: 'test-token' },
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explains when a bearer token is rejected and allows another attempt', async () => {
    (MCPClient as jest.Mock)
      .mockImplementationOnce(() => ({
        initialize: jest.fn().mockRejectedValue(new MCPUnauthorizedError()),
      }))
      .mockImplementationOnce(() => ({
        initialize: jest.fn().mockRejectedValue(new MCPUnauthorizedError()),
      }));
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);

    fireEvent.change(screen.getByLabelText('Select an MCP gateway extension'), {
      target: { value: 'test-ns/mcp-gateway' },
    });

    await screen.findByRole('dialog', { name: 'Authentication required' });
    fireEvent.change(screen.getByLabelText('Bearer token'), {
      target: { value: 'incorrect-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect with bearer token' }));

    expect(await screen.findByText('Invalid bearer token')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Authentication required' })).toBeInTheDocument();
    expect(screen.queryByText('initialize failed (http 401)')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Bearer token'), {
      target: { value: 'correct-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect with bearer token' }));

    await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('builds and validates a tool form from its input schema before running it', async () => {
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);

    fireEvent.change(screen.getByLabelText('Select an MCP gateway extension'), {
      target: { value: 'test-ns/mcp-gateway' },
    });
    await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());

    pickTool('greet', /toystore_greet/);

    expect(screen.getByRole('heading', { name: 'toystore_greet' })).toBeInTheDocument();
    expect(screen.getByText('Read only')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Validate only' }));
    expect(screen.getByText('Name is required')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validate only' }));
    expect(screen.getByText('Input is valid')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));
    await waitFor(() =>
      expect(mockToolsCallWithDetails).toHaveBeenCalledWith('toystore_greet', { name: 'Ada' }),
    );
  });

  it('sends metadata and presents the server result with request telemetry', async () => {
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);

    fireEvent.change(screen.getByLabelText('Select an MCP gateway extension'), {
      target: { value: 'test-ns/mcp-gateway' },
    });
    await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
    pickTool('toystore_greet', /toystore_greet/);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add metadata' }));
    fireEvent.change(screen.getByLabelText('Metadata key'), { target: { value: 'traceId' } });
    fireEvent.change(screen.getByLabelText('Metadata value'), {
      target: { value: 'trace-1' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));

    await waitFor(() =>
      expect(mockToolsCallWithDetails).toHaveBeenCalledWith(
        'toystore_greet',
        { name: 'Ada' },
        { traceId: 'trace-1' },
      ),
    );
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('200 OK')).toBeInTheDocument();
    expect(screen.getByText('12 ms')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Console' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Server result' })).toBeInTheDocument();
    expect(screen.getAllByText(/Hello, Ada!/).length).toBeGreaterThan(0);
  });

  it('refreshes the tool list without reconnecting the session', async () => {
    mockToolsList
      .mockResolvedValueOnce({
        tools: [{ name: 'toystore_greet', inputSchema: { type: 'object', properties: {} } }],
      })
      .mockResolvedValueOnce({
        tools: [
          { name: 'toystore_greet', inputSchema: { type: 'object', properties: {} } },
          { name: 'toystore_calculate', inputSchema: { type: 'object', properties: {} } },
        ],
      });
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);

    fireEvent.change(screen.getByLabelText('Select an MCP gateway extension'), {
      target: { value: 'test-ns/mcp-gateway' },
    });
    await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());

    const refreshButton = screen.getByRole('button', { name: 'Refresh tools' });
    expect(refreshButton).not.toHaveTextContent('Refresh');
    fireEvent.click(refreshButton);

    await waitFor(() => expect(mockToolsList).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText('Search tools'), { target: { value: 'toystore' } });
    expect(await screen.findByRole('option', { name: /toystore_calculate/ })).toBeInTheDocument();
    expect(MCPClient).toHaveBeenCalledTimes(1);
    expect(screen.getByText('1 request')).toBeInTheDocument();
  });

  it('names the MCP server from its registration prefix and copies the tool name', async () => {
    mockRegistrations = [toystoreRegistration];
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);
    await connectToGateway();

    fireEvent.change(screen.getByLabelText('Search tools'), { target: { value: 'greet' } });
    const option = screen.getByRole('option', { name: /toystore_greet/ });
    expect(option).toHaveTextContent('toystore-mcp-server');
    fireEvent.click(option);

    expect(screen.getByRole('heading', { name: 'toystore_greet' })).toBeInTheDocument();
    expect(screen.getByText('toystore-mcp-server')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy tool name' }));
    expect(writeText).toHaveBeenCalledWith('toystore_greet');
  });

  it('generates a prompt from its arguments and estimates its size', async () => {
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);
    await connectToGateway();

    fireEvent.click(screen.getByRole('tab', { name: 'Prompts' }));
    expect(
      screen.getByText(
        'Generating prompts creates text templates only and does not execute commands.',
      ),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search prompts'), { target: { value: 'greet' } });
    fireEvent.click(screen.getByRole('option', { name: /toystore_greet/ }));
    expect(screen.getByRole('heading', { name: 'toystore_greet' })).toBeInTheDocument();
    expect(screen.getByText('greet a person by name')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Generate prompt' }));
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(mockPromptsGetWithDetails).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate prompt' }));
    await waitFor(() =>
      expect(mockPromptsGetWithDetails).toHaveBeenCalledWith('toystore_greet', { name: 'Ada' }),
    );
    expect(screen.getByText('Say hi to Ada')).toBeInTheDocument();
    expect(screen.getByText('Token count: ~4')).toBeInTheDocument();
    expect(screen.getByText('200 OK')).toBeInTheDocument();
    expect(screen.getByText('1 request')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear fields' }));
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });

  it('keeps a tools-only session when the gateway does not expose prompts', async () => {
    mockPromptsList.mockRejectedValue(
      new MCPRpcError({ code: -32601, message: 'Method not found' }),
    );
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);
    await connectToGateway();

    fireEvent.change(screen.getByLabelText('Search tools'), { target: { value: 'toy' } });
    expect(screen.getByRole('option', { name: /toystore_greet/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Prompts' }));
    expect(screen.getByText('This gateway does not expose prompts.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generate prompt' })).not.toBeInTheDocument();
  });

  it('keeps the gateway selected last when an earlier connect finishes late', async () => {
    const otherExtension: MCPGatewayExtension = {
      ...readyExtension,
      metadata: { name: 'other-gateway', namespace: 'test-ns' },
    };
    let finishFirst: (sessionId: string) => void = () => undefined;
    const firstInitialize = new Promise<string>((resolve) => {
      finishFirst = resolve;
    });
    const firstToolsList = jest.fn().mockResolvedValue({ tools: [{ name: 'first_tool' }] });
    const firstPromptsList = jest.fn().mockResolvedValue({ prompts: [] });
    (MCPClient as jest.Mock).mockImplementationOnce(() => ({
      initialize: jest.fn().mockReturnValue(firstInitialize),
      sendInitialized: jest.fn().mockResolvedValue(undefined),
      toolsList: firstToolsList,
      promptsList: firstPromptsList,
    }));
    mockExtensions = [readyExtension, otherExtension];
    render(<MCPInspectorPage />);

    fireEvent.change(screen.getByLabelText('Select an MCP gateway extension'), {
      target: { value: 'test-ns/mcp-gateway' },
    });
    fireEvent.change(screen.getByLabelText('Select an MCP gateway extension'), {
      target: { value: 'test-ns/other-gateway' },
    });
    await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());

    finishFirst('session-stale');
    await waitFor(() => expect(firstPromptsList).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Search tools'), { target: { value: 'first' } });
    expect(screen.queryByRole('option', { name: /first_tool/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search tools'), { target: { value: 'greet' } });
    expect(screen.getByRole('option', { name: /toystore_greet/ })).toBeInTheDocument();
    expect(MCPClient).toHaveBeenLastCalledWith(
      '/api/proxy/plugin/kuadrant-console-plugin/backend/api/mcp/v1/mcpgatewayextensions/test-ns/other-gateway',
      { token: undefined },
    );
  });

  it('sends an enum selection with the type the schema declares', async () => {
    mockToolsList.mockResolvedValue({
      tools: [
        {
          name: 'toystore_toggle',
          inputSchema: {
            type: 'object',
            properties: { enabled: { type: 'boolean', enum: [true, false] } },
            required: ['enabled'],
          },
        },
      ],
    });
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);
    await connectToGateway();
    pickTool('toggle', /toystore_toggle/);

    fireEvent.change(screen.getByLabelText('Enabled'), { target: { value: 'true' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));

    await waitFor(() =>
      expect(mockToolsCallWithDetails).toHaveBeenCalledWith('toystore_toggle', { enabled: true }),
    );
  });

  it('rejects null for an object input unless the schema is nullable', async () => {
    mockToolsList.mockResolvedValue({
      tools: [
        {
          name: 'toystore_configure',
          inputSchema: {
            type: 'object',
            properties: {
              config: { type: 'object' },
              override: { type: ['object', 'null'] },
            },
          },
        },
      ],
    });
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);
    await connectToGateway();
    pickTool('configure', /toystore_configure/);

    fireEvent.change(screen.getByLabelText('Config'), { target: { value: 'null' } });
    fireEvent.change(screen.getByLabelText('Override'), { target: { value: 'null' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validate only' }));
    expect(screen.getByText('Config must be valid JSON')).toBeInTheDocument();
    expect(screen.queryByText('Override must be valid JSON')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Config'), { target: { value: '{}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));
    await waitFor(() =>
      expect(mockToolsCallWithDetails).toHaveBeenCalledWith('toystore_configure', {
        config: {},
        override: null,
      }),
    );
  });

  it('ignores a tool result that arrives after switching gateway', async () => {
    const otherExtension: MCPGatewayExtension = {
      ...readyExtension,
      metadata: { name: 'other-gateway', namespace: 'test-ns' },
    };
    let finishCall: (exchange: unknown) => void = () => undefined;
    mockToolsCallWithDetails.mockReturnValueOnce(
      new Promise((resolve) => {
        finishCall = resolve;
      }),
    );
    mockExtensions = [readyExtension, otherExtension];
    render(<MCPInspectorPage />);
    await connectToGateway();
    pickTool('greet', /toystore_greet/);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));
    await waitFor(() => expect(mockToolsCallWithDetails).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Select an MCP gateway extension'), {
      target: { value: 'test-ns/other-gateway' },
    });
    await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
    await act(async () => {
      finishCall({
        result: { content: [{ type: 'text', text: 'Stale result' }] },
        request: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: {} },
        response: { jsonrpc: '2.0', id: 3, result: {} },
        status: 200,
        statusText: 'OK',
        durationMs: 1,
      });
    });

    expect(screen.queryByText('Stale result')).not.toBeInTheDocument();
    expect(screen.queryByText('Success')).not.toBeInTheDocument();
    expect(screen.getByText('0 requests')).toBeInTheDocument();
  });

  it('treats a null default as no value', async () => {
    mockToolsList.mockResolvedValue({
      tools: [
        {
          name: 'toystore_note',
          inputSchema: {
            type: 'object',
            properties: { note: { type: ['string', 'null'], default: null } },
          },
        },
      ],
    });
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);
    await connectToGateway();
    pickTool('note', /toystore_note/);

    expect(screen.getByLabelText('Note')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));

    await waitFor(() => expect(mockToolsCallWithDetails).toHaveBeenCalledWith('toystore_note', {}));
  });

  it('counts tool errors as warnings and transport failures as errors', async () => {
    mockToolsCallWithDetails
      .mockResolvedValueOnce({
        result: { isError: true, content: [{ type: 'text', text: 'Tool failed' }] },
        request: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: {} },
        response: { jsonrpc: '2.0', id: 3, result: { isError: true } },
        status: 200,
        statusText: 'OK',
        durationMs: 5,
      })
      .mockRejectedValueOnce(new Error('gateway unreachable'));
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);
    await connectToGateway();
    pickTool('greet', /toystore_greet/);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });

    fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));
    await waitFor(() => expect(screen.getByText('1 warning')).toBeInTheDocument());
    expect(screen.getByText('1 request')).toBeInTheDocument();
    expect(screen.getByText('0 errors')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));
    await waitFor(() => expect(screen.getByText('1 error')).toBeInTheDocument());
    expect(screen.getByText('2 requests')).toBeInTheDocument();
    expect(screen.getByText('1 warning')).toBeInTheDocument();
    expect(screen.getByText('gateway unreachable')).toBeInTheDocument();
  });
});
