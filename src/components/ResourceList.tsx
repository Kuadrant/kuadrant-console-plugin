import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { sortable, SortByDirection } from '@patternfly/react-table';
import {
  Alert,
  AlertGroup,
  Pagination,
  EmptyState,
  EmptyStateBody,
  Title,
  ToolbarItem,
  ToolbarGroup,
  Select,
  MenuToggle,
  InputGroup,
  TextInput,
  MenuToggleElement,
  SelectList,
  SelectOption,
  Toolbar,
  ToolbarContent,
} from '@patternfly/react-core';
import {
  K8sResourceCommon,
  ResourceLink,
  useK8sWatchResources,
  VirtualizedTable,
  Timestamp,
  RowProps,
  TableColumn,
  WatchK8sResource,
  ListPageBody,
  TableData,
} from '@openshift-console/dynamic-plugin-sdk';
import { SearchIcon } from '@patternfly/react-icons';
import { getStatusLabel, getStatusSortRank } from '../utils/statusLabel';
import DropdownWithKebab from './DropdownWithKebab';
import useAccessReviews from '../utils/resourceRBAC';
import { getResourceNameFromKind } from '../utils/getModelFromResource';

type AdditionalFilter = {
  label: string;
  allLabel: string;
  options: string[];
  filterFn: (item: K8sResourceCommon, selectedValue: string) => boolean;
};

type ResourceListProps = {
  resources: Array<{
    group: string;
    version: string;
    kind: string;
  }>;
  namespace?: string;
  emptyResourceName?: string;
  paginationLimit?: number;
  columns?: TableColumn<K8sResourceCommon>[];
  renderers?: Record<
    string,
    (
      column: TableColumn<K8sResourceCommon>,
      resource: K8sResourceCommon,
      activeColumnIDs: Set<string>,
    ) => React.ReactNode
  >;
  additionalFilters?: AdditionalFilter[];
};

const getNestedValue = (obj: unknown, path: string): unknown =>
  path.split('.').reduce((acc, key) => (acc as Record<string, unknown>)?.[key], obj);

const ResourceList: React.FC<ResourceListProps> = ({
  resources,
  namespace = '#ALL_NS#',
  paginationLimit = 10,
  columns,
  renderers,
  emptyResourceName = 'Policies',
  additionalFilters = [],
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

  // Implement local filter state
  const [filters, setFilters] = React.useState<string>('');
  const [isOpen, setIsOpen] = React.useState(false);
  const [filterSelected, setFilterSelected] = React.useState('Name');
  const [filteredData, setFilteredData] = React.useState<K8sResourceCommon[]>([]);

  const onToggleClick = () => setIsOpen(!isOpen);

  const onFilterSelect = (
    _event: React.MouseEvent<Element, MouseEvent> | undefined,
    selection: string,
  ) => {
    setFilterSelected(selection);
    setIsOpen(false);
    setAdditionalFilterValue('');
    setFilters('');
  };

  const [additionalFilterValue, setAdditionalFilterValue] = React.useState('');
  const [isAdditionalFilterOpen, setIsAdditionalFilterOpen] = React.useState(false);

  const activeAdditionalFilter = additionalFilters.find((f) => f.label === filterSelected);

  React.useEffect(() => {
    let data = allData;
    if (activeAdditionalFilter) {
      if (additionalFilterValue) {
        data = data.filter((item) => activeAdditionalFilter.filterFn(item, additionalFilterValue));
      }
    } else if (filters) {
      const filterValue = filters.toLowerCase();
      data = data.filter((item) => {
        if (filterSelected === 'Name') {
          return item.metadata.name.toLowerCase().includes(filterValue);
        } else if (filterSelected === 'Namespace') {
          return item.metadata.namespace?.toLowerCase().includes(filterValue);
        } else if (filterSelected === 'Type') {
          return item.kind.toLowerCase().includes(filterValue);
        }
        return true;
      });
    }
    setFilteredData(data);
  }, [allData, filters, filterSelected, additionalFilterValue, activeAdditionalFilter]);

  const defaultColumns = React.useMemo<TableColumn<K8sResourceCommon>[]>(
    () => [
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
        title: t('plugin__kuadrant-console-plugin~Target'),
        id: 'target',
      },
      {
        title: t('plugin__kuadrant-console-plugin~Status'),
        id: 'Status',
        sort: (data: K8sResourceCommon[], direction: SortByDirection) => {
          const sorted = [...data].sort((a, b) => getStatusSortRank(b) - getStatusSortRank(a));
          return direction === SortByDirection.desc ? sorted.reverse() : sorted;
        },
        transforms: [sortable],
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
        props: { className: 'pf-v6-c-table__action' },
      },
    ],
    [t],
  );

  const usedColumns = columns || defaultColumns;

  const [activeSortIndex, setActiveSortIndex] = React.useState<number>(-1);
  const [activeSortDirection, setActiveSortDirection] = React.useState<SortByDirection>(
    SortByDirection.asc,
  );

  const activeSortIndexRef = React.useRef(-1);
  const activeSortDirectionRef = React.useRef<SortByDirection>(SortByDirection.asc);
  const filteredDataRef = React.useRef(filteredData);
  const currentPageRef = React.useRef(1);
  const perPageRef = React.useRef(paginationLimit);

  React.useEffect(() => {
    filteredDataRef.current = filteredData;
  }, [filteredData]);

  // Blocks auto-sort calls VirtualizedTable makes on mount (before user interaction)
  const readyForUserSortRef = React.useRef(false);
  React.useEffect(() => {
    readyForUserSortRef.current = true;
  }, []);

  // Guards against VT's second synchronous sort call after a reset click
  const justResetRef = React.useRef(false);
  const [tableKey, setTableKey] = React.useState(0);

  const interceptedColumns = React.useMemo(
    () =>
      usedColumns.map((col, idx) => {
        if (!col.sort) return col;
        const originalSort = col.sort;
        return {
          ...col,
          sort: (_data: K8sResourceCommon[], direction: SortByDirection): K8sResourceCommon[] => {
            const full = filteredDataRef.current;
            const si = (currentPageRef.current - 1) * perPageRef.current;

            if (!readyForUserSortRef.current) return [..._data];

            // VT calls sort twice per click - block the follow-up call after a reset
            if (justResetRef.current) {
              justResetRef.current = false;
              return full.slice(si, si + perPageRef.current);
            }

            const isUserClick =
              activeSortIndexRef.current !== idx || activeSortDirectionRef.current !== direction;

            if (isUserClick) {
              // 3rd click: same column, desc → asc cycle means user wants to reset sort
              const isReset =
                activeSortIndexRef.current === idx &&
                activeSortDirectionRef.current === SortByDirection.desc &&
                direction === SortByDirection.asc;

              if (isReset) {
                justResetRef.current = true;
                activeSortIndexRef.current = -1;
                activeSortDirectionRef.current = SortByDirection.asc;
                setActiveSortIndex(-1);
                setTableKey((k) => k + 1);
                return full.slice(si, si + perPageRef.current);
              }

              activeSortIndexRef.current = idx;
              activeSortDirectionRef.current = direction;
              setActiveSortIndex(idx);
              setActiveSortDirection(direction);
              setCurrentPage(1);
            }

            let sorted: K8sResourceCommon[];
            if (typeof originalSort === 'function') {
              sorted = originalSort([...full], direction);
            } else {
              const arr = [...full].sort((a, b) => {
                const aVal = String(getNestedValue(a, originalSort) ?? '');
                const bVal = String(getNestedValue(b, originalSort) ?? '');
                return aVal.localeCompare(bVal);
              });
              sorted = direction === SortByDirection.desc ? arr.reverse() : arr;
            }
            return sorted.slice(si, si + perPageRef.current);
          },
        };
      }),
    [usedColumns],
  );

  const sortedFilteredData = React.useMemo(() => {
    if (activeSortIndex < 0) return filteredData;
    const col = usedColumns[activeSortIndex];
    if (!col?.sort) return filteredData;
    if (typeof col.sort === 'function') {
      return col.sort([...filteredData], activeSortDirection);
    }
    const sorted = [...filteredData].sort((a, b) => {
      const aVal = String(getNestedValue(a, col.sort as string) ?? '');
      const bVal = String(getNestedValue(b, col.sort as string) ?? '');
      return aVal.localeCompare(bVal);
    });
    return activeSortDirection === SortByDirection.desc ? sorted.reverse() : sorted;
  }, [filteredData, activeSortIndex, activeSortDirection, usedColumns]);

  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [perPage, setPerPage] = React.useState<number>(paginationLimit);

  React.useEffect(() => {
    currentPageRef.current = currentPage;
    perPageRef.current = perPage;
  }, [currentPage, perPage]);

  const startIndex = (currentPage - 1) * perPage;
  const endIndex = startIndex + perPage;
  const paginatedData = sortedFilteredData.slice(startIndex, endIndex);

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

  const handleFilterChange = (value: string) => {
    setCurrentPage(1);
    setFilters(value);
  };

  const ResourceRow: React.FC<RowProps<K8sResourceCommon>> = ({ obj, activeColumnIDs }) => {
    const { apiVersion, kind } = obj;
    const [group, version] = apiVersion.includes('/') ? apiVersion.split('/') : ['', apiVersion];

    return (
      <>
        {usedColumns.map((column) => {
          if (renderers && renderers[column.id]) {
            return renderers[column.id](column, obj, activeColumnIDs);
          } else {
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
                    {obj.metadata.namespace ? (
                      <ResourceLink
                        groupVersionKind={{ version: 'v1', kind: 'Namespace' }}
                        name={obj.metadata.namespace}
                      />
                    ) : (
                      '-'
                    )}
                  </TableData>
                );
              case 'target': {
                const targetRef = (
                  obj as K8sResourceCommon & {
                    spec?: {
                      targetRef?: { group: string; version?: string; kind: string; name: string };
                    };
                  }
                ).spec?.targetRef;
                return (
                  <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
                    {targetRef ? (
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
                    )}
                  </TableData>
                );
              }
              case 'Status':
                return (
                  <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
                    {getStatusLabel(t, obj)}
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
                    className="pf-v6-c-table__action"
                  >
                    <DropdownWithKebab obj={obj} />
                  </TableData>
                );
              default:
                return null;
            }
          }
        })}
      </>
    );
  };

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
          <Toolbar>
            <ToolbarContent>
              <ToolbarGroup variant="filter-group">
                <ToolbarItem>
                  <Select
                    toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                      <MenuToggle ref={toggleRef} onClick={onToggleClick} isExpanded={isOpen}>
                        {filterSelected}
                      </MenuToggle>
                    )}
                    onSelect={onFilterSelect}
                    onOpenChange={setIsOpen}
                    isOpen={isOpen}
                  >
                    {['Name', 'Namespace', 'Type', ...additionalFilters.map((f) => f.label)].map(
                      (option, index) => (
                        <SelectOption key={index} value={option}>
                          {option}
                        </SelectOption>
                      ),
                    )}
                  </Select>
                </ToolbarItem>

                <ToolbarItem>
                  {activeAdditionalFilter ? (
                    <Select
                      isOpen={isAdditionalFilterOpen}
                      onOpenChange={(open) => setIsAdditionalFilterOpen(open)}
                      onSelect={(_event, value) => {
                        setCurrentPage(1);
                        setAdditionalFilterValue(value as string);
                        setIsAdditionalFilterOpen(false);
                      }}
                      selected={additionalFilterValue}
                      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                        <MenuToggle
                          ref={toggleRef}
                          onClick={() => setIsAdditionalFilterOpen(!isAdditionalFilterOpen)}
                        >
                          {additionalFilterValue || activeAdditionalFilter.allLabel}
                        </MenuToggle>
                      )}
                    >
                      <SelectList>
                        <SelectOption value="">{activeAdditionalFilter.allLabel}</SelectOption>
                        {activeAdditionalFilter.options.map((opt) => (
                          <SelectOption key={opt} value={opt}>
                            {opt}
                          </SelectOption>
                        ))}
                      </SelectList>
                    </Select>
                  ) : (
                    <InputGroup className="pf-v6-c-input-group co-filter-group">
                      <TextInput
                        type="text"
                        placeholder={t('Search by {{filterValue}}...', {
                          filterValue: filterSelected.toLowerCase(),
                        })}
                        onChange={(_event, value) => handleFilterChange(value)}
                        className="pf-v6-c-form-control co-text-filter-with-icon"
                        aria-label="Resource search"
                      />
                    </InputGroup>
                  )}
                </ToolbarItem>
              </ToolbarGroup>
            </ToolbarContent>
          </Toolbar>
          {paginatedData.length === 0 && allLoaded ? (
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
            <VirtualizedTable<K8sResourceCommon>
              key={tableKey}
              data={paginatedData}
              unfilteredData={filteredData}
              loaded={allLoaded}
              loadError={combinedLoadError}
              columns={interceptedColumns}
              Row={ResourceRow}
            />
          )}

          {sortedFilteredData.length > 0 && (
            <div className="kuadrant-pagination-left">
              <Pagination
                itemCount={sortedFilteredData.length}
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
