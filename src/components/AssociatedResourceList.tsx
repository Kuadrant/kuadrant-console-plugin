import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AlertGroup,
  EmptyState,
  EmptyStateIcon,
  EmptyStateBody,
  Title,
} from '@patternfly/react-core';
import {
  K8sResourceKind,
  ResourceLink,
  useK8sWatchResources,
  VirtualizedTable,
  TableData,
  RowProps,
  TableColumn,
  WatchK8sResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { SearchIcon } from '@patternfly/react-icons';
import { getStatusLabel } from '../utils/statusLabel';

type AssociatedResourceListProps = {
  resource: K8sResourceKind;
};

const AssociatedResourceList: React.FC<AssociatedResourceListProps> = ({ resource }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  // TODO: dynamic?
  const associatedResources: { [key: string]: WatchK8sResource } = {
    RateLimitPolicy: {
      groupVersionKind: { group: 'kuadrant.io', version: 'v1', kind: 'RateLimitPolicy' },
      isList: true,
      namespace: resource.metadata.namespace,
    },
    AuthPolicy: {
      groupVersionKind: { group: 'kuadrant.io', version: 'v1', kind: 'AuthPolicy' },
      isList: true,
      namespace: resource.metadata.namespace,
    },
    DNSPolicy: {
      groupVersionKind: { group: 'kuadrant.io', version: 'v1', kind: 'DNSPolicy' },
      isList: true,
      namespace: resource.metadata.namespace,
    },
    TLSPolicy: {
      groupVersionKind: { group: 'kuadrant.io', version: 'v1', kind: 'TLSPolicy' },
      isList: true,
      namespace: resource.metadata.namespace,
    },
  };

  const watchedResources = useK8sWatchResources<{ [key: string]: K8sResourceKind[] }>(
    associatedResources,
  );

  const resourceGroup = resource.apiVersion.includes('/') ? resource.apiVersion.split('/')[0] : '';

  const allAssociatedResources = React.useMemo(() => {
    let resourcesArray: K8sResourceKind[] = [];
    Object.values(watchedResources).forEach((res) => {
      if (res.loaded && !res.loadError && res.data) {
        const matchingItems = (res.data as K8sResourceKind[]).filter((item) => {
          const targetRef = item.spec?.targetRef;
          if (!targetRef) return false;
          return (
            targetRef.group === resourceGroup &&
            targetRef.kind === resource.kind &&
            targetRef.name === resource.metadata.name
          );
        });
        resourcesArray = resourcesArray.concat(matchingItems);
      }
    });
    return resourcesArray;
  }, [watchedResources, resource, resourceGroup]);

  const columns: TableColumn<K8sResourceKind>[] = [
    {
      title: t('plugin__kuadrant-console-plugin~Name'),
      id: 'name',
      sort: 'metadata.name',
    },
    {
      title: t('plugin__kuadrant-console-plugin~Type'),
      id: 'type',
      sort: 'kind',
    },
    {
      title: t('plugin__kuadrant-console-plugin~Namespace'),
      id: 'namespace',
      sort: 'metadata.namespace',
    },
    {
      title: t('plugin__kuadrant-console-plugin~Status'),
      id: 'status',
    },
  ];

  const AssociatedResourceRow: React.FC<RowProps<K8sResourceKind>> = ({ obj, activeColumnIDs }) => {
    const [group, version] = obj.apiVersion.includes('/')
      ? obj.apiVersion.split('/')
      : ['', obj.apiVersion];
    return (
      <>
        {columns.map((column) => {
          switch (column.id) {
            case 'name':
              return (
                <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
                  <ResourceLink
                    groupVersionKind={{ group, version, kind: obj.kind }}
                    name={obj.metadata.name}
                    namespace={obj.metadata.namespace}
                  />
                </TableData>
              );
            case 'type':
              return (
                <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
                  {obj.kind}
                </TableData>
              );
            case 'namespace':
              return (
                <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
                  {obj.metadata.namespace || '-'}
                </TableData>
              );
            case 'status':
              return (
                <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
                  {getStatusLabel(obj)}
                </TableData>
              );
            default:
              return null;
          }
        })}
      </>
    );
  };

  const allLoaded = Object.values(watchedResources).every((res) => res.loaded);
  const loadErrors = Object.values(watchedResources)
    .filter((res) => res.loadError)
    .map((res) => res.loadError);
  const combinedLoadError =
    loadErrors.length > 0 ? new Error(loadErrors.map((err) => err.message).join('; ')) : null;

  return (
    <>
      {combinedLoadError && (
        <AlertGroup>
          <Alert title="Error loading associated resources" variant="danger" isInline>
            {combinedLoadError.message}
          </Alert>
        </AlertGroup>
      )}
      {allAssociatedResources.length === 0 && allLoaded ? (
        <EmptyState>
          <EmptyStateIcon icon={SearchIcon} />
          <Title headingLevel="h4" size="lg">
            {t('No associated resources found')}
          </Title>
          <EmptyStateBody>{t('No associated policies found')}</EmptyStateBody>
        </EmptyState>
      ) : (
        <VirtualizedTable<K8sResourceKind>
          data={allAssociatedResources}
          unfilteredData={allAssociatedResources}
          loaded={allLoaded}
          loadError={combinedLoadError}
          columns={columns}
          Row={AssociatedResourceRow}
        />
      )}
    </>
  );
};

export default AssociatedResourceList;
