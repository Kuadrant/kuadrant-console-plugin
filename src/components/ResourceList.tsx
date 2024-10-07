import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { sortable } from '@patternfly/react-table';
import { Alert, AlertGroup, Pagination, Label } from '@patternfly/react-core';
import {
  K8sResourceCommon,
  ResourceLink,
  useK8sWatchResources,
  VirtualizedTable,
  useListPageFilter,
  Timestamp,
  TableData,
  RowProps,
  TableColumn,
  WatchK8sResource,
  ListPageBody,
  ListPageFilter,
} from '@openshift-console/dynamic-plugin-sdk';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  LayerGroupIcon,
  UploadIcon,
  OutlinedHourglassIcon,
} from '@patternfly/react-icons';
import DropdownWithKebab from './DropdownWithKebab';

const getStatusLabel = (obj: any) => {
  // Gateway or HTTPRoute
  if (obj.kind === 'Gateway' || obj.kind === 'HTTPRoute') {
    const acceptedCondition = obj.status?.conditions?.find(
      (cond: any) => cond.type === 'Accepted' && cond.status === 'True',
    );
    const programmedCondition = obj.status?.conditions?.find(
      (cond: any) => cond.type === 'Programmed' && cond.status === 'True',
    );
    const conflictedCondition = obj.status?.conditions?.find(
      (cond: any) => cond.type === 'Conflicted' && cond.status === 'True',
    );
    const resolvedRefsCondition = obj.status?.conditions?.find(
      (cond: any) => cond.type === 'ResolvedRefs' && cond.status === 'True',
    );

    let labelText: string;
    let color: 'green' | 'blue' | 'red' | 'orange';
    let icon: React.ReactNode;

    if (acceptedCondition) {
      labelText = 'Accepted';
      color = 'green';
      icon = <CheckCircleIcon />;
    } else if (programmedCondition) {
      labelText = 'Programmed';
      color = 'blue';
      icon = <CheckCircleIcon />;
    } else if (conflictedCondition) {
      labelText = 'Conflicted';
      color = 'red';
      icon = <ExclamationTriangleIcon />;
    } else if (resolvedRefsCondition) {
      labelText = 'Resolved Refs';
      color = 'blue';
      icon = <CheckCircleIcon />;
    } else {
      labelText = 'Unknown';
      color = 'orange';
      icon = <ExclamationTriangleIcon />;
    }

    return (
      <Label isCompact icon={icon} color={color}>
        {labelText}
      </Label>
    );
  }

  if (!obj.status || !obj.status.conditions || obj.status.conditions.length === 0) {
    // No status/conditions
    return (
      <Label isCompact icon={<OutlinedHourglassIcon />} color="cyan">
        Creating
      </Label>
    );
  }
  const enforcedCondition = obj.status.conditions.find(
    (cond: any) => cond.type === 'Enforced' && cond.status === 'True',
  );
  const acceptedCondition = obj.status.conditions.find(
    (cond: any) => cond.type === 'Accepted' && cond.status === 'True',
  );
  const acceptedConditionFalse = obj.status.conditions.find(
    (cond: any) => cond.type === 'Accepted' && cond.status === 'False',
  );
  const overriddenCondition = obj.status.conditions.find(
    (cond: any) => cond.type === 'Overridden' && cond.status === 'False',
  );
  const conflictedCondition = obj.status.conditions.find(
    (cond: any) => cond.reason === 'Conflicted' && cond.status === 'False',
  );
  const targetNotFoundCondition = obj.status.conditions.find(
    (cond: any) => cond.reason === 'TargetNotFound' && cond.status === 'False',
  );
  const unknownCondition = obj.status.conditions.find(
    (cond: any) => cond.reason === 'Unknown' && cond.status === 'False',
  );

  let labelText: string;
  let color: 'blue' | 'green' | 'red' | 'orange' | 'grey' | 'purple' | 'cyan';
  let icon: React.ReactNode;

  if (enforcedCondition) {
    labelText = 'Enforced';
    color = 'green';
    icon = <CheckCircleIcon />;
  } else if (overriddenCondition) {
    labelText = 'Overridden (Not Enforced)';
    color = 'grey';
    icon = <LayerGroupIcon />;
  } else if (acceptedCondition) {
    labelText = 'Accepted (Not Enforced)';
    color = 'purple';
    icon = <UploadIcon />;
  } else if (conflictedCondition) {
    labelText = 'Conflicted (Not Accepted)';
    color = 'red';
    icon = <ExclamationTriangleIcon />;
  } else if (targetNotFoundCondition) {
    labelText = 'TargetNotFound (Not Accepted)';
    color = 'red';
    icon = <ExclamationTriangleIcon />;
  } else if (unknownCondition) {
    labelText = 'Unknown (Not Accepted)';
    color = 'orange';
    icon = <ExclamationTriangleIcon />;
  } else if (acceptedConditionFalse) {
    labelText = 'Invalid (Not Accepted)';
    color = 'red';
    icon = <ExclamationTriangleIcon />;
  } else {
    labelText = 'Unknown';
    color = 'grey';
    icon = <ExclamationTriangleIcon />;
  }

  return (
    <Label isCompact icon={icon} color={color}>
      {labelText}
    </Label>
  );
};

type ResourceListProps = {
  resources: Array<{
    group: string;
    version: string;
    kind: string;
  }>;
  namespace?: string;
  paginationLimit?: number;
  columns?: TableColumn<K8sResourceCommon>[];
};

const ResourceList: React.FC<ResourceListProps> = ({
  resources,
  namespace = '#ALL_NS#',
  paginationLimit = 10,
  columns,
}) => {
  const { t } = useTranslation();

  const resourceDescriptors: { [key: string]: WatchK8sResource } = resources.reduce(
    (acc, resource, index) => {
      const key = `${resource.group}-${resource.version}-${resource.kind}-${index}`;
      acc[key] = {
        groupVersionKind: {
          group: resource.group,
          version: resource.version,
          kind: resource.kind,
        },
        namespace: namespace === '#ALL_NS#' ? undefined : namespace,
        isList: true,
      };
      return acc;
    },
    {} as { [key: string]: WatchK8sResource },
  );

  const watchedResources = useK8sWatchResources<{ [key: string]: K8sResourceCommon[] }>(
    resourceDescriptors,
  );

  const allData = Object.values(watchedResources).flatMap((res) =>
    res.loaded && !res.loadError ? (res.data as K8sResourceCommon[]) : [],
  );

  const allLoaded = Object.values(watchedResources).every((res) => res.loaded);

  const loadErrors = Object.values(watchedResources)
    .filter((res) => res.loadError)
    .map((res) => res.loadError);

  const combinedLoadError =
    loadErrors.length > 0 ? new Error(loadErrors.map((err) => err.message).join('; ')) : null;

  const [data, filteredData, onFilterChange] = useListPageFilter(allData);

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
      title: '', // No title for the kebab column
      id: 'kebab',
      props: { className: 'pf-v5-c-table__action' },
    },
  ];

  const usedColumns = columns || defaultColumns;

  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [perPage, setPerPage] = React.useState<number>(paginationLimit);

  const startIndex = (currentPage - 1) * perPage;
  const endIndex = startIndex + perPage;
  const paginatedData = filteredData.slice(startIndex, endIndex);

  const onSetPage = (
    _event: React.MouseEvent | React.KeyboardEvent | MouseEvent,
    pageNumber: number,
  ) => {
    setCurrentPage(pageNumber);
  };

  const onPerPageSelect = (
    _event: React.MouseEvent | React.KeyboardEvent | MouseEvent,
    perPageNumber: number,
  ) => {
    setPerPage(perPageNumber);
    setCurrentPage(1);
  };

  const ResourceRow: React.FC<RowProps<K8sResourceCommon>> = ({ obj, activeColumnIDs }) => {
    const { apiVersion, kind } = obj;
    const [group, version] = apiVersion.includes('/') ? apiVersion.split('/') : ['', apiVersion];

    return (
      <>
        {usedColumns.map((column) => {
          switch (column.id) {
            case 'name':
              return (
                <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
                  <ResourceLink
                    groupVersionKind={{ group, version, kind }}
                    name={obj.metadata.name}
                    namespace={obj.metadata.namespace}
                  />
                </TableData>
              );
            case 'type':
              return (
                <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
                  {kind}
                </TableData>
              );
            case 'namespace':
              return (
                <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
                  <ResourceLink
                    groupVersionKind={{ version: 'v1', kind: 'Namespace' }}
                    name={obj.metadata.namespace}
                  />
                </TableData>
              );
            case 'Status':
              return (
                <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
                  {getStatusLabel(obj)}
                </TableData>
              );
            case 'Created':
              return (
                <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
                  <Timestamp timestamp={obj.metadata.creationTimestamp} />
                </TableData>
              );
            case 'kebab':
              return (
                <TableData
                  key={column.id}
                  id={column.id}
                  activeColumnIDs={activeColumnIDs}
                  className="pf-v5-c-table__action"
                >
                  <DropdownWithKebab obj={obj} />
                </TableData>
              );
            default:
              return null;
          }
        })}
      </>
    );
  };

  return (
    <>
      {combinedLoadError && (
        <AlertGroup>
          <Alert title="Error loading resources" variant="danger" isInline>
            {combinedLoadError.message}
          </Alert>
        </AlertGroup>
      )}
      <div className="kuadrant-policy-list-body">
        <ListPageBody>
          <ListPageFilter data={data} loaded={allLoaded} onFilterChange={onFilterChange} />
          <VirtualizedTable<K8sResourceCommon>
            data={paginatedData}
            unfilteredData={data}
            loaded={allLoaded}
            loadError={combinedLoadError}
            columns={usedColumns}
            Row={ResourceRow}
          />
          <Pagination
            itemCount={filteredData.length}
            perPage={perPage}
            page={currentPage}
            onSetPage={onSetPage}
            onPerPageSelect={onPerPageSelect}
            variant="bottom"
            perPageOptions={[
              { title: '5', value: 5 },
              { title: '10', value: 10 },
              { title: '20', value: 20 },
            ]}
          />
        </ListPageBody>
      </div>
    </>
  );
};

export default ResourceList;
