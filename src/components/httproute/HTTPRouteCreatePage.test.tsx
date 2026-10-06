import * as React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Modal, ModalBody, ModalHeader } from '@patternfly/react-core';
import HTTPRouteCreatePage from './HTTPRouteCreatePage';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-router', () => ({
  useLocation: () => ({ pathname: '/kuadrant/mcp/overview/ns/test' }),
  useNavigate: () => jest.fn(),
}));

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  getGroupVersionKindForResource: () => ({
    group: 'gateway.networking.k8s.io',
    version: 'v1',
    kind: 'HTTPRoute',
  }),
  useActiveNamespace: () => ['test'],
  useK8sModel: () => [
    { apiGroup: 'gateway.networking.k8s.io', apiVersion: 'v1', kind: 'HTTPRoute' },
  ],
  useK8sWatchResource: () => [undefined, true, undefined],
}));

jest.mock('../../utils/ParentReferencesSelect', () => () => null);
jest.mock('../KuadrantCreateUpdate', () => () => null);

const EmbeddedRoute = ({ revision }: { revision: number }) => (
  <Modal isOpen aria-labelledby="test-wizard-title">
    <ModalHeader
      title="MCP wizard"
      labelId="test-wizard-title"
      description={`Update ${revision}`}
    />
    <ModalBody>
      <HTTPRouteCreatePage isEmbedded />
    </ModalBody>
  </Modal>
);

it('keeps the rule dialog accessible when its enclosing wizard rerenders', () => {
  const { rerender } = render(<EmbeddedRoute revision={0} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
  fireEvent.change(screen.getByLabelText('HTTP method', { selector: 'select', exact: false }), {
    target: { value: 'POST' },
  });

  rerender(<EmbeddedRoute revision={1} />);

  const ruleDialog = screen.getByRole('dialog', { name: 'Add rule' });
  fireEvent.click(within(ruleDialog).getByRole('button', { name: 'Next' }));
  expect(within(ruleDialog).getByRole('heading', { name: 'Filters' })).toBeInTheDocument();
  fireEvent.click(within(ruleDialog).getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('dialog', { name: 'MCP wizard' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add rule' })).toBeInTheDocument();
});

it('restores the standalone form after closing and reopening a rule', () => {
  render(<HTTPRouteCreatePage />);
  fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

  fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
  expect(
    within(screen.getByRole('dialog')).getByRole('heading', { name: 'Matches' }),
  ).toBeInTheDocument();
});
