import * as React from 'react';
import { useState } from 'react';
import { useParams, useHistory } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { sortable } from '@patternfly/react-table';
import {
  NamespaceBar,
  HorizontalNav,
  TableColumn,
  K8sResourceCommon,
  useActiveNamespace,
  useActivePerspective,
  ListPageCreateLink,
  ListPageBody,
} from '@openshift-console/dynamic-plugin-sdk';

import { Title } from '@patternfly/react-core';
import {
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
} from '@patternfly/react-core';
import ResourceList from './ResourceList';
import './kuadrant.css';
import resourceGVKMapping from '../utils/latest';

interface Resource {
  name: string;
  gvk: {
    group: string;
    version: string;
    kind: string;
  };
}

export const resources: Resource[] = [
  { name: 'AuthPolicies', gvk: resourceGVKMapping['AuthPolicy'] },
  { name: 'DNSPolicies', gvk: resourceGVKMapping['DNSPolicy'] },
  { name: 'RateLimitPolicies', gvk: resourceGVKMapping['RateLimitPolicy'] },
  { name: 'TLSPolicies', gvk: resourceGVKMapping['TLSPolicy'] },
];

export const AllPoliciesListPage: React.FC<{
  activeNamespace: string;
  columns?: TableColumn<K8sResourceCommon>[];
  showAlertGroup?: boolean;
  paginationLimit?: number;
}> = ({ activeNamespace, columns, showAlertGroup = false, paginationLimit }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activePerspective] = useActivePerspective();
  const history = useHistory();
  const [isOpen, setIsOpen] = useState(false);

  let filteredResources = resources;

  // Filter out DNSPolicies and TLSPolicies if active perspective is 'dev'
  if (activePerspective === 'dev') {
    filteredResources = resources.filter(
      (resource) => !['DNSPolicies', 'TLSPolicies'].includes(resource.name),
    );
  }

  const onToggleClick = () => {
    setIsOpen(!isOpen);
  };

  const onMenuSelect = (_event: React.MouseEvent<Element, MouseEvent>, policyType: string) => {
    const resource = resourceGVKMapping[policyType];
    const resolvedNamespace = activeNamespace === '#ALL_NS#' ? 'default' : activeNamespace;
    const targetUrl = `/k8s/ns/${resolvedNamespace}/${resource.group}~${resource.version}~${resource.kind}/~new`;
    history.push(targetUrl);
    setIsOpen(false); // Close the dropdown after selecting an option
  };

  return (
    <>
      <ListPageBody>
        <div className="co-m-nav-title--row kuadrant-resource-create-container">
          <ResourceList
            resources={filteredResources.map((r) => r.gvk)}
            namespace={activeNamespace}
            columns={columns}
            paginationLimit={paginationLimit}
          />

          <div className="kuadrant-resource-create-button pf-u-mt-md">
            <Dropdown
              isOpen={isOpen}
              onSelect={onMenuSelect}
              onOpenChange={setIsOpen}
              toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                <MenuToggle
                  ref={toggleRef}
                  onClick={onToggleClick}
                  isExpanded={isOpen}
                  variant="primary"
                >
                  {t('Create Policy')}
                </MenuToggle>
              )}
            >
              <DropdownList>
                <DropdownItem value="AuthPolicy" key="auth-policy">
                  {t('AuthPolicy')}
                </DropdownItem>
                <DropdownItem value="RateLimitPolicy" key="rate-limit-policy">
                  {t('RateLimitPolicy')}
                </DropdownItem>
                {activePerspective !== 'dev' && (
                  <>
                    <DropdownItem value="DNSPolicy" key="dns-policy">
                      {t('DNSPolicy')}
                    </DropdownItem>
                    <DropdownItem value="TLSPolicy" key="tls-policy">
                      {t('TLSPolicy')}
                    </DropdownItem>
                  </>
                )}
              </DropdownList>
            </Dropdown>
          </div>
        </div>
      </ListPageBody>
    </>
  );
};

const PoliciesListPage: React.FC<{ resource: Resource; activeNamespace: string }> = ({
  resource,
  activeNamespace,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const resolvedNamespace = activeNamespace === '#ALL_NS#' ? 'default' : activeNamespace;

  return (
    <>
      <ListPageBody>
        <div className="co-m-nav-title--row kuadrant-resource-create-container">
          <ResourceList resources={[resource.gvk]} namespace={activeNamespace} />
          <div className="kuadrant-resource-create-button pf-u-mt-md">
            <ListPageCreateLink
              to={`/k8s/ns/${resolvedNamespace}/${resource.gvk.group}~${resource.gvk.version}~${resource.gvk.kind}/~new`}
            >
              {t(`plugin__kuadrant-console-plugin~Create ${resource.gvk.kind}`)}
            </ListPageCreateLink>
          </div>
        </div>
      </ListPageBody>
    </>
  );
};

const KuadrantPoliciesPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const { ns } = useParams<{ ns: string }>();
  const [activeNamespace, setActiveNamespace] = useActiveNamespace();
  const [activePerspective] = useActivePerspective();

  React.useEffect(() => {
    if (ns && ns !== activeNamespace) {
      setActiveNamespace(ns);
    }
  }, [ns, activeNamespace, setActiveNamespace]);

  const defaultColumns: TableColumn<K8sResourceCommon>[] = [
    {
      title: t('plugin__kuadrant-console-plugin~Name'),
      id: 'name',
      sort: 'metadata.name',
      transforms: [sortable],
    },
    {
      title: t('plugin__kuadrant-console-plugin~Type'),
      id: 'type',
      sort: 'kind',
      transforms: [sortable],
    },
    {
      title: t('plugin__kuadrant-console-plugin~Namespace'),
      id: 'namespace',
      sort: 'metadata.namespace',
      transforms: [sortable],
    },
    {
      title: t('plugin__kuadrant-console-plugin~Status'),
      id: 'Status',
    },
    {
      title: t('plugin__kuadrant-console-plugin~Created'),
      id: 'Created',
      sort: 'metadata.creationTimestamp',
      transforms: [sortable],
    },
    {
      title: '', // No title for the kebab menu column
      id: 'kebab',
      props: { className: 'pf-v5-c-table__action' },
    },
  ];

  const All: React.FC = () => (
    <AllPoliciesListPage activeNamespace={activeNamespace} columns={defaultColumns} />
  );

  const Auth: React.FC = () => (
    <PoliciesListPage resource={resources[0]} activeNamespace={activeNamespace} />
  );

  const RateLimit: React.FC = () => (
    <PoliciesListPage resource={resources[2]} activeNamespace={activeNamespace} />
  );

  let pages = [
    {
      href: '',
      name: t('All Policies'),
      component: All,
    },
  ];

  if (activePerspective === 'admin') {
    const DNS: React.FC = () => (
      <PoliciesListPage resource={resources[1]} activeNamespace={activeNamespace} />
    );
    const TLS: React.FC = () => (
      <PoliciesListPage resource={resources[3]} activeNamespace={activeNamespace} />
    );

    pages = [
      ...pages,
      {
        href: 'dns',
        name: t('DNS'),
        component: DNS,
      },
      {
        href: 'tls',
        name: t('TLS'),
        component: TLS,
      },
    ];
  }

  pages = [
    ...pages,
    {
      href: 'auth',
      name: t('Auth'),
      component: Auth,
    },
    {
      href: 'ratelimit',
      name: t('RateLimit'),
      component: RateLimit,
    },
  ];

  return (
    <>
      <NamespaceBar />
      <Title headingLevel="h1" className="kuadrant-page-title">
        {t('Kuadrant')}
      </Title>
      <HorizontalNav pages={pages} />
    </>
  );
};

export default KuadrantPoliciesPage;
