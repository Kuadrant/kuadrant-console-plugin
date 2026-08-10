import * as React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, configure } from '@testing-library/react';

configure({ testIdAttribute: 'data-test' });

const mockNavigate = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('react-helmet', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import MCPOverviewPage from './MCPOverviewPage';

describe('MCPOverviewPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders the page heading', () => {
    render(<MCPOverviewPage />);
    expect(screen.getByRole('heading', { name: 'MCP Management' })).toBeInTheDocument();
  });

  it('renders the Get started empty state heading', () => {
    render(<MCPOverviewPage />);
    // PF6 EmptyState wraps titleText in its own h1, so multiple headings match
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
});
