import * as React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, configure } from '@testing-library/react';

configure({ testIdAttribute: 'data-test' });

const mockNavigate = jest.fn();

// Configurable watch result for the extensions resource: [data, loaded, error].
// The first useK8sWatchResource call in the component is for extensions.
let mockExtensionsWatch: [unknown, boolean, unknown] = [[], true, null];

// Configurable RBAC map returned by useAccessReviews.
let mockUserRBAC: Record<string, boolean> = {};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ ns: 'test-ns' }),
}));

jest.mock('react-helmet', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@openshift-console/dynamic-plugin-sdk', () => {
  let callIndex = 0;
  return {
    useK8sWatchResource: () => {
      // The component calls this for extensions first, then gateways, then servers.
      const isExtensionsCall = callIndex % 3 === 0;
      callIndex += 1;
      return isExtensionsCall ? mockExtensionsWatch : [[], true, null];
    },
    NamespaceBar: () => <div data-test="namespace-bar" />,
    ResourceLink: ({ name }: { name: string }) => <span>{name}</span>,
    GreenCheckCircleIcon: () => <span>check</span>,
    YellowExclamationTriangleIcon: () => <span>warning</span>,
    k8sCreate: jest.fn(() => Promise.resolve({})),
    useActiveNamespace: () => ['test-ns', jest.fn()],
  };
});

jest.mock('@patternfly/react-table', () => ({
  sortable: jest.fn(),
}));

jest.mock('../../hooks/useKuadrantNamespaceChange', () => ({
  useKuadrantNamespaceChange: () => ({
    handleNamespaceChange: jest.fn(),
    activeNamespace: 'test-ns',
  }),
}));

jest.mock('../../utils/resourceRBAC', () => ({
  __esModule: true,
  default: () => ({ userRBAC: mockUserRBAC, loading: false }),
}));

jest.mock('../../utils/getModelFromResource', () => ({
  getResourceNameFromKind: (kind: string) => kind.toLowerCase() + 's',
}));

jest.mock('../ResourceList', () => ({
  __esModule: true,
  default: () => <div data-test="resource-list">ResourceList</div>,
}));

jest.mock('./MCPRegistrationWizard', () => ({
  __esModule: true,
  default: () => null,
}));

import MCPOverviewPage from './MCPOverviewPage';

describe('MCPOverviewPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    // Default: user can list extensions, no extensions exist, no error.
    mockExtensionsWatch = [[], true, null];
    mockUserRBAC = { 'mcpgatewayextensions-list': true };
  });

  it('renders the empty state when no extensions exist', () => {
    render(<MCPOverviewPage />);
    expect(screen.getByRole('heading', { name: 'MCP management' })).toBeInTheDocument();
  });

  it('renders the Get started empty state heading', () => {
    render(<MCPOverviewPage />);
    const headings = screen.getAllByRole('heading', { name: 'Get started' });
    expect(headings.length).toBeGreaterThan(0);
  });

  it('renders the description text', () => {
    render(<MCPOverviewPage />);
    expect(
      screen.getByText(
        'Set up your MCP infrastructure by creating a gateway, route, and MCP extension. Use the setup wizard to get started quickly.',
      ),
    ).toBeInTheDocument();
  });

  it('renders the setup wizard button', () => {
    render(<MCPOverviewPage />);
    const button = screen.getByTestId('mcp-setup-wizard-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('MCP gateway setup wizard');
  });

  it('navigates to the setup wizard on button click', () => {
    render(<MCPOverviewPage />);
    fireEvent.click(screen.getByTestId('mcp-setup-wizard-button'));
    expect(mockNavigate).toHaveBeenCalledWith('/kuadrant/mcp/setup-wizard');
  });

  it('renders Access Denied when the user cannot list extensions', () => {
    mockUserRBAC = {};
    render(<MCPOverviewPage />);
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(
      screen.getByText('You do not have permission to view MCP Gateway Extensions'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('mcp-setup-wizard-button')).not.toBeInTheDocument();
  });

  it('renders an error alert when the extensions watch fails', () => {
    mockExtensionsWatch = [[], true, { message: 'boom' }];
    render(<MCPOverviewPage />);
    expect(screen.getByText('Error loading MCP Gateway Extensions')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.queryByTestId('mcp-setup-wizard-button')).not.toBeInTheDocument();
  });

  it('renders an error alert when the watch errors with stale extensions', () => {
    // Non-empty result plus an error must still surface the error state,
    // not the overview built from stale data.
    mockExtensionsWatch = [
      [{ metadata: { name: 'stale-ext', namespace: 'test-ns' } }],
      true,
      { message: 'stale watch failed' },
    ];
    render(<MCPOverviewPage />);
    expect(screen.getByText('Error loading MCP Gateway Extensions')).toBeInTheDocument();
    expect(screen.getByText('stale watch failed')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'MCP management overview' }),
    ).not.toBeInTheDocument();
  });
});
