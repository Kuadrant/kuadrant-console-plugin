import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { sortable } from '@patternfly/react-table';
import {
  Alert,
  AlertGroup,
  Pagination,
  Label,
  EmptyState,
  EmptyStateIcon,
  EmptyStateBody,
  Title,
  Tooltip,
} from '@patternfly/react-core';
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
import { SearchIcon } from '@patternfly/react-icons';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  LayerGroupIcon,
  UploadIcon,
  OutlinedHourglassIcon,
} from '@patternfly/react-icons';
import DropdownWithKebab from './DropdownWithKebab';

const generateLabelWithTooltip = (labelText, color, icon, tooltipText) => {
  return (
    <Tooltip content={tooltipText} position="top" enableFlip>
      <Label isCompact icon={icon} color={color}>
        {labelText}
      </Label>
    </Tooltip>
  );
};

const getStatusLabel = (obj) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  const tooltipTexts = {
    Enforced: t('The resource is accepted, programmed, and all policies are enforced.'),
    'Accepted (Not Enforced)': t('The resource is accepted but not all policies are enforced.'),
    Programmed: t('The resource is programmed but not fully enforced.'),
    Conflicted: t('There is a conflict on the resource.'),
    'Resolved Refs': t('All references for the resource have been resolved.'),
    Unknown: t('The status of the resource is unknown.'),
    Creating: t('The resource is being created.'),
    'Overridden (Not Enforced)': t('The resource is overridden and not enforced.'),
    'Conflicted (Not Accepted)': t('There is a conflict and the resource is not accepted.'),
    'TargetNotFound (Not Accepted)': t(
      'The target for the resource was not found and it is not accepted.',
    ),
    'Unknown (Not Accepted)': t('The resource has an unknown status and is not accepted.'),
    'Invalid (Not Accepted)': t('The resource is invalid and not accepted.'),
  };

  const { kind, status } = obj;

  const policiesMap = {
    Gateway: [
      'kuadrant.io/DNSPolicyAffected',
      'kuadrant.io/TLSPolicyAffected',
      'kuadrant.io/AuthPolicyAffected',
      'kuadrant.io/RateLimitPolicyAffected',
    ],
    HTTPRoute: ['kuadrant.io/AuthPolicyAffected', 'kuadrant.io/RateLimitPolicyAffected'],
  };

  const policiesAffected = policiesMap[kind] || [];

  const hasAllPoliciesEnforced = (conditions) => {
    const relevantPolicies = policiesAffected.filter((policy) =>
      conditions.some((cond) => cond.type === policy),
    );

    return relevantPolicies.every((policy) =>
      conditions.some((cond) => cond.type === policy && cond.status === 'True'),
    );
  };

  const hasAnyPolicyError = (conditions) => {
    return policiesAffected.some((policy) =>
      conditions.some((cond) => cond.type === policy && cond.status === 'False'),
    );
  };

  if (kind === 'Gateway') {
    const conditions = status?.conditions || [];

    const acceptedCondition = conditions.find(
      (cond) => cond.type === 'Accepted' && cond.status === 'True',
    );
    const programmedCondition = conditions.find(
      (cond) => cond.type === 'Programmed' && cond.status === 'True',
    );

    if (acceptedCondition && programmedCondition) {
      if (hasAllPoliciesEnforced(conditions) && !hasAnyPolicyError(conditions)) {
        return generateLabelWithTooltip(
          'Enforced',
          'green',
          <CheckCircleIcon />,
          tooltipTexts['Enforced'],
        );
      } else {
        return generateLabelWithTooltip(
          'Accepted (Not Enforced)',
          'purple',
          <UploadIcon />,
          tooltipTexts['Accepted (Not Enforced)'],
        );
      }
    } else if (programmedCondition) {
      return generateLabelWithTooltip(
        'Programmed',
        'blue',
        <CheckCircleIcon />,
        tooltipTexts['Programmed'],
      );
    } else if (conditions.some((cond) => cond.type === 'Conflicted' && cond.status === 'True')) {
      return generateLabelWithTooltip(
        'Conflicted',
        'red',
        <ExclamationTriangleIcon />,
        tooltipTexts['Conflicted'],
      );
    } else if (conditions.some((cond) => cond.type === 'ResolvedRefs' && cond.status === 'True')) {
      return generateLabelWithTooltip(
        'Resolved Refs',
        'blue',
        <CheckCircleIcon />,
        tooltipTexts['Resolved Refs'],
      );
    } else {
      return generateLabelWithTooltip(
        'Unknown',
        'orange',
        <ExclamationTriangleIcon />,
        tooltipTexts['Unknown'],
      );
    }
  }

  if (policiesAffected.length > 0) {
    const parentConditions = status?.parents?.flatMap((parent) => parent.conditions) || [];

    const acceptedCondition = parentConditions.find(
      (cond) => cond.type === 'Accepted' && cond.status === 'True',
    );
    const conflictedCondition = parentConditions.find(
      (cond) => cond.type === 'Conflicted' && cond.status === 'True',
    );
    const resolvedRefsCondition = parentConditions.find(
      (cond) => cond.type === 'ResolvedRefs' && cond.status === 'True',
    );

    if (acceptedCondition) {
      if (hasAllPoliciesEnforced(parentConditions) && !hasAnyPolicyError(parentConditions)) {
        return generateLabelWithTooltip(
          'Enforced',
          'green',
          <CheckCircleIcon />,
          tooltipTexts['Enforced'],
        );
      } else {
        return generateLabelWithTooltip(
          'Accepted (Not Enforced)',
          'purple',
          <UploadIcon />,
          tooltipTexts['Accepted (Not Enforced)'],
        );
      }
    } else if (conflictedCondition) {
      return generateLabelWithTooltip(
        'Conflicted',
        'red',
        <ExclamationTriangleIcon />,
        tooltipTexts['Conflicted'],
      );
    } else if (resolvedRefsCondition) {
      return generateLabelWithTooltip(
        'Resolved Refs',
        'blue',
        <CheckCircleIcon />,
        tooltipTexts['Resolved Refs'],
      );
    } else {
      return generateLabelWithTooltip(
        'Unknown',
        'orange',
        <ExclamationTriangleIcon />,
        tooltipTexts['Unknown'],
      );
    }
  }

  const generalConditions = status?.conditions || [];

  if (generalConditions.length === 0) {
    return generateLabelWithTooltip(
      'Creating',
      'cyan',
      <OutlinedHourglassIcon />,
      tooltipTexts['Creating'],
    );
  }

  const enforcedCondition = generalConditions.find(
    (cond) => cond.type === 'Enforced' && cond.status === 'True',
  );
  const acceptedCondition = generalConditions.find(
    (cond) => cond.type === 'Accepted' && cond.status === 'True',
  );
  const acceptedConditionFalse = generalConditions.find(
    (cond) => cond.type === 'Accepted' && cond.status === 'False',
  );
  const overriddenCondition = generalConditions.find(
    (cond) => cond.type === 'Overridden' && cond.status === 'False',
  );
  const conflictedCondition = generalConditions.find(
    (cond) => cond.reason === 'Conflicted' && cond.status === 'False',
  );
  const targetNotFoundCondition = generalConditions.find(
    (cond) => cond.reason === 'TargetNotFound' && cond.status === 'False',
  );
  const unknownCondition = generalConditions.find(
    (cond) => cond.reason === 'Unknown' && cond.status === 'False',
  );

  if (enforcedCondition) {
    return generateLabelWithTooltip(
      'Enforced',
      'green',
      <CheckCircleIcon />,
      tooltipTexts['Enforced'],
    );
  } else if (overriddenCondition) {
    return generateLabelWithTooltip(
      'Overridden (Not Enforced)',
      'grey',
      <LayerGroupIcon />,
      tooltipTexts['Overridden (Not Enforced)'],
    );
  } else if (acceptedCondition) {
    return generateLabelWithTooltip(
      'Accepted (Not Enforced)',
      'purple',
      <UploadIcon />,
      tooltipTexts['Accepted (Not Enforced)'],
    );
  } else if (conflictedCondition) {
    return generateLabelWithTooltip(
      'Conflicted (Not Accepted)',
      'red',
      <ExclamationTriangleIcon />,
      tooltipTexts['Conflicted (Not Accepted)'],
    );
  } else if (targetNotFoundCondition) {
    return generateLabelWithTooltip(
      'TargetNotFound (Not Accepted)',
      'red',
      <ExclamationTriangleIcon />,
      tooltipTexts['TargetNotFound (Not Accepted)'],
    );
  } else if (unknownCondition) {
    return generateLabelWithTooltip(
      'Unknown (Not Accepted)',
      'orange',
      <ExclamationTriangleIcon />,
      tooltipTexts['Unknown (Not Accepted)'],
    );
  } else if (acceptedConditionFalse) {
    return generateLabelWithTooltip(
      'Invalid (Not Accepted)',
      'red',
      <ExclamationTriangleIcon />,
      tooltipTexts['Invalid (Not Accepted)'],
    );
  } else {
    return generateLabelWithTooltip(
      'Unknown',
      'grey',
      <ExclamationTriangleIcon />,
      tooltipTexts['Unknown'],
    );
  }
};

type ResourceListProps = {
  resources: Array<{
    group: string;
    version: string;
    kind: string;
  }>;
  namespace?: string;
  emtpyResourceName?: string;
  paginationLimit?: number;
  columns?: TableColumn<K8sResourceCommon>[];
};

const ResourceList: React.FC<ResourceListProps> = ({
  resources,
  namespace = '#ALL_NS#',
  paginationLimit = 10,
  columns,
  emtpyResourceName = 'Policies',
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

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
          {paginatedData.length === 0 && allLoaded ? (
            <EmptyState>
              <EmptyStateIcon icon={SearchIcon} />
              <Title headingLevel="h4" size="lg">
                {t('No')} {emtpyResourceName} {t('found')}
              </Title>
              <EmptyStateBody>
                {t('There are no')} {emtpyResourceName} {t('to display - please create some.')}
              </EmptyStateBody>
            </EmptyState>
          ) : (
            <VirtualizedTable<K8sResourceCommon>
              data={paginatedData}
              unfilteredData={data}
              loaded={allLoaded}
              loadError={combinedLoadError}
              columns={usedColumns}
              Row={ResourceRow}
            />
          )}

          {paginatedData.length > 0 && (
            <div className="kuadrant-pagination-left">
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
            </div>
          )}
        </ListPageBody>
      </div>
    </>
  );
};

export default ResourceList;
