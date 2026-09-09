import * as React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MCPGatewayExtension, MCPServerRegistration } from './types';
import {
  MCPClient,
  MCPConnection,
  MCPRpcError,
  MCPUnauthorizedError,
  MCPSessionExpiredError,
} from '../../utils/mcp/client';

let mockExtensions: MCPGatewayExtension[] = [];
let mockActiveNamespace = 'test-ns';
let mockExtensionsLoaded = true;
let mockExtensionsError: Error | null = null;
let mockRegistrationsError: Error | null = null;
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
  useActiveNamespace: () => [mockActiveNamespace],
  useK8sWatchResource: (resource: { groupVersionKind: { kind: string } }) =>
    resource.groupVersionKind.kind === 'MCPServerRegistration'
      ? [mockRegistrations, true, mockRegistrationsError]
      : [mockExtensions, mockExtensionsLoaded, mockExtensionsError],
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
    mockActiveNamespace = 'test-ns';
    mockExtensions = [];
    mockExtensionsLoaded = true;
    mockExtensionsError = null;
    mockRegistrationsError = null;
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
      connect: jest
        .fn()
        .mockResolvedValue({ protocolVersion: '2025-11-25', sessionId: 'session-1' }),
      toolsList: mockToolsList,
      toolsCallWithDetails: mockToolsCallWithDetails,
      promptsList: mockPromptsList,
      promptsGetWithDetails: mockPromptsGetWithDetails,
    }));
  });

  it('shows an initial extension load failure and recovers when the watch loads', async () => {
    mockExtensionsLoaded = false;
    mockExtensionsError = new Error('Access denied');
    const { rerender } = render(<MCPInspectorPage />);
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(screen.queryByText('Loading extensions...')).not.toBeInTheDocument();
    mockExtensionsError = null;
    mockExtensionsLoaded = true;
    mockExtensions = [readyExtension];
    rerender(<MCPInspectorPage />);
    expect(screen.queryByText('Access denied')).not.toBeInTheDocument();
    await connectToGateway();
  });

  it.each(['tool', 'prompt'])(
    'submits a pending %s only once and allows the next run',
    async (kind) => {
      const operation = kind === 'tool' ? mockToolsCallWithDetails : mockPromptsGetWithDetails;
      let finish: (exchange: unknown) => void = () => undefined;
      operation.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      mockExtensions = [readyExtension];
      render(<MCPInspectorPage />);
      await connectToGateway();
      if (kind === 'tool') {
        pickTool('greet', /toystore_greet/);
      } else {
        fireEvent.click(screen.getByRole('tab', { name: 'Prompts' }));
        fireEvent.change(screen.getByLabelText('Search prompts'), { target: { value: 'greet' } });
        fireEvent.click(screen.getByRole('option', { name: /toystore_greet/ }));
      }
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
      const button = screen.getByRole('button', {
        name: kind === 'tool' ? 'Run tool' : 'Generate prompt',
      });
      // Dispatch together so the operation guard also covers clicks before React commits the busy state.
      act(() => {
        button.click();
        button.click();
      });
      expect(operation).toHaveBeenCalledTimes(1);
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(operation).toHaveBeenCalledTimes(1);
      await act(async () =>
        finish({
          result: { content: [], messages: [] },
          request: {},
          response: {},
          status: 200,
          statusText: 'OK',
          durationMs: 1,
        }),
      );
      expect(button).toBeEnabled();
      fireEvent.click(button);
      await waitFor(() => expect(operation).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(button).toBeEnabled());
    },
  );

  it.each(['other-ns', '#ALL_NS#'])(
    'clears the session and credentials when changing namespace to %s',
    async (namespace) => {
      (MCPClient as jest.Mock).mockImplementationOnce(() => ({
        connect: jest.fn().mockRejectedValue(new MCPUnauthorizedError()),
      }));
      mockExtensions = [readyExtension];
      const { rerender } = render(<MCPInspectorPage />);
      fireEvent.change(screen.getByLabelText('Select an MCP gateway extension'), {
        target: { value: 'test-ns/mcp-gateway' },
      });
      await screen.findByRole('dialog', { name: 'Authentication required' });
      fireEvent.change(screen.getByLabelText('Bearer token'), { target: { value: 'old-token' } });
      fireEvent.click(screen.getByRole('button', { name: 'Connect with bearer token' }));
      await screen.findByText('Connected', { exact: true });
      let finish: (exchange: unknown) => void = () => undefined;
      mockToolsCallWithDetails.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      pickTool('greet', /toystore_greet/);
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
      fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));

      mockActiveNamespace = namespace;
      mockExtensions = namespace === '#ALL_NS#' ? [readyExtension] : [];
      rerender(<MCPInspectorPage />);
      expect(screen.getByRole('heading', { name: 'No connection' })).toBeInTheDocument();
      expect(screen.getByLabelText('Select an MCP gateway extension')).toHaveValue('');
      expect(screen.queryByRole('button', { name: 'Run tool' })).not.toBeInTheDocument();
      expect(screen.queryByText('session-1')).not.toBeInTheDocument();
      await act(async () =>
        finish({ result: { content: [{ type: 'text', text: 'stale result' }] } }),
      );
      expect(screen.queryByText('stale result')).not.toBeInTheDocument();
      expect(screen.getByText('0 requests')).toBeInTheDocument();

      // Returning to the original namespace must still start without its old bearer token.
      mockActiveNamespace = 'test-ns';
      mockExtensions = [readyExtension];
      rerender(<MCPInspectorPage />);
      await connectToGateway();
      fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
      await screen.findByText('Connected', { exact: true });
      expect(MCPClient).toHaveBeenLastCalledWith(expect.any(String), {
        token: undefined,
        protocolMode: 'auto',
      });
      pickTool('greet', /toystore_greet/);
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Grace' } });
      fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));
      await waitFor(() =>
        expect(mockToolsCallWithDetails).toHaveBeenLastCalledWith('toystore_greet', {
          name: 'Grace',
        }),
      );
    },
  );

  it('ignores a connection that finishes after changing namespace', async () => {
    let finish: (connection: MCPConnection) => void = () => undefined;
    (MCPClient as jest.Mock).mockImplementationOnce(() => ({
      connect: jest.fn().mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      ),
      toolsList: mockToolsList,
      promptsList: mockPromptsList,
    }));
    mockExtensions = [readyExtension];
    const { rerender } = render(<MCPInspectorPage />);
    fireEvent.change(screen.getByLabelText('Select an MCP gateway extension'), {
      target: { value: 'test-ns/mcp-gateway' },
    });
    mockActiveNamespace = 'other-ns';
    mockExtensions = [];
    rerender(<MCPInspectorPage />);
    await act(async () => finish({ protocolVersion: '2025-11-25', sessionId: 'stale-session' }));
    expect(screen.getByRole('heading', { name: 'No connection' })).toBeInTheDocument();
    expect(screen.queryByText('stale-session')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Search tools')).not.toBeInTheDocument();
  });

  it.each([
    { required: false, enumValues: undefined },
    { required: true, enumValues: undefined },
    { required: false, enumValues: [true, false] },
    { required: true, enumValues: [true, false] },
  ])(
    'shows boolean descriptions once for required=$required enum=$enumValues',
    async ({ required, enumValues }) => {
      mockToolsList.mockResolvedValue({
        tools: [
          {
            name: 'toggle',
            inputSchema: {
              type: 'object',
              properties: {
                enabled: {
                  type: 'boolean',
                  enum: enumValues,
                  description: 'Enable detailed output',
                },
              },
              required: required ? ['enabled'] : [],
            },
          },
        ],
      });
      mockExtensions = [readyExtension];
      render(<MCPInspectorPage />);
      await connectToGateway();
      pickTool('toggle', /toggle/);
      expect(screen.getAllByText('Enable detailed output')).toHaveLength(1);
    },
  );

  it('allows connecting when server registration metadata is unavailable', async () => {
    mockRegistrationsError = new Error('Access denied');
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);
    expect(screen.getByText('MCP server names are unavailable')).toBeInTheDocument();
    await connectToGateway();
    expect(screen.getByLabelText('Search tools')).toBeInTheDocument();
  });

  it('invalidates an expired session and reconnects to the same gateway', async () => {
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);
    await connectToGateway();
    mockToolsList.mockRejectedValueOnce(new MCPSessionExpiredError());
    fireEvent.click(screen.getByRole('button', { name: 'Refresh tools' }));
    await screen.findByText('Session expired, reconnect');
    expect(screen.queryByText('Connected', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh tools' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    await screen.findByText('Connected', { exact: true });
    expect(MCPClient).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Session expired, reconnect')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh tools' })).toBeEnabled();
  });

  it.each(['tool', 'prompt', 'tools refresh', 'prompts refresh'])(
    'requests replacement credentials after a 401 during %s',
    async (operation) => {
      mockExtensions = [readyExtension];
      render(<MCPInspectorPage />);
      await connectToGateway();
      if (operation.startsWith('prompt')) {
        fireEvent.click(screen.getByRole('tab', { name: 'Prompts' }));
      }
      if (operation === 'tool') {
        mockToolsCallWithDetails.mockRejectedValueOnce(new MCPUnauthorizedError());
        pickTool('greet', /toystore_greet/);
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
        fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));
      } else if (operation === 'prompt') {
        mockPromptsGetWithDetails.mockRejectedValueOnce(new MCPUnauthorizedError());
        fireEvent.change(screen.getByLabelText('Search prompts'), { target: { value: 'greet' } });
        fireEvent.click(screen.getByRole('option', { name: /toystore_greet/ }));
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
        fireEvent.click(screen.getByRole('button', { name: 'Generate prompt' }));
      } else {
        (operation === 'tools refresh' ? mockToolsList : mockPromptsList).mockRejectedValueOnce(
          new MCPUnauthorizedError(),
        );
        fireEvent.click(
          screen.getByRole('button', {
            name: operation === 'tools refresh' ? 'Refresh tools' : 'Refresh prompts',
          }),
        );
      }
      await screen.findByRole('dialog', { name: 'Authentication required' });
      expect(screen.getByLabelText('Bearer token')).toHaveValue('');
      expect(screen.queryByText('Request failed')).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Bearer token'), { target: { value: 'replacement' } });
      fireEvent.click(screen.getByRole('button', { name: 'Connect with bearer token' }));
      await screen.findByText('Connected', { exact: true });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(MCPClient).toHaveBeenLastCalledWith(expect.any(String), {
        token: 'replacement',
        protocolMode: 'auto',
      });
    },
  );

  it('preserves omission, false and true for an optional boolean', async () => {
    mockToolsList.mockResolvedValue({
      tools: [
        {
          name: 'toggle',
          inputSchema: { type: 'object', properties: { enabled: { type: 'boolean' } } },
        },
      ],
    });
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);
    await connectToGateway();
    pickTool('toggle', /toggle/);
    for (const [index, [value, args]] of [
      ['', {}],
      ['false', { enabled: false }],
      ['true', { enabled: true }],
      ['', {}],
    ].entries()) {
      if (index > 0) fireEvent.change(screen.getByLabelText('Enabled'), { target: { value } });
      fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));
      await waitFor(() =>
        expect(mockToolsCallWithDetails).toHaveBeenLastCalledWith('toggle', args),
      );
      await waitFor(() => expect(screen.getByRole('button', { name: 'Run tool' })).toBeEnabled());
    }
  });

  it.each([
    { options: [{ mode: 'a' }, { mode: 'b' }], expected: { mode: 'b' } },
    { options: [1, '1'], expected: '1' },
  ])(
    'preserves the selected enum entry even when labels collide: $options',
    async ({ options, expected }) => {
      mockToolsList.mockResolvedValue({
        tools: [
          {
            name: 'choose',
            inputSchema: { type: 'object', properties: { choice: { enum: options } } },
          },
        ],
      });
      mockExtensions = [readyExtension];
      render(<MCPInspectorPage />);
      await connectToGateway();
      pickTool('choose', /choose/);
      fireEvent.change(screen.getByLabelText('Choice'), { target: { value: '1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));
      await waitFor(() =>
        expect(mockToolsCallWithDetails).toHaveBeenCalledWith('choose', { choice: expected }),
      );
    },
  );

  it('uses structurally equal enum defaults and lets optional selections be cleared', async () => {
    mockToolsList.mockResolvedValue({
      tools: [
        {
          name: 'choose',
          inputSchema: {
            type: 'object',
            properties: {
              choice: { enum: [{ a: 1, b: 2 }], default: { b: 2, a: 1 } },
            },
          },
        },
      ],
    });
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);
    await connectToGateway();
    pickTool('choose', /choose/);
    expect(screen.getByLabelText('Choice')).toHaveValue('0');
    fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));
    await waitFor(() =>
      expect(mockToolsCallWithDetails).toHaveBeenLastCalledWith('choose', {
        choice: { a: 1, b: 2 },
      }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run tool' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Choice'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));
    await waitFor(() => expect(mockToolsCallWithDetails).toHaveBeenLastCalledWith('choose', {}));
  });

  it.each([true, false])('preserves an optional boolean default of %s', async (value) => {
    mockToolsList.mockResolvedValue({
      tools: [
        {
          name: 'toggle',
          inputSchema: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean', default: value },
            },
          },
        },
      ],
    });
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);
    await connectToGateway();
    pickTool('toggle', /toggle/);
    fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));
    await waitFor(() =>
      expect(mockToolsCallWithDetails).toHaveBeenCalledWith('toggle', { enabled: value }),
    );
  });

  it('reopens authentication when a retained bearer token fails during protocol reconnect', async () => {
    (MCPClient as jest.Mock).mockImplementationOnce(() => ({
      connect: jest.fn().mockRejectedValue(new MCPUnauthorizedError()),
    }));
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);
    fireEvent.change(screen.getByLabelText('Select an MCP gateway extension'), {
      target: { value: 'test-ns/mcp-gateway' },
    });
    await screen.findByRole('dialog', { name: 'Authentication required' });
    fireEvent.change(screen.getByLabelText('Bearer token'), { target: { value: 'old-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect with bearer token' }));
    await screen.findByText('Connected', { exact: true });
    (MCPClient as jest.Mock).mockImplementationOnce(() => ({
      connect: jest.fn().mockRejectedValue(new MCPUnauthorizedError()),
    }));
    fireEvent.change(screen.getByLabelText('MCP protocol'), { target: { value: '2025-11-25' } });
    await screen.findByRole('dialog', { name: 'Authentication required' });
    expect(screen.getByText('Invalid bearer token')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Bearer token'), { target: { value: 'new-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect with bearer token' }));
    await screen.findByText('Connected', { exact: true });
    expect(MCPClient).toHaveBeenLastCalledWith(expect.any(String), {
      token: 'new-token',
      protocolMode: '2025-11-25',
    });
  });

  it('guides the user to select a gateway before showing inspector tools', () => {
    render(<MCPInspectorPage />);

    expect(screen.getByRole('heading', { name: 'No connection' })).toBeInTheDocument();
    expect(
      screen.getByText('Connect to a Gateway to view the MCP server tools available.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run tool' })).not.toBeInTheDocument();
  });

  it('reconnects in the selected protocol and ignores a late result from the previous catalog', async () => {
    let finishCall: (exchange: unknown) => void = () => undefined;
    mockToolsCallWithDetails.mockReturnValueOnce(
      new Promise((resolve) => {
        finishCall = resolve;
      }),
    );
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);
    await connectToGateway();
    pickTool('greet', /toystore_greet/);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));

    (MCPClient as jest.Mock).mockImplementationOnce(() => ({
      connect: jest.fn().mockResolvedValue({ protocolVersion: '2026-07-28', sessionId: null }),
      toolsList: jest.fn().mockResolvedValue({ tools: [{ name: 'modern_tool' }] }),
      promptsList: jest.fn().mockResolvedValue({ prompts: [] }),
    }));
    fireEvent.change(screen.getByLabelText('MCP protocol'), { target: { value: '2026-07-28' } });
    await waitFor(() => expect(screen.getByText(/Protocol: 2026-07-28/)).toBeInTheDocument());
    expect(screen.queryByText('session-1')).not.toBeInTheDocument();
    expect(screen.getByText(/Stateless/)).toBeInTheDocument();
    expect(MCPClient).toHaveBeenLastCalledWith(expect.any(String), {
      token: undefined,
      protocolMode: '2026-07-28',
    });
    await act(async () =>
      finishCall({ result: { content: [{ type: 'text', text: 'stale result' }] } }),
    );
    expect(screen.getByText('0 requests')).toBeInTheDocument();
    expect(screen.queryByText('stale result')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search tools'), { target: { value: 'modern' } });
    expect(screen.getByRole('option', { name: /modern_tool/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search tools'), { target: { value: 'greet' } });
    expect(screen.queryByRole('option', { name: /toystore_greet/ })).not.toBeInTheDocument();
  });

  it('keeps the prompts section selected when changing protocol', async () => {
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);
    await connectToGateway();

    fireEvent.click(screen.getByRole('tab', { name: 'Prompts' }));
    expect(screen.getByLabelText('Search prompts')).toBeInTheDocument();

    (MCPClient as jest.Mock).mockImplementationOnce(() => ({
      connect: jest.fn().mockResolvedValue({ protocolVersion: '2026-07-28', sessionId: null }),
      toolsList: jest.fn().mockResolvedValue({ tools: [] }),
      promptsList: jest.fn().mockResolvedValue({ prompts: [] }),
    }));
    fireEvent.change(screen.getByLabelText('MCP protocol'), { target: { value: '2026-07-28' } });

    await waitFor(() => expect(screen.getByText(/Protocol: 2026-07-28/)).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: 'Prompts' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Search prompts')).toBeInTheDocument();
  });

  it.each(['tool', 'prompt'])(
    'shows an incomplete %s result without claiming completion',
    async (kind) => {
      const incomplete = {
        result: { resultType: 'input_required', requestState: 'opaque' },
        request: {
          jsonrpc: '2.0',
          id: 3,
          method: kind === 'tool' ? 'tools/call' : 'prompts/get',
          params: {},
        },
        response: {
          jsonrpc: '2.0',
          id: 3,
          result: { resultType: 'input_required', requestState: 'opaque' },
        },
        status: 200,
        statusText: 'OK',
        durationMs: 1,
      };
      mockToolsCallWithDetails.mockResolvedValueOnce(incomplete);
      mockPromptsGetWithDetails.mockResolvedValueOnce(incomplete);
      mockExtensions = [readyExtension];
      render(<MCPInspectorPage />);
      await connectToGateway();
      if (kind === 'tool') {
        pickTool('greet', /toystore_greet/);
      } else {
        fireEvent.click(screen.getByRole('tab', { name: 'Prompts' }));
        fireEvent.change(screen.getByLabelText('Search prompts'), { target: { value: 'greet' } });
        fireEvent.click(screen.getByRole('option', { name: /toystore_greet/ }));
      }
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
      fireEvent.click(
        screen.getByRole('button', { name: kind === 'tool' ? 'Run tool' : 'Generate prompt' }),
      );
      await waitFor(() => expect(screen.getByText('Input required')).toBeInTheDocument());
      expect(screen.queryByText('Success')).not.toBeInTheDocument();
      expect(screen.getByText('1 warning')).toBeInTheDocument();
      expect(screen.getByText('This request is incomplete.')).toBeInTheDocument();
    },
  );

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
      connect: jest.fn().mockRejectedValue(new MCPUnauthorizedError()),
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
      { token: 'test-token', protocolMode: 'auto' },
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explains when a bearer token is rejected and allows another attempt', async () => {
    (MCPClient as jest.Mock)
      .mockImplementationOnce(() => ({
        connect: jest.fn().mockRejectedValue(new MCPUnauthorizedError()),
      }))
      .mockImplementationOnce(() => ({
        connect: jest.fn().mockRejectedValue(new MCPUnauthorizedError()),
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
    let finishFirst: (connection: MCPConnection) => void = () => undefined;
    const firstInitialize = new Promise<MCPConnection>((resolve) => {
      finishFirst = resolve;
    });
    const firstToolsList = jest.fn().mockResolvedValue({ tools: [{ name: 'first_tool' }] });
    const firstPromptsList = jest.fn().mockResolvedValue({ prompts: [] });
    (MCPClient as jest.Mock).mockImplementationOnce(() => ({
      connect: jest.fn().mockReturnValue(firstInitialize),
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

    finishFirst({ protocolVersion: '2025-11-25', sessionId: 'session-stale' });
    await waitFor(() => expect(firstPromptsList).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Search tools'), { target: { value: 'first' } });
    expect(screen.queryByRole('option', { name: /first_tool/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search tools'), { target: { value: 'greet' } });
    expect(screen.getByRole('option', { name: /toystore_greet/ })).toBeInTheDocument();
    expect(MCPClient).toHaveBeenLastCalledWith(
      '/api/proxy/plugin/kuadrant-console-plugin/backend/api/mcp/v1/mcpgatewayextensions/test-ns/other-gateway',
      { token: undefined, protocolMode: 'auto' },
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

    fireEvent.change(screen.getByLabelText('Enabled'), { target: { value: '0' } });
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
