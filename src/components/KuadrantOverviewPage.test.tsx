import * as React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusLegend, ErrorCodeLabel, Distribution } from './KuadrantOverviewPage';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // key passthrough with basic {{var}} interpolation
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? key.replace(/{{(\w+)}}/g, (_, name) => String(opts[name])) : key,
  }),
}));

// regression tests for #631: popovers must survive parent re-renders
// triggered by background data refreshes

describe('StatusLegend', () => {
  it('keeps the popover open across parent re-renders', async () => {
    const Wrapper: React.FC<{ tick: number }> = ({ tick }) => (
      <div data-tick={tick}>
        <StatusLegend />
      </div>
    );
    const { rerender } = render(<Wrapper tick={0} />);

    fireEvent.mouseEnter(screen.getByLabelText('Status help'));
    expect(await screen.findByText('Enforced')).toBeInTheDocument();

    rerender(<Wrapper tick={1} />);

    expect(screen.getByText('Enforced')).toBeInTheDocument();
  });
});

describe('ErrorCodeLabel', () => {
  const initialDistribution: Array<[string, Distribution]> = [
    ['404', { total: 3, percent: 75 }],
    ['403', { total: 1, percent: 25 }],
  ];
  const updatedDistribution: Array<[string, Distribution]> = [
    ['404', { total: 6, percent: 60 }],
    ['410', { total: 4, percent: 40 }],
  ];

  it('keeps the popover open and shows refreshed data across parent re-renders', async () => {
    const Wrapper: React.FC<{ distribution: Array<[string, Distribution]> }> = ({
      distribution,
    }) => (
      <div>
        <ErrorCodeLabel codeGroup="4xx" distribution={distribution} />
      </div>
    );
    const { rerender } = render(<Wrapper distribution={initialDistribution} />);

    fireEvent.click(screen.getByText(/4xx/));
    expect(await screen.findByText('Error Code')).toBeInTheDocument();
    expect(screen.getByText('Code: 404')).toBeInTheDocument();
    expect(screen.getByText('3 requests')).toBeInTheDocument();
    expect(screen.getByText('Code: 403')).toBeInTheDocument();

    rerender(<Wrapper distribution={updatedDistribution} />);

    expect(screen.getByText('Error Code')).toBeInTheDocument();
    expect(screen.getByText('6 requests')).toBeInTheDocument();
    expect(screen.getByText('Code: 410')).toBeInTheDocument();
    expect(screen.queryByText('Code: 403')).not.toBeInTheDocument();
  });
});

/*
 * Note: Namespace transition and RBAC redirect logic testing
 *
 * The namespace transition logic (redirect effect at KuadrantOverviewPage.tsx:320-360)
 * is covered by E2E tests in e2e/tests/rbac.spec.ts which verify:
 * - Users with cluster access stay on /all-namespaces
 * - Users without cluster access redirect to /ns/<namespace>
 * - Redirect only happens once (no loops)
 * - Both light and dark theme compatibility
 *
 * Unit testing this logic requires mocking extensive OpenShift Console SDK dependencies
 * (PrometheusEndpoint, useK8sWatchResource, checkAccess, etc.) which would create brittle
 * tests. The E2E tests provide better coverage by testing actual user workflows.
 */
