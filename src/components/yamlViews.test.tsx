import * as React from 'react';
import '@testing-library/jest-dom';
import { configure, fireEvent, render, screen } from '@testing-library/react';
import * as docs from '../test-utils/yamlDocuments';
import { typingStates } from '../test-utils/yamlTyping';
import APIProductCreatePage from './apiproduct/APIProductCreatePage';
import GatewayCreatePage from './gateway/GatewayCreatePage';
import HTTPRouteCreatePage from './httproute/HTTPRouteCreatePage';
import KuadrantDNSPolicyCreatePage from './KuadrantDNSPolicyCreatePage';
import KuadrantOIDCPolicyCreatePage from './KuadrantOIDCPolicyCreatePage';
import KuadrantPlanPolicyCreatePage from './KuadrantPlanPolicyCreatePage';
import KuadrantRateLimitPolicyCreatePage from './KuadrantRateLimitPolicyCreatePage';
import KuadrantTLSCreatePage from './KuadrantTLSCreatePage';
import KuadrantTokenRateLimitPolicyCreatePage from './KuadrantTokenRateLimitPolicyCreatePage';
import MCPExtensionStep from './mcp/MCPExtensionStep';
import { getMCPGatewayExtensionValidationError } from './mcp/mcpResourceUtils';
import CredentialStep from './mcp/steps/CredentialStep';
import DestinationRuleStep from './mcp/steps/DestinationRuleStep';
import RegisterServerStep from './mcp/steps/RegisterServerStep';
import ServiceEntryStep from './mcp/steps/ServiceEntryStep';
import {
  initialCredentialFormState,
  initialDestinationRuleFormState,
  initialFormState,
  initialServerFormState,
  initialServiceEntryFormState,
} from './mcp/types';

configure({ testIdAttribute: 'data-test' });

// stable like the real watch, or selects re-run their effects every render
const mockWatch = [[], true, null];

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

jest.mock('react-router', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '/k8s/ns/default/~new', search: '' }),
}));

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  ...jest.requireActual('@openshift-console/dynamic-plugin-sdk'),
  NamespaceBar: () => null,
  useK8sWatchResource: () => mockWatch,
}));

// a wizard step with its form state held as the wizard holds it
const withState = <S,>(
  Step: React.ComponentType<{ formState: S; onChange: (state: S) => void }>,
  initial: S,
) =>
  function StepWithState() {
    const [formState, setFormState] = React.useState(initial);
    return <Step formState={formState} onChange={setFormState} />;
  };

const ServiceEntryView = withState(ServiceEntryStep, initialServiceEntryFormState);
const DestinationRuleView = withState(DestinationRuleStep, initialDestinationRuleFormState);
const CredentialView = withState(CredentialStep, initialCredentialFormState);
const RegisterServerView = withState(RegisterServerStep, initialServerFormState);

// validated on every change, as MCPSetupWizard does
const ExtensionView = () => {
  const [formState, setFormState] = React.useState(initialFormState);
  return (
    <MCPExtensionStep
      formState={formState}
      updateFormState={(updates) => setFormState((state) => ({ ...state, ...updates }))}
      selectedNamespace="default"
      validationError={getMCPGatewayExtensionValidationError(formState)}
    />
  );
};

const WizardGateway = () => <GatewayCreatePage isEmbedded onFormChange={jest.fn()} />;

const WizardRoute = () => <HTTPRouteCreatePage onFormChange={jest.fn()} />;

// a value a user passes through while typing that once crashed the page, swapped into the
// document for the first occurrence of the text it replaces
type Value = [string, string];

const tlsValues: Value[] = [
  ['name: prod-web\n', 'name: 1\n'],
  ['name: letsencrypt-staging', 'name: 1'],
  ['kind: ClusterIssuer\n    name: letsencrypt-staging', 'kind: Issuer\n    name: 1'],
];

const oidcValues: Value[] = [
  ['clientID: 1234567890-abc123.apps.googleusercontent.com', 'clientID: 1234567890'],
];

const dnsValues: Value[] = [['- name: aws-credentials', '-']];

const planValues: Value[] = [
  [docs.plans, '  plans:\n    -\n'],
  [docs.plans, '  plans:\n    - tier: gold\n'],
  [docs.plans, '  plans: x\n'],
];

const rlpValues: Value[] = [
  [docs.limits, '  limits:\n    global:\n'],
  [docs.limits, '  limits:\n    global:\n      rates:\n        -\n'],
];

const trlpValues: Value[] = [
  [docs.tokenLimits, '  limits:\n    f\n'],
  [docs.tokenLimits, '  limits:\n    free:\n'],
];

const gatewayValues: Value[] = [
  ['value: 192.168.1.100', 'value: 1'],
  ['- name: https', '- name: 8'],
  ['hostname: api.example.com', 'hostname:\n        port: 443'],
  ['minVersion: TLSv1.2', 'minVersion:'],
];

const httpRouteValues: Value[] = [
  [docs.hostnames, '  hostnames: toystore.example.com\n'],
  [docs.hostnames, '  hostnames:\n    -\n'],
];

const apiProductValues: Value[] = [
  [docs.tags, '  tags: public\n'],
  ['displayName: 3D Prints API', 'displayName: 2026'],
];

const views: [string, React.ComponentType, string, Value[]][] = [
  // #1015
  ['ServiceEntry step', ServiceEntryView, docs.serviceEntry, [['      protocol: HTTPS\n', '']]],
  ['DestinationRule step', DestinationRuleView, docs.destinationRule, []],
  ['credential step', CredentialView, docs.credential, []],
  ['server registration step', RegisterServerView, docs.serverRegistration, []],
  ['MCP extension step', ExtensionView, docs.mcpExtension, [['name: mcp-gateway', 'name: 1']]],
  ['TLSPolicy page', KuadrantTLSCreatePage, docs.tlsPolicy, tlsValues],
  ['OIDCPolicy page', KuadrantOIDCPolicyCreatePage, docs.oidcPolicy, oidcValues],
  ['DNSPolicy page', KuadrantDNSPolicyCreatePage, docs.dnsPolicy, dnsValues],
  ['PlanPolicy page', KuadrantPlanPolicyCreatePage, docs.planPolicy, planValues],
  ['RateLimitPolicy page', KuadrantRateLimitPolicyCreatePage, docs.rateLimitPolicy, rlpValues],
  [
    'TokenRateLimitPolicy page',
    KuadrantTokenRateLimitPolicyCreatePage,
    docs.tokenRateLimitPolicy,
    trlpValues,
  ],
  ['Gateway page', GatewayCreatePage, docs.gateway, gatewayValues],
  ['Gateway page in the MCP setup wizard', WizardGateway, docs.gateway, gatewayValues],
  ['HTTPRoute page', HTTPRouteCreatePage, docs.httpRoute, httpRouteValues],
  ['HTTPRoute page in an MCP wizard', WizardRoute, docs.httpRoute, httpRouteValues],
  ['APIProduct page', APIProductCreatePage, docs.apiProduct, apiProductValues],
];

const swap = (document: string, [from, to]: Value) => {
  expect(document).toContain(from);
  return document.replace(from, to);
};

const openTab = (name: RegExp) => fireEvent.click(screen.getByRole('tab', { name }));

const editYAML = (value: string) =>
  fireEvent.change(screen.getByTestId('yaml-editor'), { target: { value } });

beforeEach(() => {
  // the pages log the prefix that is not yet valid yaml
  const logged = ['Error parsing YAML:', 'Invalid YAML syntax, not updating form:'];
  (['error', 'warn'] as const).forEach((level) => {
    const log = console[level];
    jest
      .spyOn(console, level)
      .mockImplementation((...args) => logged.includes(args[0]) || log(...args));
  });
});

afterEach(() => jest.restoreAllMocks());

it.each(views)('the %s stays usable while its YAML is typed', (_name, View, document, values) => {
  render(<View />);
  const type = (state: string) => {
    openTab(/^YAML/);
    editYAML(state);
    openTab(/^Form/);
  };
  // the first name in each document is its metadata name
  const name = /name: (.*)/.exec(document)[1];

  typingStates(document).forEach(type);
  // the whole document was typed last, so the form holds it
  expect(screen.getAllByDisplayValue(name).length).toBeGreaterThan(0);

  [
    document.replace(`name: ${name}`, 'name: 1'),
    ...values.map((value) => swap(document, value)),
  ].forEach(type);
});

// what the form can't show still has to reach the api, so nothing typed is dropped unseen
it.each<[string, React.ComponentType, string, Value, string]>([
  [
    'a RateLimitPolicy condition that is not a mapping',
    KuadrantRateLimitPolicyCreatePage,
    docs.rateLimitPolicy,
    ['- predicate: request.path == "/toys"', '- request.method == GET'],
    'request.method == GET',
  ],
  [
    'RateLimitPolicy limits that are not a mapping',
    KuadrantRateLimitPolicyCreatePage,
    docs.rateLimitPolicy,
    [docs.limits, '  limits: unreadable\n'],
    'unreadable',
  ],
  [
    'TokenRateLimitPolicy limits that are not a mapping',
    KuadrantTokenRateLimitPolicyCreatePage,
    docs.tokenRateLimitPolicy,
    [docs.tokenLimits, '  limits: unreadable\n'],
    'unreadable',
  ],
])('keeps %s', (_case, Page, document, value, kept) => {
  render(<Page />);
  openTab(/^YAML/);
  editYAML(swap(document, value));
  openTab(/^Form/);
  openTab(/^YAML/);

  expect(screen.getByTestId<HTMLTextAreaElement>('yaml-editor').value).toContain(kept);
});

it('shows a hostname typed as a number', () => {
  render(<HTTPRouteCreatePage />);
  openTab(/^YAML/);
  editYAML(swap(docs.httpRoute, ['- toystore.example.com', '- 123']));
  openTab(/^Form/);

  expect(document.querySelector('#hostname-0')).toHaveValue('123');
});
