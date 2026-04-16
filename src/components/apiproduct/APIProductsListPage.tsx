import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  PageSection,
  Title,
  Label,
  LabelGroup,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
  Select,
  SelectOption,
  SelectList,
  MenuToggle,
  MenuToggleElement,
  InputGroup,
  TextInput,
  Pagination,
  EmptyState,
  EmptyStateBody,
  Alert,
  AlertGroup,
} from '@patternfly/react-core';
import { sortable } from '@patternfly/react-table';
import { SearchIcon } from '@patternfly/react-icons';
import {
  useActiveNamespace,
  TableColumn,
  ResourceLink,
  TableData,
  Timestamp,
  useK8sWatchResource,
  VirtualizedTable,
  RowProps,
  ListPageBody,
} from '@openshift-console/dynamic-plugin-sdk';
import { RESOURCES } from '../../utils/resources';
import { APIProduct, PlanPolicy } from './types';
import DropdownWithKebab from '../DropdownWithKebab';
import '../kuadrant.css';

const APIProductsListPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();

  // Watch APIProduct resources
  const [apiProducts, productsLoaded, productsLoadError] = useK8sWatchResource<APIProduct[]>({
    groupVersionKind: RESOURCES.APIProduct.gvk,
    namespace: activeNamespace === '#ALL_NS#' ? undefined : activeNamespace,
    isList: true,
  });

  // Watch PlanPolicy resources to link them to APIProducts
  const [planPolicies, planPoliciesLoaded] = useK8sWatchResource<PlanPolicy[]>({
    groupVersionKind: RESOURCES.PlanPolicy.gvk,
    namespace: activeNamespace === '#ALL_NS#' ? undefined : activeNamespace,
    isList: true,
  });

  // Filter state
  const [filters, setFilters] = React.useState<string>('');
  const [filterSelected, setFilterSelected] = React.useState<'name' | 'namespace'>('name');
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState<string>('');
  const [isStatusFilterOpen, setIsStatusFilterOpen] = React.useState(false);
  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [perPage, setPerPage] = React.useState<number>(10);

  // Build a lookup map: HTTPRoute key -> PlanPolicy
  // Key format: "namespace/routeName"
  const planPolicyMap = React.useMemo(() => {
    const map = new Map<string, PlanPolicy>();
    if (planPoliciesLoaded && planPolicies) {
      planPolicies.forEach((policy) => {
        const targetRef = policy.spec?.targetRef;
        if (targetRef && targetRef.kind === 'HTTPRoute' && targetRef.name) {
          // Use the policy's namespace if targetRef.namespace is not specified
          const targetNamespace = targetRef.namespace || policy.metadata?.namespace;
          const key = `${targetNamespace}/${targetRef.name}`;
          // Store first matching policy (could be extended to handle multiple)
          if (!map.has(key)) {
            map.set(key, policy);
          }
        }
      });
    }
    return map;
  }, [planPolicies, planPoliciesLoaded]);

  // Get unique status values for filter options
  const statusOptions = React.useMemo(() => {
    if (!apiProducts) return [];
    const statuses = new Set<string>();
    apiProducts.forEach((product) => {
      const status = product.spec?.publishStatus || 'Draft';
      statuses.add(status);
    });
    return Array.from(statuses).sort();
  }, [apiProducts]);

  // Apply filters to APIProducts
  const filteredProducts = React.useMemo(() => {
    if (!apiProducts) return [];

    return apiProducts.filter((product) => {
      // Status filter
      if (statusFilter) {
        const productStatus = product.spec?.publishStatus || 'Draft';
        if (productStatus !== statusFilter) {
          return false;
        }
      }

      // Name/Namespace filter
      if (filters) {
        const filterValue = filters.toLowerCase();
        if (filterSelected === 'name') {
          const name = product.metadata?.name || '';
          if (!name.toLowerCase().includes(filterValue)) {
            return false;
          }
        } else if (filterSelected === 'namespace') {
          const namespace = product.metadata?.namespace || '';
          if (!namespace.toLowerCase().includes(filterValue)) {
            return false;
          }
        }
      }

      return true;
    });
  }, [apiProducts, statusFilter, filters, filterSelected]);

  // Pagination
  const startIndex = (currentPage - 1) * perPage;
  const endIndex = startIndex + perPage;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  React.useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filteredProducts.length / perPage));
    if (currentPage > lastPage) {
      setCurrentPage(lastPage);
    }
  }, [currentPage, filteredProducts.length, perPage]);

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

  const onToggleClick = () => setIsFilterOpen(!isFilterOpen);

  const onFilterSelect = (
    _event: React.MouseEvent<Element, MouseEvent> | undefined,
    selection: string | number,
  ) => {
    setFilterSelected(selection as 'name' | 'namespace');
    setIsFilterOpen(false);
  };

  const handleFilterChange = (value: string) => {
    setCurrentPage(1);
    setFilters(value);
  };

  const handleStatusFilterSelect = (_event: React.MouseEvent | undefined, value: string) => {
    setStatusFilter(value === statusFilter ? '' : value);
    setIsStatusFilterOpen(false);
    setCurrentPage(1);
  };

  const clearStatusFilter = () => {
    setStatusFilter('');
    setCurrentPage(1);
  };

  // Custom columns for API Products - in specified order
  const columns: TableColumn<APIProduct>[] = React.useMemo(
    () => [
      {
        title: t('Name'),
        id: 'name',
        sort: 'metadata.name',
        transforms: [sortable],
      } as TableColumn<APIProduct>,
      {
        title: t('Version'),
        id: 'version',
        sort: 'spec.version',
        transforms: [sortable],
      } as TableColumn<APIProduct>,
      {
        title: t('Route'),
        id: 'route',
      } as TableColumn<APIProduct>,
      {
        title: t('PlanPolicy'),
        id: 'planpolicy',
      } as TableColumn<APIProduct>,
      {
        title: t('Namespace'),
        id: 'namespace',
        sort: 'metadata.namespace',
        transforms: [sortable],
      } as TableColumn<APIProduct>,
      {
        title: t('Status'),
        id: 'status',
        sort: 'spec.publishStatus',
        transforms: [sortable],
      } as TableColumn<APIProduct>,
      {
        title: t('Tags'),
        id: 'tags',
      } as TableColumn<APIProduct>,
      {
        title: t('Created'),
        id: 'created',
        sort: 'metadata.creationTimestamp',
        transforms: [sortable],
      } as TableColumn<APIProduct>,
      {
        title: '',
        id: 'kebab',
        props: { className: 'pf-v6-c-table__action' },
      } as TableColumn<APIProduct>,
    ],
    [t],
  );

  // Custom renderers for API Product-specific columns
  const renderers = React.useMemo(
    () => ({
      version: (
        column: TableColumn<APIProduct>,
        resource: APIProduct,
        activeColumnIDs: Set<string>,
      ) => {
        return (
          <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
            {resource.spec?.version ?? '-'}
          </TableData>
        );
      },
      route: (
        column: TableColumn<APIProduct>,
        resource: APIProduct,
        activeColumnIDs: Set<string>,
      ) => {
        const targetRef = resource.spec?.targetRef;
        return (
          <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
            {targetRef ? (
              <ResourceLink
                groupVersionKind={{
                  group: targetRef.group || 'gateway.networking.k8s.io',
                  version: 'v1',
                  kind: targetRef.kind,
                }}
                name={targetRef.name}
                namespace={targetRef.namespace || resource.metadata?.namespace}
              />
            ) : (
              'N/A'
            )}
          </TableData>
        );
      },
      planpolicy: (
        column: TableColumn<APIProduct>,
        resource: APIProduct,
        activeColumnIDs: Set<string>,
      ) => {
        const targetRef = resource.spec?.targetRef;

        // Find matching PlanPolicy based on the APIProduct's targetRef
        let matchingPolicy: PlanPolicy | undefined;
        if (targetRef && targetRef.kind === 'HTTPRoute' && targetRef.name) {
          const targetNamespace = targetRef.namespace || resource.metadata?.namespace;
          const key = `${targetNamespace}/${targetRef.name}`;
          matchingPolicy = planPolicyMap.get(key);
        }

        return (
          <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
            {matchingPolicy ? (
              <ResourceLink
                groupVersionKind={RESOURCES.PlanPolicy.gvk}
                name={matchingPolicy.metadata?.name}
                namespace={matchingPolicy.metadata?.namespace}
              />
            ) : (
              '-'
            )}
          </TableData>
        );
      },
      status: (
        column: TableColumn<APIProduct>,
        resource: APIProduct,
        activeColumnIDs: Set<string>,
      ) => {
        const lifecycle = resource.spec?.publishStatus || 'Draft';
        return (
          <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
            <Label color={lifecycle === 'Published' ? 'green' : 'orange'}>{lifecycle}</Label>
          </TableData>
        );
      },
      tags: (
        column: TableColumn<APIProduct>,
        resource: APIProduct,
        activeColumnIDs: Set<string>,
      ) => {
        const tags = resource.spec?.tags || [];
        return (
          <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
            {tags.length > 0 ? (
              <LabelGroup numLabels={3}>
                {tags.map((tag, index) => (
                  <Label key={index} color="teal">
                    {tag}
                  </Label>
                ))}
              </LabelGroup>
            ) : (
              '-'
            )}
          </TableData>
        );
      },
      created: (
        column: TableColumn<APIProduct>,
        resource: APIProduct,
        activeColumnIDs: Set<string>,
      ) => {
        return (
          <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
            <Timestamp timestamp={resource.metadata?.creationTimestamp} />
          </TableData>
        );
      },
    }),
    [planPolicyMap],
  );

  // Table row component
  const APIProductRow: React.FC<RowProps<APIProduct>> = ({ obj, activeColumnIDs }) => {
    return (
      <>
        {columns.map((column) => {
          if (renderers[column.id]) {
            return renderers[column.id](column, obj, activeColumnIDs);
          }

          switch (column.id) {
            case 'name':
              return (
                <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
                  <ResourceLink
                    groupVersionKind={RESOURCES.APIProduct.gvk}
                    name={obj.metadata?.name}
                    namespace={obj.metadata?.namespace}
                  />
                </TableData>
              );
            case 'namespace':
              return (
                <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
                  {obj.metadata?.namespace ? (
                    <ResourceLink
                      groupVersionKind={{ version: 'v1', kind: 'Namespace' }}
                      name={obj.metadata.namespace}
                    />
                  ) : (
                    '-'
                  )}
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
        })}
      </>
    );
  };

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h1">{t('API Products')}</Title>
      </PageSection>
      <PageSection hasBodyWrapper={false} className="kuadrant-policy-list-body">
        {productsLoadError && (
          <AlertGroup>
            <Alert title={t('Error loading API Products')} variant="danger" isInline>
              {productsLoadError.message}
            </Alert>
          </AlertGroup>
        )}
        <ListPageBody>
          <Toolbar>
            <ToolbarContent>
              <ToolbarGroup variant="filter-group">
                <ToolbarItem>
                  <Select
                    isOpen={isStatusFilterOpen}
                    onOpenChange={setIsStatusFilterOpen}
                    onSelect={handleStatusFilterSelect}
                    toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                      <MenuToggle
                        ref={toggleRef}
                        onClick={() => setIsStatusFilterOpen(!isStatusFilterOpen)}
                        isExpanded={isStatusFilterOpen}
                      >
                        {statusFilter || t('Status')}
                      </MenuToggle>
                    )}
                  >
                    <SelectList>
                      {statusOptions.map((status) => (
                        <SelectOption
                          key={status}
                          value={status}
                          isSelected={statusFilter === status}
                        >
                          {status}
                        </SelectOption>
                      ))}
                    </SelectList>
                  </Select>
                </ToolbarItem>
                {statusFilter && (
                  <ToolbarItem>
                    <Label color="blue" onClose={clearStatusFilter}>
                      {t('Status')}: {statusFilter}
                    </Label>
                  </ToolbarItem>
                )}
                <ToolbarItem>
                  <Select
                    toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                      <MenuToggle ref={toggleRef} onClick={onToggleClick} isExpanded={isFilterOpen}>
                        {filterSelected === 'name' && t('Name')}
                        {filterSelected === 'namespace' && t('Namespace')}
                      </MenuToggle>
                    )}
                    onSelect={onFilterSelect}
                    onOpenChange={setIsFilterOpen}
                    isOpen={isFilterOpen}
                  >
                    <SelectList>
                      <SelectOption value="name">{t('Name')}</SelectOption>
                      <SelectOption value="namespace">{t('Namespace')}</SelectOption>
                    </SelectList>
                  </Select>
                </ToolbarItem>

                <ToolbarItem>
                  <InputGroup>
                    <TextInput
                      type="text"
                      placeholder={t('Search by {{filterValue}}...', {
                        filterValue: filterSelected,
                      })}
                      value={filters}
                      onChange={(_event, value) => handleFilterChange(value)}
                      aria-label={t('Resource search')}
                    />
                  </InputGroup>
                </ToolbarItem>
              </ToolbarGroup>
            </ToolbarContent>
          </Toolbar>

          {paginatedProducts.length === 0 && productsLoaded ? (
            <EmptyState
              titleText={
                <Title headingLevel="h4" size="lg">
                  {t('No API Products found')}
                </Title>
              }
              icon={SearchIcon}
            >
              <EmptyStateBody>
                {statusFilter || filters
                  ? t('No API Products match the filter criteria.')
                  : t('There are no API Products to display - please create some.')}
              </EmptyStateBody>
            </EmptyState>
          ) : (
            <VirtualizedTable<APIProduct>
              data={paginatedProducts}
              unfilteredData={filteredProducts}
              loaded={productsLoaded}
              loadError={productsLoadError}
              columns={columns}
              Row={APIProductRow}
            />
          )}

          {filteredProducts.length > 0 && (
            <div className="kuadrant-pagination-left">
              <Pagination
                itemCount={filteredProducts.length}
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
      </PageSection>
    </>
  );
};

export default APIProductsListPage;
