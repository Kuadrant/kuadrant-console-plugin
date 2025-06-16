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
  useAccessReview,
} from '@openshift-console/dynamic-plugin-sdk';
import { Title, Tooltip } from '@patternfly/react-core';
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
import NoPermissionsView from './NoPermissionsView';
import { getResourceNameFromKind } from '../utils/getModelFromResource';

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

interface ResourceRBAC {
  list: boolean;
  create: boolean;
}

interface RBACMap {
  [key: string]: ResourceRBAC;
}

const useResourceRBAC = (resourceKey: string, namespace?: string): ResourceRBAC => {
  const gvk = resourceGVKMapping[resourceKey];
  const resourceName = getResourceNameFromKind(gvk.kind);
  const [listAllowed] = useAccessReview({
    group: gvk.group,
    resource: resourceName,
    verb: 'list',
    namespace,
  });
  const [createAllowed] = useAccessReview({
    group: gvk.group,
    resource: resourceName,
    verb: 'create',
    namespace,
  });
  // console.log(
  //   `[RBAC] ${resourceKey} in ns ${
  //     namespace || 'cluster'
  //   }: list = ${listAllowed}, create = ${createAllowed}`,
  // );
  return { list: listAllowed, create: createAllowed };
};

export const AllPoliciesListPage: React.FC<{
  activeNamespace: string;
  columns?: TableColumn<K8sResourceCommon>[];
  showAlertGroup?: boolean;
  paginationLimit?: number;
  resourceRBAC: RBACMap;
}> = ({ activeNamespace, columns, paginationLimit, resourceRBAC }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activePerspective] = useActivePerspective();

  let filteredResources = resources.filter((r) => {
    const allowed = resourceRBAC[r.gvk.kind]?.list;
    return allowed;
  });

  // Filter out DNSPolicies and TLSPolicies if active perspective is 'dev'
  if (activePerspective === 'dev') {
    filteredResources = filteredResources.filter(
      (resource) => !['DNSPolicies', 'TLSPolicies'].includes(resource.name),
    );
  }

  if (filteredResources.length === 0) {
    return <NoPermissionsView primaryMessage={t('You do not have permission to view Policies')} />;
  }

  const [isOpen, setIsOpen] = useState(false);
  const history = useHistory();

  const onToggleClick = () => setIsOpen(!isOpen);

  const onMenuSelect = (_event: React.MouseEvent<Element, MouseEvent>, policyType: string) => {
    const resource = resourceGVKMapping[policyType];
    const resolvedNamespace = activeNamespace === '#ALL_NS#' ? 'default' : activeNamespace;
    const targetUrl = `/k8s/ns/${resolvedNamespace}/${resource.group}~${resource.version}~${resource.kind}/~new`;
    history.push(targetUrl);
    setIsOpen(false); // Close the dropdown after selecting an option
  };

  const canCreateAny = ['AuthPolicy', 'RateLimitPolicy', 'DNSPolicy', 'TLSPolicy'].some(
    (policy) => resourceRBAC[policy]?.create,
  );

  const createPolicyItems = ['AuthPolicy', 'RateLimitPolicy']
    .concat(activePerspective !== 'dev' ? ['DNSPolicy', 'TLSPolicy'] : [])
    .map((policy) => {
      return resourceRBAC[policy]?.create ? (
        <DropdownItem value={policy} key={policy.toLowerCase()}>
          {t(policy)}
        </DropdownItem>
      ) : (
        <Tooltip key={policy} content={t(`You do not have permission to create a ${policy}`)}>
          <DropdownItem value={policy} isAriaDisabled>
            {t(policy)}
          </DropdownItem>
        </Tooltip>
      );
    });

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
                  variant={canCreateAny ? 'primary' : 'secondary'}
                  isDisabled={!canCreateAny}
                >
                  {t('Create Policy')}
                </MenuToggle>
              )}
            >
              <DropdownList>{createPolicyItems}</DropdownList>
            </Dropdown>
          </div>
        </div>
      </ListPageBody>
    </>
  );
};

const PoliciesListPage: React.FC<{
  resource: Resource;
  activeNamespace: string;
  resourceRBAC: RBACMap;
}> = ({ resource, activeNamespace, resourceRBAC }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const resolvedNamespace = activeNamespace === '#ALL_NS#' ? 'default' : activeNamespace;

  if (!resourceRBAC[resource.gvk.kind]?.list) {
    console.warn(`[PoliciesListPage] No list permission for ${resource.gvk.kind}`);
    return (
      <NoPermissionsView primaryMessage={t('You do not have permission to view this resource')} />
    );
  }

  return (
    <>
      <ListPageBody>
        <div className="co-m-nav-title--row kuadrant-resource-create-container">
          <ResourceList resources={[resource.gvk]} namespace={activeNamespace} />
          <div className="kuadrant-resource-create-button pf-u-mt-md">
            {resourceRBAC[resource.gvk.kind]?.create ? (
              <ListPageCreateLink
                to={`/k8s/ns/${resolvedNamespace}/${resource.gvk.group}~${resource.gvk.version}~${resource.gvk.kind}/~new`}
              >
                {t(`plugin__kuadrant-console-plugin~Create ${resource.gvk.kind}`)}
              </ListPageCreateLink>
            ) : (
              <Tooltip content={t(`You do not have permission to create a ${resource.gvk.kind}`)}>
                <span
                  className="pf-c-button pf-m-primary pf-u-mt-md pf-u-mr-md"
                  aria-disabled="true"
                >
                  {t(`Create ${resource.gvk.kind}`)}
                </span>
              </Tooltip>
            )}
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
  const history = useHistory();

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

  const nsForCheck = activeNamespace === '#ALL_NS#' ? 'default' : activeNamespace;
  const resourceRBAC: RBACMap = {
    AuthPolicy: useResourceRBAC('AuthPolicy', nsForCheck),
    DNSPolicy: useResourceRBAC('DNSPolicy', nsForCheck),
    RateLimitPolicy: useResourceRBAC('RateLimitPolicy', nsForCheck),
    TLSPolicy: useResourceRBAC('TLSPolicy', nsForCheck),
  };

  const permsLoaded = ['AuthPolicy', 'DNSPolicy', 'RateLimitPolicy', 'TLSPolicy'].every(
    (key) => resourceRBAC[key] !== undefined,
  );
  if (!permsLoaded) {
    return <div>Loading permissions...</div>;
  }

  const policyRBACNil =
    !resourceRBAC['AuthPolicy'].list &&
    !resourceRBAC['RateLimitPolicy'].list &&
    !resourceRBAC['DNSPolicy'].list &&
    !resourceRBAC['TLSPolicy']?.list;

  const All: React.FC = () => (
    <AllPoliciesListPage
      activeNamespace={activeNamespace}
      columns={defaultColumns}
      resourceRBAC={resourceRBAC}
    />
  );

  const Auth: React.FC = () => (
    <PoliciesListPage
      resource={resources[0]}
      activeNamespace={activeNamespace}
      resourceRBAC={resourceRBAC}
    />
  );

  const RateLimit: React.FC = () => (
    <PoliciesListPage
      resource={resources[2]}
      activeNamespace={activeNamespace}
      resourceRBAC={resourceRBAC}
    />
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
      <PoliciesListPage
        resource={resources[1]}
        activeNamespace={activeNamespace}
        resourceRBAC={resourceRBAC}
      />
    );
    const TLS: React.FC = () => (
      <PoliciesListPage
        resource={resources[3]}
        activeNamespace={activeNamespace}
        resourceRBAC={resourceRBAC}
      />
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

  const handleNamespaceChange = (activeNamespace: string) => {
    let currentTab = '';
    let activeTab = location.pathname.split('/').pop();
    if (activeTab === 'policies') {
      activeTab = '';
    }

    if (activeNamespace !== '#ALL_NS#') {
      currentTab = `/kuadrant/ns/${activeNamespace}/policies/${activeTab}`;
    } else {
      currentTab = `/kuadrant/all-namespaces/policies/${activeTab}`;
    }

    history.replace(currentTab);
  };

  return (
    <>
      <NamespaceBar onNamespaceChange={handleNamespaceChange} />
      <Title headingLevel="h1" className="kuadrant-page-title">
        {t('Kuadrant')}
      </Title>
      {policyRBACNil ? (
        <NoPermissionsView primaryMessage={t('You do not have permission to view Policies')} />
      ) : (
        <HorizontalNav pages={pages} />
      )}
    </>
  );
};

export default KuadrantPoliciesPage;
