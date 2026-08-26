import * as React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MCPGatewayExtension } from './types';
import { MCPClient, MCPUnauthorizedError } from '../../utils/mcp/client';

let mockExtensions: MCPGatewayExtension[] = [];
let mockExtensionsLoaded = true;
let mockToolsCallWithDetails = jest.fn();
let mockToolsList = jest.fn();

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
  useK8sWatchResource: () => [mockExtensions, mockExtensionsLoaded, null],
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

describe('MCPInspectorPage', () => {
  beforeEach(() => {
    mockExtensions = [];
    mockExtensionsLoaded = true;
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
    (MCPClient as jest.Mock).mockReset();
    (MCPClient as jest.Mock).mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue({
        result: {
          protocolVersion: '2025-11-25',
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
        sessionId: 'session-1',
      }),
      sendInitialized: jest.fn().mockResolvedValue(undefined),
      toolsList: mockToolsList,
      toolsCallWithDetails: mockToolsCallWithDetails,
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
    expect(screen.getAllByText('toystore_greet').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Bearer token (optional)')).not.toBeInTheDocument();
    expect(screen.getByText('0 requests')).toBeInTheDocument();
    expect(screen.getByText('0 warnings')).toBeInTheDocument();
    expect(screen.getByText('0 errors')).toBeInTheDocument();
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('offers an in-memory bearer token after an authentication challenge', async () => {
    (MCPClient as jest.Mock).mockImplementationOnce(() => ({
      initialize: jest
        .fn()
        .mockRejectedValue(
          new MCPUnauthorizedError(
            'Bearer resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource/mcp"',
          ),
        ),
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

  it('builds and validates a tool form from its input schema before running it', async () => {
    mockExtensions = [readyExtension];
    render(<MCPInspectorPage />);

    fireEvent.change(screen.getByLabelText('Select an MCP gateway extension'), {
      target: { value: 'test-ns/mcp-gateway' },
    });
    await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Search tools'), { target: { value: 'greet' } });
    fireEvent.click(screen.getByRole('button', { name: /toystore_greet/ }));

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
    fireEvent.click(screen.getByRole('button', { name: /toystore_greet/ }));
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

    await waitFor(() => expect(screen.getByText('toystore_calculate')).toBeInTheDocument());
    expect(mockToolsList).toHaveBeenCalledTimes(2);
    expect(MCPClient).toHaveBeenCalledTimes(1);
  });
});
