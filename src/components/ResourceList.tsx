import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { SortByDirection } from '@patternfly/react-table';
import {
  Alert,
  AlertGroup,
  Pagination,
  EmptyState,
  EmptyStateBody,
  Title,
} from '@patternfly/react-core';
import {
  DataViewCheckboxFilter,
  DataViewFilters,
  DataViewTextFilter,
  DataViewToolbar,
} from '@patternfly/react-data-view';
import {
  K8sResourceCommon,
  ResourceLink,
  useK8sWatchResources,
  Timestamp,
  WatchK8sResource,
  ListPageBody,
} from '@openshift-console/dynamic-plugin-sdk';
import { SearchIcon } from '@patternfly/react-icons';
import { getStatusLabel, getStatusSortRank } from '../utils/statusLabel';
import DropdownWithKebab from './DropdownWithKebab';
import useAccessReviews from '../utils/resourceRBAC';
import { getResourceNameFromKind } from '../utils/getModelFromResource';
import KuadrantDataView, {
  KuadrantDataViewColumn,
  useKuadrantDataViewPagination,
} from './KuadrantDataView';

type AdditionalFilter = {
  label: string;
  allLabel: string;
  options: string[];
  filterFn: (item: K8sResourceCommon, selectedValue: string) => boolean;
};

type ResourceRenderers = Record<
  string,
  (
    column: KuadrantDataViewColumn<K8sResourceCommon>,
    resource: K8sResourceCommon,
  ) => React.ReactNode
>;

type ResourceListProps = {
  resources: Array<{
    group: string;
    version: string;
    kind: string;
  }>;
  namespace?: string;
  emptyResourceName?: string;
  paginationLimit?: number;
  columns?: KuadrantDataViewColumn<K8sResourceCommon>[];
  renderers?: ResourceRenderers;
  additionalFilters?: AdditionalFilter[];
  dataFilter?: (item: K8sResourceCommon) => boolean;
  hideTypeFilter?: boolean;
};

type ResourceFilterValues = {
  name: string;
  namespace: string;
  type: string;
  [key: string]: string | string[];
};

const ResourceList: React.FC<ResourceListProps> = ({
  resources,
  namespace = '#ALL_NS#',
  paginationLimit = 10,
  columns,
  renderers,
  emptyResourceName = 'Policies',
  additionalFilters = [],
  dataFilter,
  hideTypeFilter = false,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  const resolvedNamespace = namespace === '#ALL_NS#' ? undefined : namespace;
  const accessResources = resources.map((r) => ({
    ...r,
    kind: getResourceNameFromKind(r.kind),
    namespace: resolvedNamespace,
  }));

  const { userRBAC, loading: rbacLoading } = useAccessReviews(accessResources);

  // Generate resource mappings dynamically from the resources prop
  const resourceMappings = resources.map((resource) => ({
    key: `${getResourceNameFromKind(resource.kind)}-list`,
    group: resource.group,
    version: resource.version,
    kind: resource.kind,
  }));

  // filter out resources that the user doesn't have permission to list
  const filteredResources = resources.filter((resource) => {
    const mapping = resourceMappings.find((m) => m.kind === resource.kind);
    const allowed = mapping ? userRBAC[mapping.key] : false;
    return allowed;
  });

  const resourceDescriptors: { [key: string]: WatchK8sResource } = filteredResources.reduce(
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

  const allData = React.useMemo(
    () =>
      Object.values(watchedResources).flatMap((res) =>
        res.loaded && !res.loadError ? (res.data as K8sResourceCommon[]) : [],
      ),
    [watchedResources],
  );

  const allLoaded = !rbacLoading && Object.values(watchedResources).every((res) => res.loaded);

  const loadErrors = Object.values(watchedResources)
    .filter((res) => res.loadError)
    .map((res) => res.loadError);
  const combinedLoadError =
    loadErrors.length > 0 ? new Error(loadErrors.map((err) => err.message).join('; ')) : null;

  const additionalFilterEntries = React.useMemo(
    () =>
      additionalFilters.map((filter, index) => ({
        filter,
        id: `additional-${index}`,
      })),
    [additionalFilters],
  );
  const [filterValues, setFilterValues] = React.useState<ResourceFilterValues>({
    name: '',
    namespace: '',
    type: '',
  });

  const emptyFilterValues = React.useMemo<ResourceFilterValues>(
    () =>
      additionalFilterEntries.reduce((values, { id }) => ({ ...values, [id]: [] }), {
        name: '',
        namespace: '',
        type: '',
      } as ResourceFilterValues),
    [additionalFilterEntries],
  );

  const filteredData = React.useMemo(() => {
    const preFiltered = dataFilter ? allData.filter(dataFilter) : allData;
    return preFiltered.filter((item) => {
      const nameFilter = filterValues.name.toLowerCase();
      const namespaceFilter = filterValues.namespace.toLowerCase();
      const typeFilter = filterValues.type.toLowerCase();
      const matchesStandardFilters =
        (!nameFilter || item.metadata.name.toLowerCase().includes(nameFilter)) &&
        (!namespaceFilter || item.metadata.namespace?.toLowerCase().includes(namespaceFilter)) &&
        (!typeFilter || item.kind.toLowerCase().includes(typeFilter));

      return (
        matchesStandardFilters &&
        additionalFilterEntries.every(({ filter, id }) => {
          const selectedValues = filterValues[id];
          return (
            !Array.isArray(selectedValues) ||
            selectedValues.length === 0 ||
            selectedValues.some((value) => filter.filterFn(item, value))
          );
        })
      );
    });
  }, [additionalFilterEntries, allData, filterValues, dataFilter]);

  const defaultColumns = React.useMemo<KuadrantDataViewColumn<K8sResourceCommon>[]>(
    () => [
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
        title: t('plugin__kuadrant-console-plugin~Target'),
        id: 'target',
      },
      {
        title: t('plugin__kuadrant-console-plugin~Status'),
        id: 'Status',
        sort: (data: K8sResourceCommon[], direction: SortByDirection) => {
          const sorted = [...data].sort((a, b) => getStatusSortRank(a) - getStatusSortRank(b));
          return direction === SortByDirection.desc ? sorted.reverse() : sorted;
        },
      },
      {
        title: t('plugin__kuadrant-console-plugin~Created'),
        id: 'Created',
        sort: 'metadata.creationTimestamp',
      },
      {
        title: '', // No title for the kebab column
        id: 'kebab',
        props: { className: 'pf-v6-c-table__action' },
      },
    ],
    [t],
  );

  const usedColumns = columns || defaultColumns;

  const {
    page: currentPage,
    perPage,
    onSetPage,
    onPerPageSelect,
    resetPage,
  } = useKuadrantDataViewPagination(filteredData.length, paginationLimit);

  const onFilterChange = (_filterId: string, values: Partial<ResourceFilterValues>) => {
    resetPage();
    setFilterValues((current) => ({ ...current, ...values }));
  };

  const clearAllFilters = () => {
    setFilterValues(emptyFilterValues);
    resetPage();
  };

  const getRow = React.useCallback(
    (obj: K8sResourceCommon) => {
      const { apiVersion, kind } = obj;
      const [group, version] = apiVersion.includes('/') ? apiVersion.split('/') : ['', apiVersion];

      return usedColumns.map((column) => {
        if (renderers?.[column.id]) {
          return renderers[column.id](column, obj);
        }

        switch (column.id) {
          case 'name':
            return (
              <ResourceLink
                groupVersionKind={{ group, version, kind }}
                name={obj.metadata.name}
                namespace={obj.metadata.namespace}
              />
            );
          case 'type':
            return kind;
          case 'namespace':
            return obj.metadata.namespace ? (
              <ResourceLink
                groupVersionKind={{ version: 'v1', kind: 'Namespace' }}
                name={obj.metadata.namespace}
              />
            ) : (
              '-'
            );
          case 'target': {
            const targetRef = (
              obj as K8sResourceCommon & {
                spec?: {
                  targetRef?: { group: string; version?: string; kind: string; name: string };
                };
              }
            ).spec?.targetRef;
            return targetRef ? (
              <ResourceLink
                groupVersionKind={{
                  group: targetRef.group,
                  version: targetRef.version || 'v1',
                  kind: targetRef.kind,
                }}
                name={targetRef.name}
                namespace={obj.metadata.namespace}
              />
            ) : (
              '-'
            );
          }
          case 'Status':
            return getStatusLabel(t, obj);
          case 'Created':
            return <Timestamp timestamp={obj.metadata.creationTimestamp} />;
          case 'kebab':
            return {
              cell: <DropdownWithKebab obj={obj} />,
              props: { isActionCell: true },
            };
          default:
            return null;
        }
      });
    },
    [renderers, t, usedColumns],
  );

  return (
    <>
      {combinedLoadError && (
        <AlertGroup>
          <Alert title={t('Error loading resources')} variant="danger" isInline>
            {combinedLoadError.message}
          </Alert>
        </AlertGroup>
      )}
      <div className="kuadrant-policy-list-body">
        <ListPageBody>
          <DataViewToolbar
            clearAllFilters={clearAllFilters}
            filters={
              <DataViewFilters<ResourceFilterValues>
                onChange={onFilterChange}
                values={filterValues}
                ouiaId="ResourceListDataViewFilters"
              >
                <DataViewTextFilter
                  filterId="name"
                  title={t('Name')}
                  placeholder={t('Search by {{filterValue}}...', {
                    filterValue: t('Name').toLowerCase(),
                  })}
                  ouiaId="ResourceListNameFilter"
                />
                <DataViewTextFilter
                  filterId="namespace"
                  title={t('Namespace')}
                  placeholder={t('Search by {{filterValue}}...', {
                    filterValue: t('Namespace').toLowerCase(),
                  })}
                  ouiaId="ResourceListNamespaceFilter"
                />
                {!hideTypeFilter && (
                  <DataViewTextFilter
                    filterId="type"
                    title={t('Type')}
                    placeholder={t('Search by {{filterValue}}...', {
                      filterValue: t('Type').toLowerCase(),
                    })}
                    ouiaId="ResourceListTypeFilter"
                  />
                )}
                {additionalFilterEntries.map(({ filter, id }) => (
                  <DataViewCheckboxFilter
                    key={id}
                    filterId={id}
                    title={filter.label}
                    placeholder={filter.allLabel}
                    options={filter.options}
                    ouiaId={`ResourceListAdditionalFilter-${id}`}
                  />
                ))}
              </DataViewFilters>
            }
            ouiaId="ResourceListDataViewToolbar"
          />
          {filteredData.length === 0 && allLoaded ? (
            <EmptyState
              titleText={
                <Title headingLevel="h4" size="lg">
                  {t('No {{resourceName}} found', { resourceName: emptyResourceName })}
                </Title>
              }
              icon={SearchIcon}
            >
              <EmptyStateBody>
                {t('There are no {{resourceName}} to display - please create some.', {
                  resourceName: emptyResourceName,
                })}
              </EmptyStateBody>
            </EmptyState>
          ) : (
            <KuadrantDataView<K8sResourceCommon>
              ariaLabel={emptyResourceName}
              data={filteredData}
              loaded={allLoaded}
              loadError={combinedLoadError}
              columns={usedColumns}
              getRow={getRow}
              page={currentPage}
              perPage={perPage}
              ouiaId="ResourceListDataView"
            />
          )}

          {filteredData.length > 0 && (
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
