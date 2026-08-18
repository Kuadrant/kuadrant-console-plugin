import * as React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, configure } from '@testing-library/react';
import { VerifyStepItem, WatchResourceConfig } from './MCPVerifyStep';
import { RESOURCES } from '../../utils/resources';

configure({ testIdAttribute: 'data-test' });

const mockNavigate = jest.fn();
const mockK8sCreate = jest.fn((_opts?: unknown) => Promise.resolve({}));
const mockK8sDelete = jest.fn((_opts?: unknown) => Promise.resolve({}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  k8sCreate: (opts: unknown) => mockK8sCreate(opts),
  k8sDelete: (opts: unknown) => mockK8sDelete(opts),
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
  const extensionResource = {
    apiVersion: 'mcp.kuadrant.io/v1',
    kind: 'MCPGatewayExtension',
    metadata: { name: 'my-ext', namespace: 'test-ns' },
    spec: {
      targetRef: {
        group: 'gateway.networking.k8s.io',
        kind: 'Gateway',
        name: 'my-gw',
        namespace: 'test-ns',
        sectionName: 'http',
      },
    },
  };

  const baseItems: VerifyStepItem[] = [
    {
      type: 'info',
      id: 'ref-grant-check',
      label: 'ReferenceGrant check',
      message: 'No reference grant needed',
    },
    {
      type: 'create',
      id: 'create-extension',
      label: 'Create MCPGatewayExtension',
      resource: extensionResource,
      successMessage: 'MCPGatewayExtension created successfully',
    },
  ];

  const baseWatchResource: WatchResourceConfig = {
    gvk: RESOURCES.MCPGatewayExtension.gvk,
    name: 'my-ext',
    namespace: 'test-ns',
  };

  const defaultProps = {
    items: baseItems,
    watchResource: baseWatchResource,
    selectedNamespace: 'test-ns',
    title: 'Verify configuration',
    description:
      'Creating and verifying your MCP infrastructure. You can navigate away at any time — resources that have been created will persist.',
    watchLabel: 'MCP Extension is ready',
    watchSuccessMessage: 'MCP Extension is running and healthy',
    showOverviewLink: true,
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
    expect(mockNavigate).toHaveBeenCalledWith('/kuadrant/mcp/overview/ns/test-ns');
  });

  it('shows no reference grant needed for info check items', async () => {
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

    expect(mockK8sCreate).toHaveBeenCalledTimes(1);
    const createCall = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockK8sCreate.mock.calls as any[][])[0][0];
    expect(createCall.data.kind).toBe('MCPGatewayExtension');
    expect(createCall.data.metadata.name).toBe('my-ext');
    expect(createCall.data.metadata.namespace).toBe('test-ns');
    expect(createCall.data.spec.targetRef.name).toBe('my-gw');
    expect(createCall.data.spec.targetRef.sectionName).toBe('http');
  });

  it('creates Gateway when included in items', async () => {
    const newGateway = {
      apiVersion: 'gateway.networking.k8s.io/v1',
      kind: 'Gateway',
      metadata: { name: 'new-gw', namespace: 'test-ns' },
      spec: { gatewayClassName: 'istio', listeners: [] },
    };

    const items: VerifyStepItem[] = [
      {
        type: 'create',
        id: 'create-gateway',
        label: 'Create Gateway',
        resource: newGateway,
        successMessage: 'Gateway created successfully',
      },
      ...baseItems,
    ];

    render(<MCPVerifyStep {...defaultProps} items={items} />);

    await waitFor(() => {
      expect(mockK8sCreate).toHaveBeenCalledTimes(2);
    });

    const gatewayCall = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockK8sCreate.mock.calls as any[][])[0][0];
    expect(gatewayCall.data.kind).toBe('Gateway');
  });

  it('creates ReferenceGrant when included in items', async () => {
    const refGrantResource = {
      apiVersion: 'gateway.networking.k8s.io/v1beta1',
      kind: 'ReferenceGrant',
      metadata: { name: 'my-ext-ref-grant', namespace: 'gateway-ns' },
      spec: {
        from: [{ group: 'mcp.kuadrant.io', kind: 'MCPGatewayExtension', namespace: 'mcp-ns' }],
        to: [{ group: 'gateway.networking.k8s.io', kind: 'Gateway', name: 'my-gw' }],
      },
    };

    const items: VerifyStepItem[] = [
      {
        type: 'create',
        id: 'create-ref-grant',
        label: 'Create ReferenceGrant',
        resource: refGrantResource,
        successMessage: 'ReferenceGrant created successfully',
      },
      {
        type: 'create',
        id: 'create-extension',
        label: 'Create MCPGatewayExtension',
        resource: extensionResource,
        successMessage: 'MCPGatewayExtension created successfully',
      },
    ];

    render(<MCPVerifyStep {...defaultProps} items={items} />);

    await waitFor(() => {
      expect(mockK8sCreate).toHaveBeenCalledTimes(2);
    });

    const refGrantCall = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockK8sCreate.mock.calls as any[][])[0][0];
    expect(refGrantCall.data.kind).toBe('ReferenceGrant');
    expect(refGrantCall.data.metadata.namespace).toBe('gateway-ns');
    expect(refGrantCall.data.spec.from[0].namespace).toBe('mcp-ns');
  });

  it('shows error alert when resource creation fails', async () => {
    mockK8sCreate.mockRejectedValueOnce(new Error('Forbidden'));

    render(<MCPVerifyStep {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Error creating resources')).toBeInTheDocument();
      expect(screen.getAllByText('Forbidden').length).toBeGreaterThan(0);
    });
  });

  it('creates HTTPRoute when included in items', async () => {
    const newRoute = {
      apiVersion: 'gateway.networking.k8s.io/v1',
      kind: 'HTTPRoute',
      metadata: { name: 'new-route', namespace: 'test-ns' },
      spec: { parentRefs: [{ name: 'my-gw' }], rules: [] },
    };

    const items: VerifyStepItem[] = [
      {
        type: 'create',
        id: 'create-route',
        label: 'Create HTTPRoute',
        resource: newRoute,
        successMessage: 'HTTPRoute created successfully',
      },
      ...baseItems,
    ];

    render(<MCPVerifyStep {...defaultProps} items={items} />);

    await waitFor(() => {
      expect(mockK8sCreate).toHaveBeenCalledTimes(2);
    });

    const routeCall = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockK8sCreate.mock.calls as any[][])[0][0];
    expect(routeCall.data.kind).toBe('HTTPRoute');
  });

  it('rolls back created resources on failure when rollbackOnFailure is true', async () => {
    mockK8sCreate.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Server error'));

    const routeResource = {
      apiVersion: 'gateway.networking.k8s.io/v1',
      kind: 'HTTPRoute',
      metadata: { name: 'my-route', namespace: 'test-ns' },
      spec: {},
    };

    const serverResource = {
      apiVersion: 'mcp.kuadrant.io/v1',
      kind: 'MCPServerRegistration',
      metadata: { name: 'my-server', namespace: 'test-ns' },
      spec: {},
    };

    const items: VerifyStepItem[] = [
      {
        type: 'create',
        id: 'create-route',
        label: 'Create HTTPRoute',
        resource: routeResource,
        successMessage: 'HTTPRoute created successfully',
      },
      {
        type: 'create',
        id: 'create-server',
        label: 'Create MCPServerRegistration',
        resource: serverResource,
        successMessage: 'MCPServerRegistration created successfully',
      },
    ];

    render(<MCPVerifyStep {...defaultProps} items={items} rollbackOnFailure />);

    await waitFor(() => {
      expect(mockK8sDelete).toHaveBeenCalledTimes(1);
    });

    const deleteCall = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockK8sDelete.mock.calls as any[][])[0][0];
    expect(deleteCall.resource.kind).toBe('HTTPRoute');
  });

  it('does not roll back when rollbackOnFailure is false', async () => {
    mockK8sCreate.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Server error'));

    const items: VerifyStepItem[] = [
      {
        type: 'create',
        id: 'create-a',
        label: 'Create A',
        resource: { apiVersion: 'v1', kind: 'A', metadata: { name: 'a' } },
        successMessage: 'A created',
      },
      {
        type: 'create',
        id: 'create-b',
        label: 'Create B',
        resource: { apiVersion: 'v1', kind: 'B', metadata: { name: 'b' } },
        successMessage: 'B created',
      },
    ];

    render(<MCPVerifyStep {...defaultProps} items={items} />);

    await waitFor(() => {
      expect(screen.getByText('Error creating resources')).toBeInTheDocument();
    });

    expect(mockK8sDelete).not.toHaveBeenCalled();
  });

  it('hides overview link when showOverviewLink is false', () => {
    render(<MCPVerifyStep {...defaultProps} showOverviewLink={false} />);
    expect(screen.queryByTestId('mcp-view-overview-button')).not.toBeInTheDocument();
  });

  it('calls onAllCreated after successful creation', async () => {
    const onAllCreated = jest.fn();

    render(<MCPVerifyStep {...defaultProps} onAllCreated={onAllCreated} />);

    await waitFor(() => {
      expect(onAllCreated).toHaveBeenCalledTimes(1);
    });
  });
});
