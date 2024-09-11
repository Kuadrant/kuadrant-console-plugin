import * as React from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
  Alert,
  AlertGroup,
  Title,
  Button,
  ButtonVariant,
} from '@patternfly/react-core';
import { sortable } from '@patternfly/react-table';
import { EllipsisVIcon } from '@patternfly/react-icons';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core/next';

import {
  k8sDelete,
  useK8sWatchResource,
  K8sResourceCommon,
  ResourceLink,
  useActiveNamespace,
  HorizontalNav,
  useListPageFilter,
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
import getModelFromResource from '../utils/getModelFromResource';


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
};

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

type DropdownWithKebabProps = {
  obj: K8sResourceCommon;
};

type PoliciesTableProps = {
  data: K8sResourceCommon[];
  unfilteredData: K8sResourceCommon[];
  loaded: boolean;
  loadError: any;
  resource: Resource;
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
          <ResourceLink
            groupVersionKind={{ group: group, version: version, kind: obj.kind }}
            name={obj.metadata.name}
            namespace={obj.metadata.namespace}
          />
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

const DropdownWithKebab: React.FC<DropdownWithKebabProps> = ({ obj }) => {
  const { t } = useTranslation('plugin__console-plugin-template');
  const [isOpen, setIsOpen] = React.useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);

  const onToggleClick = () => {
    setIsOpen(!isOpen);
  };

  const onDeleteConfirm = async () => {
    try {
      const model = getModelFromResource(obj);
      await k8sDelete({ model, resource: obj });
      console.log('Successfully deleted', obj.metadata.name);
    } catch (error) {
      console.error('Failed to delete', obj.metadata.name, error);
    } finally {
      setIsDeleteModalOpen(false);
    }
  };

  const onDeleteClick = () => {
    setIsDeleteModalOpen(true);
  };

  const onSelect = (
    _event: React.MouseEvent<Element, MouseEvent> | undefined,
    value: string | number | undefined
  ) => {
    setIsOpen(false);
    if (value === 'delete') {
      onDeleteClick();
    }
  };

  return (
    <>
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
          <DropdownItem value="edit" key="edit">
            {t('Edit')}
          </DropdownItem>
          <DropdownItem value="delete" key="delete">
          {t('Delete')}
          </DropdownItem>
        </DropdownList>
      </Dropdown>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        aria-labelledby="delete-modal-title"
        aria-describedby="delete-modal-body"
        variant="medium"
      >
        <ModalHeader title="Confirm Delete" />
        <ModalBody>
          {t("Are you sure you want to delete the policy")}: <b>{obj.metadata.name}</b>?
        </ModalBody>
        <ModalFooter>
          <Button key="confirm" variant={ButtonVariant.danger} onClick={onDeleteConfirm}>
            Delete
          </Button>
          <Button key="cancel" variant={ButtonVariant.link} onClick={() => setIsDeleteModalOpen(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
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

const AllPoliciesListPage: React.FC<{ activeNamespace: string }> = ({ activeNamespace }) => {
  const watchedResources = resources.map((resource) => {
    const { group, version, kind } = resource.gvk;
    return useK8sWatchResource<ExtendedK8sResourceCommon[]>({
      groupVersionKind: { group, version, kind },
      namespace: activeNamespace === '#ALL_NS#' ? undefined : activeNamespace,
      isList: true,
    });
  });

  const policies = watchedResources.flatMap(([res_policies]) => res_policies || []);
  const loaded = watchedResources.every(([_, res_loaded]) => res_loaded);
  const loadError = watchedResources.some(([_, __, res_loadError]) => res_loadError);

  const [data, filteredData, onFilterChange] = useListPageFilter(policies);

  return (
    <>
      <ListPageBody>
        <AlertGroup className="kuadrant-alert-group">
          <Alert title="Info about this page" variant="info" isInline>
            ...
          </Alert>
        </AlertGroup>
        <ListPageFilter data={data} loaded={loaded} onFilterChange={onFilterChange} />
        <AllPoliciesTable data={filteredData} unfilteredData={data} loaded={loaded} loadError={loadError} />
      </ListPageBody>
    </>
  );
};

const PoliciesListPage: React.FC<{ resource: Resource; activeNamespace: string }> = ({ resource, activeNamespace }) => {
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
        <AlertGroup className="kuadrant-alert-group">
          <Alert title="Info about this page" variant="info" isInline>
            ...
          </Alert>
        </AlertGroup>
        <div className="co-m-nav-title--row">
          <ListPageFilter data={data} loaded={loaded} onFilterChange={onFilterChange} />
          <ListPageCreate groupVersionKind={resource.gvk}>
            {t(`plugin__console-plugin-template~Create ${resource.gvk.kind}`)}
          </ListPageCreate>
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
  const [activePerspective] = useActivePerspective();

  React.useEffect(() => {
    if (ns && ns !== activeNamespace) {
      setActiveNamespace(ns);
    }
  }, [ns, activeNamespace, setActiveNamespace]);

  const All: React.FC = () => <AllPoliciesListPage activeNamespace={activeNamespace} />;
  const Auth: React.FC = () => <PoliciesListPage resource={resources[0]} activeNamespace={activeNamespace} />;
  const RateLimit: React.FC = () => <PoliciesListPage resource={resources[2]} activeNamespace={activeNamespace} />;

  let pages = [
    {
      href: '',
      name: t('All Policies'),
      component: All
    }
  ];

  if (activePerspective === 'admin') {
    const DNS: React.FC = () => <PoliciesListPage resource={resources[1]} activeNamespace={activeNamespace} />;
    const TLS: React.FC = () => <PoliciesListPage resource={resources[3]} activeNamespace={activeNamespace} />;

    pages = [
      ...pages,
      {
        href: 'dns',
        name: t('DNS'),
        component: DNS
      },
      {
        href: 'tls',
        name: t('TLS'),
        component: TLS
      }
    ];
  }
  pages = [
    ...pages,
    {
      href: 'auth',
      name: t('Auth'),
      component: Auth
    },
    {
      href: 'ratelimit',
      name: t('RateLimit'),
      component: RateLimit
    }
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
