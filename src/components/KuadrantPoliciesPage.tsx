import * as React from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dropdown, DropdownItem, DropdownList, MenuToggle, MenuToggleElement, Alert, AlertGroup, Title} from '@patternfly/react-core';
import { sortable } from '@patternfly/react-table';
import EllipsisVIcon from '@patternfly/react-icons/dist/esm/icons/ellipsis-v-icon';
import { useK8sWatchResource, K8sResourceCommon, ResourceLink, useActiveNamespace, HorizontalNav, useListPageFilter,
  ListPageBody,
  ListPageCreate,
  ListPageFilter,
  VirtualizedTable,
  TableData,
  RowProps,
  TableColumn,
  NamespaceBar,
  Timestamp,
  useActivePerspective,
 } from '@openshift-console/dynamic-plugin-sdk';
import './kuadrant.css';

interface Resource {
  name: string;
  gvk: {
    group: string;
    version: string;
    kind: string;
  };
}

interface ExtendedK8sResourceCommon extends K8sResourceCommon {
  status?: {
    addresses?: { value: string }[];
  };
}

const statusConditionsAsString = (obj: any) => {
  if (!obj.status || !obj.status.conditions) {
    return '';
  }
  return obj.status.conditions
    .map(condition => `${condition.type}=${condition.status}`)
    .join(',');
}

const resources: Resource[] = [
  { name: 'AuthPolicies', gvk: { group: 'kuadrant.io', version: 'v1beta2', kind: 'AuthPolicy' } },
  { name: 'DNSPolicies', gvk: { group: 'kuadrant.io', version: 'v1alpha1', kind: 'DNSPolicy' } },
  { name: 'RateLimitPolicies', gvk: { group: 'kuadrant.io', version: 'v1beta2', kind: 'RateLimitPolicy' } },
  { name: 'TLSPolicies', gvk: { group: 'kuadrant.io', version: 'v1alpha1', kind: 'TLSPolicy' } },
];

type AllPoliciesTableProps = {
  data: K8sResourceCommon[];
  unfilteredData: K8sResourceCommon[];
  loaded: boolean;
  loadError: any;
};

const AllPoliciesTable: React.FC<AllPoliciesTableProps> = ({ data, unfilteredData, loaded, loadError }) => {
  const { t } = useTranslation();

  const columns: TableColumn<K8sResourceCommon>[] = [
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
      title: '',  // No title for the kebab menu column
      id: 'dropdown-with-kebab',
      props: { className: 'pf-v5-c-table__action' },
    },
  ];

  const AllPolicyRow: React.FC<RowProps<K8sResourceCommon>> = ({ obj, activeColumnIDs }) => {
    const [group, version] = obj.apiVersion.includes('/') ? obj.apiVersion.split('/') : ['', obj.apiVersion];
    return (
      <>
        <TableData id={columns[0].id} activeColumnIDs={activeColumnIDs}>
          <ResourceLink groupVersionKind={{group: group, version: version, kind: obj.kind}} name={obj.metadata.name} namespace={obj.metadata.namespace} />
        </TableData>
        <TableData id={columns[1].id} activeColumnIDs={activeColumnIDs}>{obj.kind}</TableData>
        <TableData id={columns[2].id} activeColumnIDs={activeColumnIDs}>
          <ResourceLink groupVersionKind={{version: "v1", kind: "Namespace"}} name={obj.metadata.namespace} />
        </TableData>
        <TableData id={columns[3].id} activeColumnIDs={activeColumnIDs}>{statusConditionsAsString(obj)}</TableData>
        <TableData id={columns[4].id} activeColumnIDs={activeColumnIDs}>
          <Timestamp timestamp={obj.metadata.creationTimestamp} />
        </TableData>
        <TableData id={columns[5].id} activeColumnIDs={activeColumnIDs} className="pf-v5-c-table__action">
          <DropdownWithKebab obj={obj} />
        </TableData>
      </>
    );
  };

  return (
    <VirtualizedTable<K8sResourceCommon>
      data={data}
      unfilteredData={unfilteredData}
      loaded={loaded}
      loadError={loadError}
      columns={columns}
      Row={AllPolicyRow}
    />
  );
};

type DropdownWithKebabProps = {
  obj: K8sResourceCommon;
};

const DropdownWithKebab: React.FC<DropdownWithKebabProps> = ({ obj }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const onToggleClick = () => {
    setIsOpen(!isOpen);
  };

  const onSelect = (_event: React.MouseEvent<Element, MouseEvent> | undefined, value: string | number | undefined) => {
    // eslint-disable-next-line no-console
    console.log('selected', value);
    setIsOpen(false);
  };

  return (
    <Dropdown
      isOpen={isOpen}
      onSelect={onSelect}
      onOpenChange={(isOpen: boolean) => setIsOpen(isOpen)}
      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          aria-label="kebab dropdown toggle"
          variant="plain"
          onClick={onToggleClick}
          isExpanded={isOpen}
        >
          <EllipsisVIcon />
        </MenuToggle>
      )}
      shouldFocusToggleOnSelect
    >
      <DropdownList>
        <DropdownItem value={0} key="edit">
          Edit
        </DropdownItem>
      </DropdownList>
    </Dropdown>
  );
};

type PoliciesTableProps = {
  data: K8sResourceCommon[];
  unfilteredData: K8sResourceCommon[];
  loaded: boolean;
  loadError: any;
  resource: any;
};

const PoliciesTable: React.FC<PoliciesTableProps> = ({ data, unfilteredData, loaded, loadError, resource }) => {
  const { t } = useTranslation();

  const columns: TableColumn<K8sResourceCommon>[] = [
    {
      title: t('plugin__console-plugin-template~Name'),
      id: 'name',
      sort: 'metadata.name',
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
      title: '',  // No title for the kebab menu column
      id: 'dropdown-with-kebab',
      props: { className: 'pf-v5-c-table__action' },
    },
  ];

  const PolicyRow: React.FC<RowProps<K8sResourceCommon>> = ({ obj, activeColumnIDs }) => {
    return (
      <>
        <TableData id={columns[0].id} activeColumnIDs={activeColumnIDs}>
          <ResourceLink groupVersionKind={resource.gvk} name={obj.metadata.name} namespace={obj.metadata.namespace} />
        </TableData>
        <TableData id={columns[1].id} activeColumnIDs={activeColumnIDs}>
          <ResourceLink groupVersionKind={{version: "v1", kind: "Namespace"}} name={obj.metadata.namespace} />
        </TableData>
        <TableData id={columns[2].id} activeColumnIDs={activeColumnIDs}>{statusConditionsAsString(obj)}</TableData>
        <TableData id={columns[3].id} activeColumnIDs={activeColumnIDs}>
          <Timestamp timestamp={obj.metadata.creationTimestamp} />
        </TableData>
        <TableData id={columns[4].id} activeColumnIDs={activeColumnIDs} className="pf-v5-c-table__action">
          <DropdownWithKebab obj={obj} />
        </TableData>
      </>
    );
  };

  return (
    <VirtualizedTable<K8sResourceCommon>
      data={data}
      unfilteredData={unfilteredData}
      loaded={loaded}
      loadError={loadError}
      columns={columns}
      Row={PolicyRow}
    />
  );
};

const AllPoliciesListPage = (activeNamespace: string) => {
  const [policies, setPolicies] = React.useState([]);
  const [loaded, setLoaded] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);
  
  resources.forEach((resource) => {
    const { group, version, kind } = resource.gvk;
    const [res_policies, res_loaded, res_loadError] = useK8sWatchResource<ExtendedK8sResourceCommon[]>({
      groupVersionKind: { group, version, kind },
      namespace: activeNamespace === '#ALL_NS#' ? undefined : activeNamespace,
      isList: true,
    });
  
    React.useEffect(() => {
      if (res_loaded) {
        setPolicies((prevPolicies) => {
          const newPolicies = res_policies.filter((newPolicy) => 
            !prevPolicies.some((prevPolicy) => prevPolicy.metadata.uid === newPolicy.metadata.uid)
          );
          return [...prevPolicies, ...newPolicies];
        });
        setLoaded(true);
      }
      if (res_loadError) {
        setLoadError(true);
      }
    }, [res_policies, res_loaded, res_loadError]);
  });

  const [data, filteredData, onFilterChange] = useListPageFilter(policies);

  return (
    <>
      <ListPageBody>
        <AlertGroup className='kuadrant-alert-group'>
          <Alert title="Info about this page" variant="info" isInline>
            ...
          </Alert>
        </AlertGroup>
        <ListPageFilter
          data={data}
          loaded={loaded}
          onFilterChange={onFilterChange}
        />
        <AllPoliciesTable
          data={filteredData}
          unfilteredData={data}
          loaded={loaded}
          loadError={loadError}
        />
      </ListPageBody>
    </>
  );
};

const PoliciesListPage = (resource: Resource, activeNamespace: string) => {
  const { group, version, kind } = resource.gvk;
  const [policies, loaded, loadError] = useK8sWatchResource<ExtendedK8sResourceCommon[]>({
    groupVersionKind: { group, version, kind },
    namespace: activeNamespace === '#ALL_NS#' ? undefined : activeNamespace,
    isList: true,
  });
  const { t } = useTranslation();

  const [data, filteredData, onFilterChange] = useListPageFilter(policies);

  return (
    <>
      <ListPageBody>
      <AlertGroup className='kuadrant-alert-group'>
          <Alert title="Info about this page" variant="info" isInline>
            ...
          </Alert>
        </AlertGroup>
        <div className='co-m-nav-title--row'>
          <ListPageFilter
            data={data}
            loaded={loaded}
            onFilterChange={onFilterChange}
          />
          <ListPageCreate groupVersionKind={resource.gvk}>{t(`plugin__console-plugin-template~Create ${resource.gvk.kind}`)}</ListPageCreate>
        </div>
        <PoliciesTable
          data={filteredData}
          unfilteredData={data}
          loaded={loaded}
          loadError={loadError}
          resource={resource}
        />
      </ListPageBody>
    </>
  );
};

const KuadrantPoliciesPage: React.FC = () => {
  const { t } = useTranslation('plugin__console-plugin-template');
  const { ns } = useParams<{ ns: string }>();
  const [activeNamespace, setActiveNamespace] = useActiveNamespace();
  const [activePerspective, _] = useActivePerspective();
  console.log(`Active perspective: ${activePerspective}`);

  React.useEffect(() => {
    if (ns && ns !== activeNamespace) {
      setActiveNamespace(ns);
    }
    console.log(`Initial namespace: ${activeNamespace}`);
  }, [ns, activeNamespace, setActiveNamespace]);

  const All: React.FC = () => {
    return AllPoliciesListPage(activeNamespace)
  };

  const Auth: React.FC = () => {
    return PoliciesListPage(resources[0], activeNamespace)
  };

  const RateLimit: React.FC = () => {
    return PoliciesListPage(resources[2], activeNamespace)
  };
  
  let pages = [
    {
      href: '',
      name: 'All Policies',
      component: All
    },
  ];

  if (activePerspective === 'admin') {
    const DNS: React.FC = () => {
      return PoliciesListPage(resources[1], activeNamespace);
    };

    const TLS: React.FC = () => {
      return PoliciesListPage(resources[3], activeNamespace);
    };

    pages = [
      ...pages,
      {
        href: 'dns',
        name: 'DNS',
        component: DNS
      },
      {
        href: 'tls',
        name: 'TLS',
        component: TLS
      },
    ];
  }
  pages = [
    ...pages,
    {
      href: 'auth',
      name: 'Auth',
      component: Auth
    },
    {
      href: 'ratelimit',
      name: 'RateLimit',
      component: RateLimit
    }
  ];

  return (
    <>
      <NamespaceBar/>
      <Title headingLevel="h1" className="kuadrant-page-title">{t('Kuadrant')}</Title>
      <HorizontalNav pages={pages} />
    </>
  );
};

export default KuadrantPoliciesPage;
