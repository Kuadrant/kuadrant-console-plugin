import * as React from 'react';
import '@testing-library/jest-dom';
import { render, fireEvent, configure } from '@testing-library/react';
import { MCPServerFormState, initialServerFormState } from '../types';

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

  it('hides the namespace field when credentialNamespace is supplied (external wizard usage)', () => {
    const { container } = render(
      <RegisterServerStep
        formState={initialServerFormState}
        onChange={jest.fn()}
        routeName="route-a"
        credentialNamespace="cred-ns"
      />,
    );

    expect(container.querySelector('#server-namespace')).not.toBeInTheDocument();
  });

  it('shows the namespace field when no credentialNamespace is supplied (internal wizard usage)', () => {
    const { container } = render(
      <RegisterServerStep
        formState={initialServerFormState}
        onChange={jest.fn()}
        routeName="route-a"
      />,
    );

    expect(container.querySelector('#server-namespace')).toBeInTheDocument();
  });

  // Wrapper mirroring how MCPExternalRegistrationWizard wires RegisterServerStep: the
  // wizard's own state is the single source of truth and is fed back in as props.
  const ControlledRegisterServerStep: React.FC<{
    routeName?: string;
    credentialNamespace?: string;
    onValidationChange: (isValid: boolean) => void;
  }> = ({ routeName, credentialNamespace, onValidationChange }) => {
    const [formState, setFormState] = React.useState<MCPServerFormState>(initialServerFormState);
    return (
      <RegisterServerStep
        formState={formState}
        onChange={setFormState}
        routeName={routeName}
        credentialNamespace={credentialNamespace}
        onValidationChange={onValidationChange}
      />
    );
  };

  it('becomes valid once registrationName and toolPrefix are filled, mirroring the external wizard flow', () => {
    const onValidationChange = jest.fn();
    const { container } = render(
      <ControlledRegisterServerStep
        routeName="route-a"
        credentialNamespace="cred-ns"
        onValidationChange={onValidationChange}
      />,
    );

    const nameInput = container.querySelector('[data-test="mcp-registration-name"]');
    const prefixInput = container.querySelector('[data-test="mcp-registration-prefix"]');
    expect(nameInput).toBeInTheDocument();
    expect(prefixInput).toBeInTheDocument();

    fireEvent.change(nameInput as Element, { target: { value: 'my-registration' } });
    fireEvent.change(prefixInput as Element, { target: { value: 'mcp' } });

    expect(onValidationChange).toHaveBeenLastCalledWith(true);
  });
});
