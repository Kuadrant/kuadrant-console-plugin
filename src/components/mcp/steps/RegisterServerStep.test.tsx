import * as React from 'react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { MCPServerFormState, initialServerFormState } from '../types';

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
  useK8sWatchResource: () => [null, false, null],
}));

import RegisterServerStep from './RegisterServerStep';

describe('RegisterServerStep', () => {
  const baseFormState: MCPServerFormState = {
    ...initialServerFormState,
    namespace: 'test-ns',
  };

  it('populates targetHTTPRouteName from routeName on initial mount', () => {
    const onChange = jest.fn();
    render(
      <RegisterServerStep formState={baseFormState} onChange={onChange} routeName="route-a" />,
    );

    expect(onChange).toHaveBeenCalledWith({ ...baseFormState, targetHTTPRouteName: 'route-a' });
  });

  it('re-syncs targetHTTPRouteName when routeName changes after an earlier selection', () => {
    const onChange = jest.fn();
    const formStateWithRouteA: MCPServerFormState = {
      ...baseFormState,
      targetHTTPRouteName: 'route-a',
    };

    const { rerender: rerenderComponent } = render(
      <RegisterServerStep
        formState={formStateWithRouteA}
        onChange={onChange}
        routeName="route-a"
      />,
    );
    expect(onChange).not.toHaveBeenCalled();

    // User goes back to step 1 and selects a different route.
    rerenderComponent(
      <RegisterServerStep
        formState={formStateWithRouteA}
        onChange={onChange}
        routeName="route-b"
      />,
    );

    expect(onChange).toHaveBeenCalledWith({
      ...formStateWithRouteA,
      targetHTTPRouteName: 'route-b',
    });
  });

  it('does not resync when targetHTTPRouteName already matches routeName', () => {
    const onChange = jest.fn();
    const formState: MCPServerFormState = { ...baseFormState, targetHTTPRouteName: 'route-a' };

    render(<RegisterServerStep formState={formState} onChange={onChange} routeName="route-a" />);

    expect(onChange).not.toHaveBeenCalled();
  });
});
