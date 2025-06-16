import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { sortable } from '@patternfly/react-table';
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
import { getStatusLabel } from '../utils/statusLabel';
import DropdownWithKebab from './DropdownWithKebab';
import useAccessReviews from '../utils/resourceRBAC';
import { getResourceNameFromKind } from '../utils/getModelFromResource';

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
  renderers?: Record<
    string,
    (
      column: TableColumn<K8sResourceCommon>,
      resource: K8sResourceCommon,
      activeColumnIDs: Set<string>,
    ) => React.ReactNode
  >;
};

const ResourceList: React.FC<ResourceListProps> = ({
  resources,
  namespace = '#ALL_NS#',
  paginationLimit = 10,
  columns,
  renderers,
  emtpyResourceName = 'Policies',
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  const accessResources = resources.map((r) => ({
    ...r,
    kind: getResourceNameFromKind(r.kind),
  }));

  const { userRBAC } = useAccessReviews(accessResources);

  const resourceKinds = [
    'AuthPolicy',
    'RateLimitPolicy',
    'DNSPolicy',
    'TLSPolicy',
    'Gateway',
    'HTTPRoute',
  ];

  const resourceMappings = resourceKinds.map((kind) => ({
    key: `${getResourceNameFromKind(kind)}-list`,
    group: 'kuadrant.io',
    version: 'v1',
    kind,
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

  const allLoaded = Object.values(watchedResources).every((res) => res.loaded);

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
  };

  React.useEffect(() => {
    let data = allData;
    if (filters) {
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
  }, [allData, filters, filterSelected]);

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
                    {['Name', 'Namespace', 'Type'].map((option, index) => (
                      <SelectOption key={index} value={option}>
                        {option}
                      </SelectOption>
                    ))}
                  </Select>
                </ToolbarItem>

                <ToolbarItem>
                  <InputGroup className="pf-v5-c-input-group co-filter-group">
                    <TextInput
                      type="text"
                      placeholder={t('Search by {{filterValue}}...', {
                        filterValue: filterSelected.toLowerCase(),
                      })}
                      onChange={(_event, value) => handleFilterChange(value)}
                      className="pf-v5-c-form-control co-text-filter-with-icon"
                      aria-label="Resource search"
                    />
                  </InputGroup>
                </ToolbarItem>
              </ToolbarGroup>
            </ToolbarContent>
          </Toolbar>
          {paginatedData.length === 0 && allLoaded ? (
            <EmptyState
              titleText={
                <Title headingLevel="h4" size="lg">
                  {t('No')} {emtpyResourceName} {t('found')}
                </Title>
              }
              icon={SearchIcon}
            >
              <EmptyStateBody>
                {t('There are no')} {emtpyResourceName} {t('to display - please create some.')}
              </EmptyStateBody>
            </EmptyState>
          ) : (
            <VirtualizedTable<K8sResourceCommon>
              data={paginatedData}
              unfilteredData={filteredData}
              loaded={allLoaded}
              loadError={combinedLoadError}
              columns={usedColumns}
              Row={ResourceRow}
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
