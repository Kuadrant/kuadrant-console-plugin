import * as React from 'react';
import '@testing-library/jest-dom';
import { render, screen, configure } from '@testing-library/react';
import { MCPServerFormState, initialServerFormState } from './types';

configure({ testIdAttribute: 'data-test' });

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const useK8sWatchResource = jest.fn((_watchResource: unknown) => [null, false, null]);

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  useK8sWatchResource: (watchResource: unknown) => useK8sWatchResource(watchResource),
}));

import MCPServerRegistrationFormFields from './MCPServerRegistrationFormFields';

describe('MCPServerRegistrationFormFields', () => {
  const formState: MCPServerFormState = { ...initialServerFormState, namespace: 'test-ns' };
  const onChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the Namespace field and watches namespaces when showNamespaceField is true (default)', () => {
    render(<MCPServerRegistrationFormFields formState={formState} onChange={onChange} />);

    expect(screen.getByTestId('mcp-registration-namespace')).toBeInTheDocument();
    expect(useK8sWatchResource).toHaveBeenCalledWith(
      expect.objectContaining({
        groupVersionKind: { group: '', version: 'v1', kind: 'Namespace' },
        isList: true,
      }),
    );
  });

  it('hides the Namespace field and skips the namespace watch when showNamespaceField is false', () => {
    render(
      <MCPServerRegistrationFormFields
        formState={formState}
        onChange={onChange}
        showNamespaceField={false}
      />,
    );

    expect(screen.queryByTestId('mcp-registration-namespace')).not.toBeInTheDocument();
    expect(useK8sWatchResource).toHaveBeenCalledWith(null);
  });
});
