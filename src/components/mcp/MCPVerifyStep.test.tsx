import * as React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, configure } from '@testing-library/react';
import { MCPWizardFormState, initialFormState } from './types';

configure({ testIdAttribute: 'data-test' });

const mockNavigate = jest.fn();
const mockK8sCreate = jest.fn(() => Promise.resolve({}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('react-router-dom-v5-compat', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  k8sCreate: (...args: unknown[]) => mockK8sCreate(...args),
  useK8sWatchResource: () => [null, false, null],
}));

jest.mock('../../utils/getModelFromResource', () => ({
  getModelFromResource: (r: { apiVersion: string; kind: string }) => ({
    apiVersion: r.apiVersion,
    kind: r.kind,
  }),
}));

import MCPVerifyStep from './MCPVerifyStep';

describe('MCPVerifyStep', () => {
  const baseFormState: MCPWizardFormState = {
    ...initialFormState,
    gatewayMode: 'existing',
    selectedGatewayName: 'my-gw',
    selectedGatewayNamespace: 'test-ns',
    routeMode: 'existing',
    selectedRouteName: 'my-route',
    extensionName: 'my-ext',
    extensionNamespace: 'test-ns',
    targetGateway: 'my-gw',
    sectionName: 'http',
  };

  const defaultProps = {
    formState: baseFormState,
    selectedNamespace: 'test-ns',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the verify heading', () => {
    render(<MCPVerifyStep {...defaultProps} />);
    expect(screen.getByRole('heading', { name: 'Verify configuration' })).toBeInTheDocument();
  });

  it('renders the description text', () => {
    render(<MCPVerifyStep {...defaultProps} />);
    expect(
      screen.getByText(
        'Creating and verifying your MCP infrastructure. You can navigate away at any time — resources that have been created will persist.',
      ),
    ).toBeInTheDocument();
  });

  it('renders the View in overview button', () => {
    render(<MCPVerifyStep {...defaultProps} />);
    expect(screen.getByTestId('mcp-view-overview-button')).toBeInTheDocument();
  });

  it('navigates to overview on button click', () => {
    render(<MCPVerifyStep {...defaultProps} />);
    screen.getByTestId('mcp-view-overview-button').click();
    expect(mockNavigate).toHaveBeenCalledWith('/kuadrant/mcp/overview');
  });

  it('shows no reference grant needed when same namespace', async () => {
    render(<MCPVerifyStep {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('No reference grant needed')).toBeInTheDocument();
    });
  });

  it('creates MCPGatewayExtension for existing gateway and route', async () => {
    render(<MCPVerifyStep {...defaultProps} />);
    await waitFor(() => {
      expect(mockK8sCreate).toHaveBeenCalled();
    });

    // Should create exactly one resource (MCPGatewayExtension only, no new gateway/route)
    expect(mockK8sCreate).toHaveBeenCalledTimes(1);
    const createCall = mockK8sCreate.mock.calls[0][0];
    expect(createCall.data.kind).toBe('MCPGatewayExtension');
    expect(createCall.data.metadata.name).toBe('my-ext');
    expect(createCall.data.metadata.namespace).toBe('test-ns');
    expect(createCall.data.spec.targetRef.name).toBe('my-gw');
    expect(createCall.data.spec.targetRef.sectionName).toBe('http');
  });

  it('creates Gateway when mode is new', async () => {
    const newGateway = {
      apiVersion: 'gateway.networking.k8s.io/v1',
      kind: 'Gateway',
      metadata: { name: 'new-gw', namespace: 'test-ns' },
      spec: { gatewayClassName: 'istio', listeners: [] },
    };

    render(
      <MCPVerifyStep
        {...defaultProps}
        formState={{ ...baseFormState, gatewayMode: 'new', newGatewayName: 'new-gw' }}
        newGatewayResource={newGateway}
      />,
    );

    await waitFor(() => {
      expect(mockK8sCreate).toHaveBeenCalledTimes(2); // Gateway + MCPGatewayExtension
    });

    const gatewayCall = mockK8sCreate.mock.calls[0][0];
    expect(gatewayCall.data.kind).toBe('Gateway');
  });

  it('creates ReferenceGrant when cross-namespace', async () => {
    const crossNsFormState: MCPWizardFormState = {
      ...baseFormState,
      extensionNamespace: 'mcp-ns',
      selectedGatewayNamespace: 'gateway-ns',
    };

    render(
      <MCPVerifyStep
        {...defaultProps}
        formState={crossNsFormState}
      />,
    );

    await waitFor(() => {
      expect(mockK8sCreate).toHaveBeenCalledTimes(2); // ReferenceGrant + MCPGatewayExtension
    });

    const refGrantCall = mockK8sCreate.mock.calls[0][0];
    expect(refGrantCall.data.kind).toBe('ReferenceGrant');
    expect(refGrantCall.data.metadata.namespace).toBe('gateway-ns');
    expect(refGrantCall.data.spec.from[0].namespace).toBe('mcp-ns');
  });

  it('shows error alert when resource creation fails', async () => {
    mockK8sCreate.mockRejectedValueOnce(new Error('Forbidden'));

    render(<MCPVerifyStep {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Error creating resources')).toBeInTheDocument();
      // "Forbidden" appears in both the check list and the error alert
      expect(screen.getAllByText('Forbidden').length).toBeGreaterThan(0);
    });
  });

  it('creates HTTPRoute when mode is new', async () => {
    const newRoute = {
      apiVersion: 'gateway.networking.k8s.io/v1',
      kind: 'HTTPRoute',
      metadata: { name: 'new-route', namespace: 'test-ns' },
      spec: { parentRefs: [{ name: 'my-gw' }], rules: [] },
    };

    render(
      <MCPVerifyStep
        {...defaultProps}
        formState={{ ...baseFormState, routeMode: 'new', newRouteName: 'new-route' }}
        newRouteResource={newRoute}
      />,
    );

    await waitFor(() => {
      expect(mockK8sCreate).toHaveBeenCalledTimes(2); // HTTPRoute + MCPGatewayExtension
    });

    const routeCall = mockK8sCreate.mock.calls[0][0];
    expect(routeCall.data.kind).toBe('HTTPRoute');
  });
});
