import * as React from 'react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';

interface CapturedResource {
  metadata?: { namespace?: string };
  spec?: { targetRef?: unknown };
}

// the resource each page would create, captured from KuadrantCreateUpdate (form
// pages) or ResourceYAMLEditor (the yaml-only AuthPolicy page)
let mockResource: CapturedResource | undefined;
let mockSearch = '';
// stable like the real watch, or selects re-run their effects every render
const mockEmptyWatch = [[], true, null];

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-helmet', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('react-router', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({
    pathname: '/k8s/ns/hello-rhcl/kuadrant.io~v1~RateLimitPolicy/~new',
    search: mockSearch,
  }),
}));

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  ResourceYAMLEditor: ({ initialResource }: { initialResource: CapturedResource }) => {
    mockResource = initialResource;
    return null;
  },
  ResourceLink: () => null,
  getGroupVersionKindForResource: ({ apiVersion, kind }: { apiVersion: string; kind: string }) => {
    const [group, version] = apiVersion.split('/');
    return { group, version, kind };
  },
  useK8sModel: () => [undefined, true],
  useK8sWatchResource: () => mockEmptyWatch,
  useActiveNamespace: () => ['hello-rhcl', jest.fn()],
}));

jest.mock('./KuadrantCreateUpdate', () => ({
  __esModule: true,
  default: ({ resource }: { resource: CapturedResource }) => {
    mockResource = resource;
    return null;
  },
}));

// sections unrelated to the target
jest.mock('./ratelimitpolicy/LimitSelect', () => ({ __esModule: true, default: () => null }));
jest.mock('./dnspolicy/LoadBalancingField', () => ({ __esModule: true, default: () => null }));
jest.mock('./dnspolicy/HealthCheckField', () => ({ __esModule: true, default: () => null }));
jest.mock('./issuer/clusterIssuerSelect', () => ({ __esModule: true, default: () => null }));
jest.mock('./issuer/issuerSelect', () => ({ __esModule: true, default: () => null }));

import KuadrantAuthPolicyCreatePage from './KuadrantAuthPolicyCreatePage';
import KuadrantDNSPolicyCreatePage from './KuadrantDNSPolicyCreatePage';
import KuadrantOIDCPolicyCreatePage from './KuadrantOIDCPolicyCreatePage';
import KuadrantPlanPolicyCreatePage from './KuadrantPlanPolicyCreatePage';
import KuadrantRateLimitPolicyCreatePage from './KuadrantRateLimitPolicyCreatePage';
import KuadrantTLSCreatePage from './KuadrantTLSCreatePage';
import KuadrantTokenRateLimitPolicyCreatePage from './KuadrantTokenRateLimitPolicyCreatePage';

const GROUP = 'gateway.networking.k8s.io';

const pages: Array<{
  policy: string;
  Page: React.FC;
  target: { kind: string; name: string };
  defaultTarget: { kind: string; name: string };
}> = [
  {
    policy: 'RateLimitPolicy',
    Page: KuadrantRateLimitPolicyCreatePage,
    target: { kind: 'HTTPRoute', name: 'hello-route' },
    defaultTarget: { kind: 'Gateway', name: '' },
  },
  {
    policy: 'TokenRateLimitPolicy',
    Page: KuadrantTokenRateLimitPolicyCreatePage,
    target: { kind: 'HTTPRoute', name: 'hello-route' },
    defaultTarget: { kind: 'Gateway', name: '' },
  },
  {
    policy: 'OIDCPolicy',
    Page: KuadrantOIDCPolicyCreatePage,
    target: { kind: 'HTTPRoute', name: 'hello-route' },
    defaultTarget: { kind: 'Gateway', name: '' },
  },
  {
    policy: 'PlanPolicy',
    Page: KuadrantPlanPolicyCreatePage,
    target: { kind: 'HTTPRoute', name: 'hello-route' },
    defaultTarget: { kind: 'HTTPRoute', name: '' },
  },
  {
    policy: 'DNSPolicy',
    Page: KuadrantDNSPolicyCreatePage,
    target: { kind: 'Gateway', name: 'hello-gateway' },
    defaultTarget: { kind: 'Gateway', name: '' },
  },
  {
    policy: 'TLSPolicy',
    Page: KuadrantTLSCreatePage,
    target: { kind: 'Gateway', name: 'hello-gateway' },
    defaultTarget: { kind: 'Gateway', name: '' },
  },
  {
    policy: 'AuthPolicy',
    Page: KuadrantAuthPolicyCreatePage,
    target: { kind: 'HTTPRoute', name: 'hello-route' },
    defaultTarget: { kind: 'Gateway', name: 'prod-web' },
  },
];

describe.each(pages)('$policy create page', ({ Page, target, defaultTarget }) => {
  beforeEach(() => {
    mockResource = undefined;
  });

  it('targets the resource passed in the url', () => {
    mockSearch = `?targetKind=${target.kind}&targetName=${target.name}`;
    render(<Page />);

    expect(mockResource?.metadata?.namespace).toBe('hello-rhcl');
    expect(mockResource?.spec?.targetRef).toEqual({ group: GROUP, ...target });
  });

  it('keeps its default target without one in the url', () => {
    mockSearch = '';
    render(<Page />);

    expect(mockResource?.metadata?.namespace).toBe('hello-rhcl');
    expect(mockResource?.spec?.targetRef).toEqual({ group: GROUP, ...defaultTarget });
  });
});

// AuthPolicy is yaml-only, so it has no route select
const routeFormPages = pages.filter(
  ({ policy, target }) => policy !== 'AuthPolicy' && target.kind === 'HTTPRoute',
);

describe.each(routeFormPages)('$policy create form', ({ Page }) => {
  it('selects the route passed in the url', () => {
    mockSearch = '?targetKind=HTTPRoute&targetName=hello-route';
    const { container } = render(<Page />);

    expect(container.querySelector('#target-type-radio-httproute')).toBeChecked();
    expect(container.querySelector('#httproute-select')).toHaveTextContent(
      'hello-rhcl/hello-route',
    );
  });
});
