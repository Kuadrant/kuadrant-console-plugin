import * as React from 'react';
import { useParams } from 'react-router-dom';
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
  ListPageBody
} from '@openshift-console/dynamic-plugin-sdk';

import { Title } from '@patternfly/react-core';
import { Alert, AlertGroup } from '@patternfly/react-core';
import ResourceList from './ResourceList';
import './kuadrant.css';

interface Resource {
  name: string;
  gvk: {
    group: string;
    version: string;
    kind: string;
  };
}

export const resources: Resource[] = [
  { name: 'AuthPolicies', gvk: { group: 'kuadrant.io', version: 'v1beta2', kind: 'AuthPolicy' } },
  { name: 'DNSPolicies', gvk: { group: 'kuadrant.io', version: 'v1alpha1', kind: 'DNSPolicy' } },
  { name: 'RateLimitPolicies', gvk: { group: 'kuadrant.io', version: 'v1beta2', kind: 'RateLimitPolicy' } },
  { name: 'TLSPolicies', gvk: { group: 'kuadrant.io', version: 'v1alpha1', kind: 'TLSPolicy' } },
];

export const AllPoliciesListPage: React.FC<{
  activeNamespace: string;
  columns?: TableColumn<K8sResourceCommon>[];
  showAlertGroup?: boolean;
  paginationLimit?: number;
}> = ({ activeNamespace, columns, showAlertGroup = false, paginationLimit }) => {
  const { t } = useTranslation();

  return (
    <>
      <ListPageBody>
        {showAlertGroup && (
          <AlertGroup className="kuadrant-alert-group">
            <Alert title={t('Info about this page')} variant="info" isInline>
              ...
            </Alert>
          </AlertGroup>
        )}
        <ResourceList
          resources={resources.map((r) => r.gvk)}
          namespace={activeNamespace}
          columns={columns}
          paginationLimit={paginationLimit}
        />
      </ListPageBody>
    </>
  );
};

const PoliciesListPage: React.FC<{ resource: Resource; activeNamespace: string }> = ({ resource, activeNamespace }) => {
  const { t } = useTranslation();
  const resolvedNamespace = activeNamespace === '#ALL_NS#' ? 'default' : activeNamespace;

  return (
    <>
      <ListPageBody>
        <AlertGroup className="kuadrant-alert-group">
          <Alert title={t('Info about this page')} variant="info" isInline>
            {/* Add any informational content here */}
            ...
          </Alert>
        </AlertGroup>
        <div className="co-m-nav-title--row kuadrant-resource-create-container">
          <ResourceList resources={[resource.gvk]} namespace={activeNamespace} />
          <div className="kuadrant-resource-create-button pf-u-mt-md">
            <ListPageCreateLink to={`/k8s/ns/${resolvedNamespace}/${resource.gvk.group}~${resource.gvk.version}~${resource.gvk.kind}/~new`}>
              {t(`plugin__console-plugin-template~Create ${resource.gvk.kind}`)}
            </ListPageCreateLink>
          </div>
        </div>
      </ListPageBody>
    </>
  );
};

const KuadrantPoliciesPage: React.FC = () => {
  const { t } = useTranslation('plugin__console-plugin-template');
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
      title: t('plugin__console-plugin-template~Name'),
      id: 'name',
      sort: 'metadata.name',
      transforms: [sortable],
    },
    {
      title: t('plugin__console-plugin-template~Type'),
      id: 'type',
      sort: 'kind',
      transforms: [sortable],
    },
    {
      title: t('plugin__console-plugin-template~Namespace'),
      id: 'namespace',
      sort: 'metadata.namespace',
      transforms: [sortable],
    },
    {
      title: t('plugin__console-plugin-template~Status'),
      id: 'Status',
    },
    {
      title: t('plugin__console-plugin-template~Created'),
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
