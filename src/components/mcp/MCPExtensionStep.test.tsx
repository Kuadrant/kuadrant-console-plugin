import * as React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, configure } from '@testing-library/react';
import { MCPWizardFormState, initialFormState } from './types';

configure({ testIdAttribute: 'data-test' });

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock ResourceYAMLEditor since it depends on the console host
jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  ResourceYAMLEditor: ({ initialResource }: { initialResource: unknown }) => (
    <div data-testid="yaml-editor">{JSON.stringify(initialResource)}</div>
  ),
}));

import MCPExtensionStep from './MCPExtensionStep';

describe('MCPExtensionStep', () => {
  const defaultFormState: MCPWizardFormState = {
    ...initialFormState,
    extensionNamespace: 'test-ns',
    selectedGatewayNamespace: 'test-ns',
  };

  const defaultProps = {
    formState: defaultFormState,
    updateFormState: jest.fn(),
    selectedNamespace: 'test-ns',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the step heading', () => {
    render(<MCPExtensionStep {...defaultProps} />);
    expect(screen.getByRole('heading', { name: 'Configure MCP Extension' })).toBeInTheDocument();
  });

  it('renders Form and YAML tabs', () => {
    render(<MCPExtensionStep {...defaultProps} />);
    expect(screen.getByText('Form')).toBeInTheDocument();
    expect(screen.getByText('YAML')).toBeInTheDocument();
  });

  it('renders the name field', () => {
    render(<MCPExtensionStep {...defaultProps} />);
    expect(screen.getByTestId('mcp-extension-name')).toBeInTheDocument();
  });

  it('renders the namespace field', () => {
    render(<MCPExtensionStep {...defaultProps} />);
    expect(screen.getByTestId('mcp-extension-namespace')).toBeInTheDocument();
  });

  it('renders the target gateway field', () => {
    render(<MCPExtensionStep {...defaultProps} />);
    expect(screen.getByTestId('mcp-target-gateway')).toBeInTheDocument();
  });

  it('calls updateFormState when extension name changes', () => {
    render(<MCPExtensionStep {...defaultProps} />);
    const nameInput = screen.getByTestId('mcp-extension-name');
    fireEvent.change(nameInput, { target: { value: 'my-ext' } });
    expect(defaultProps.updateFormState).toHaveBeenCalledWith({ extensionName: 'my-ext' });
  });

  it('calls updateFormState when namespace changes', () => {
    render(<MCPExtensionStep {...defaultProps} />);
    const nsInput = screen.getByTestId('mcp-extension-namespace');
    fireEvent.change(nsInput, { target: { value: 'other-ns' } });
    expect(defaultProps.updateFormState).toHaveBeenCalledWith({ extensionNamespace: 'other-ns' });
  });

  it('calls updateFormState when target gateway changes', () => {
    render(<MCPExtensionStep {...defaultProps} />);
    const gwInput = screen.getByTestId('mcp-target-gateway');
    fireEvent.change(gwInput, { target: { value: 'my-gw' } });
    expect(defaultProps.updateFormState).toHaveBeenCalledWith({ targetGateway: 'my-gw' });
  });

  it('shows text input for listener name when no gateway is selected', () => {
    render(<MCPExtensionStep {...defaultProps} />);
    expect(screen.getByTestId('mcp-section-name-input')).toBeInTheDocument();
  });

  it('shows dropdown for listener name when gateway has listeners', () => {
    const gateway = {
      apiVersion: 'gateway.networking.k8s.io/v1',
      kind: 'Gateway',
      metadata: { name: 'test-gw', namespace: 'test-ns' },
      spec: {
        gatewayClassName: 'istio',
        listeners: [
          { name: 'http', port: 80, protocol: 'HTTP' },
          { name: 'https', port: 443, protocol: 'HTTPS' },
        ],
      },
    };
    render(<MCPExtensionStep {...defaultProps} selectedGateway={gateway} />);
    expect(screen.getByTestId('mcp-section-name')).toBeInTheDocument();
    // Should have placeholder + 2 listener options
    const options = screen.getByTestId('mcp-section-name').querySelectorAll('option');
    expect(options).toHaveLength(3); // placeholder + http + https
  });

  it('displays pre-populated form values', () => {
    const formState: MCPWizardFormState = {
      ...defaultFormState,
      extensionName: 'existing-ext',
      targetGateway: 'existing-gw',
      sectionName: 'http',
    };
    render(<MCPExtensionStep {...defaultProps} formState={formState} />);
    expect(screen.getByTestId('mcp-extension-name')).toHaveValue('existing-ext');
    expect(screen.getByTestId('mcp-target-gateway')).toHaveValue('existing-gw');
  });

  it('renders helper text for each field', () => {
    render(<MCPExtensionStep {...defaultProps} />);
    expect(
      screen.getByText('A unique name for the MCP gateway extension resource.'),
    ).toBeInTheDocument();
    expect(screen.getByText('The name of the gateway this extension targets.')).toBeInTheDocument();
    expect(
      screen.getByText('The name of the gateway listener to use for MCP traffic.'),
    ).toBeInTheDocument();
  });
});
