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
  ToolbarFilter,
  Select,
  SelectOption,
  SelectList,
  Menu,
  MenuContent,
  MenuList,
  MenuItem,
  MenuToggle,
  MenuToggleElement,
  Popper,
  InputGroup,
  TextInput,
  Pagination,
  EmptyState,
  EmptyStateBody,
  Alert,
  AlertGroup,
  Tooltip,
  Button,
  Badge,
} from '@patternfly/react-core';
import FilterIcon from '@patternfly/react-icons/dist/esm/icons/filter-icon';
import { sortable } from '@patternfly/react-table';
import { SearchIcon, QuestionCircleIcon } from '@patternfly/react-icons';
import {
  NamespaceBar,
  TableColumn,
  ResourceLink,
  TableData,
  Timestamp,
  useK8sWatchResource,
  VirtualizedTable,
  RowProps,
  ListPageBody,
  ListPageCreateLink,
  useAccessReview,
} from '@openshift-console/dynamic-plugin-sdk';
import { RESOURCES } from '../../utils/resources';
import { APIProduct, PlanPolicy } from './types';
import DropdownWithKebab from '../DropdownWithKebab';
import APIProductDeleteModal from './APIProductDeleteModal';
import '../kuadrant.css';
import { getResourceNameFromKind } from '../../utils/getModelFromResource';
import { useKuadrantNamespaceChange } from '../../hooks/useKuadrantNamespaceChange';
import NoPermissionsView from '../NoPermissionsView';

const APIProductsListPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const { handleNamespaceChange, activeNamespace } = useKuadrantNamespaceChange('/apiproducts');
  const allNamespacesSubPath = '#ALL_NS#';
  const isAllNamespaces = activeNamespace === allNamespacesSubPath;
  const [deleteModalProduct, setDeleteModalProduct] = React.useState<APIProduct | null>(null);

  // Watch APIProduct resources
  const [apiProducts, productsLoaded, productsLoadError] = useK8sWatchResource<APIProduct[]>({
    groupVersionKind: RESOURCES.APIProduct.gvk,
    namespace: activeNamespace === allNamespacesSubPath ? undefined : activeNamespace,
    isList: true,
  });

  // Watch PlanPolicy resources to link them to APIProducts
  const [planPolicies, planPoliciesLoaded, planPoliciesLoadError] = useK8sWatchResource<
    PlanPolicy[]
  >({
    groupVersionKind: RESOURCES.PlanPolicy.gvk,
    namespace: activeNamespace === allNamespacesSubPath ? undefined : activeNamespace,
    isList: true,
  });

  // Filter state
  const [nameFilter, setNameFilter] = React.useState<string>('');
  const [namespaceFilter, setNamespaceFilter] = React.useState<string>('');
  const [filterSelected, setFilterSelected] = React.useState<'name' | 'namespace' | 'httproute'>(
    'name',
  );
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [isFilterValueOpen, setIsFilterValueOpen] = React.useState(false);
  const [selectedStatuses, setSelectedStatuses] = React.useState<string[]>([]);
  const [isStatusFilterOpen, setIsStatusFilterOpen] = React.useState(false);
  const [selectedHTTPRoutes, setSelectedHTTPRoutes] = React.useState<string[]>([]);
  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [perPage, setPerPage] = React.useState<number>(10);

  // Status filter menu refs
  const statusToggleRef = React.useRef<HTMLButtonElement>(null);
  const statusMenuRef = React.useRef<HTMLDivElement>(null);
  const statusContainerRef = React.useRef<HTMLDivElement>(null);

  // HTTPRoute filter menu refs
  const routeToggleRef = React.useRef<HTMLButtonElement>(null);
  const routeMenuRef = React.useRef<HTMLDivElement>(null);
  const routeContainerRef = React.useRef<HTMLDivElement>(null);

  // Skip RBAC check when viewing all namespaces
  const [canCreate, canCreateLoading] = useAccessReview(
    !isAllNamespaces
      ? {
          group: RESOURCES.APIProduct.gvk.group,
          resource: getResourceNameFromKind(RESOURCES.APIProduct.gvk.kind),
          verb: 'create',
          namespace: activeNamespace,
        }
      : {
          group: RESOURCES.APIProduct.gvk.group,
          resource: getResourceNameFromKind(RESOURCES.APIProduct.gvk.kind),
          verb: 'create',
          namespace: '',
        },
  );

  const [canList, canListLoading] = useAccessReview(
    !isAllNamespaces
      ? {
          group: RESOURCES.APIProduct.gvk.group,
          resource: getResourceNameFromKind(RESOURCES.APIProduct.gvk.kind),
          verb: 'list',
          namespace: activeNamespace,
        }
      : {
          group: RESOURCES.APIProduct.gvk.group,
          resource: getResourceNameFromKind(RESOURCES.APIProduct.gvk.kind),
          verb: 'list',
          namespace: '',
        },
  );

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
      const status = product.spec?.publishStatus || t('Draft');
      statuses.add(status);
    });
    return Array.from(statuses).sort();
  }, [apiProducts, t]);

  // Deduplicate selected statuses to prevent key drift in ToolbarFilter
  const uniqueSelectedStatuses = React.useMemo(
    () => [...new Set(selectedStatuses)],
    [selectedStatuses],
  );

  // Extract unique HTTPRoute identifiers from apiProducts
  const httpRouteOptions = React.useMemo(() => {
    if (!apiProducts) return [];
    const routes = new Set<string>();

    apiProducts.forEach((product) => {
      const targetRef = product.spec?.targetRef;
      if (targetRef && targetRef.kind === 'HTTPRoute' && targetRef.name) {
        const targetNamespace = targetRef.namespace || product.metadata?.namespace;
        const routeKey = `${targetNamespace}/${targetRef.name}`;
        routes.add(routeKey);
      }
    });

    return Array.from(routes).sort();
  }, [apiProducts]);

  // Apply filters to APIProducts
  const filteredProducts = React.useMemo(() => {
    if (!apiProducts) return [];

    return apiProducts.filter((product) => {
      // Status filter
      if (selectedStatuses.length > 0) {
        const productStatus = product.spec?.publishStatus || t('Draft');
        if (!selectedStatuses.includes(productStatus)) {
          return false;
        }
      }

      // HTTPRoute filter
      if (selectedHTTPRoutes.length > 0) {
        const targetRef = product.spec?.targetRef;
        if (!targetRef || targetRef.kind !== 'HTTPRoute') {
          return false;
        }
        const targetNamespace = targetRef.namespace || product.metadata?.namespace;
        const routeKey = `${targetNamespace}/${targetRef.name}`;
        if (!selectedHTTPRoutes.includes(routeKey)) {
          return false;
        }
      }

      // Name filter
      if (nameFilter) {
        const name = product.metadata?.name || '';
        if (!name.toLowerCase().includes(nameFilter.toLowerCase())) {
          return false;
        }
      }

      // Namespace filter
      if (namespaceFilter) {
        const namespace = product.metadata?.namespace || '';
        if (!namespace.toLowerCase().includes(namespaceFilter.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }, [apiProducts, selectedStatuses, selectedHTTPRoutes, nameFilter, namespaceFilter, t]);

  // Filter labels
  const filterLabels = React.useMemo(
    () => ({
      name: t('Name'),
      namespace: t('Namespace'),
      httproute: t('HTTPRoute'),
    }),
    [t],
  );

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
    setFilterSelected(selection as 'name' | 'namespace' | 'httproute');
    setIsFilterOpen(false);
  };

  // HTTPRoute filter menu handlers
  const handleRouteMenuKeys = (event: KeyboardEvent) => {
    if (isFilterValueOpen && routeMenuRef.current?.contains(event.target as Node)) {
      if (event.key === 'Escape' || event.key === 'Tab') {
        setIsFilterValueOpen(false);
        routeToggleRef.current?.focus();
      }
    }
  };

  const handleRouteClickOutside = (event: MouseEvent) => {
    if (isFilterValueOpen && !routeMenuRef.current?.contains(event.target as Node)) {
      setIsFilterValueOpen(false);
    }
  };

  React.useEffect(() => {
    if (filterSelected === 'httproute') {
      window.addEventListener('keydown', handleRouteMenuKeys);
      window.addEventListener('click', handleRouteClickOutside);
      return () => {
        window.removeEventListener('keydown', handleRouteMenuKeys);
        window.removeEventListener('click', handleRouteClickOutside);
      };
    }
  }, [isFilterValueOpen, filterSelected]);

  const onRouteToggleClick = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    setTimeout(() => {
      if (routeMenuRef.current) {
        const firstElement = routeMenuRef.current.querySelector('li > button:not(:disabled)');
        firstElement && (firstElement as HTMLElement).focus();
      }
    }, 0);
    setIsFilterValueOpen(!isFilterValueOpen);
  };

  const onRouteSelect = (
    event: React.MouseEvent | undefined,
    itemId: string | number | undefined,
  ) => {
    if (typeof itemId === 'undefined') {
      return;
    }

    const itemStr = itemId.toString();
    setSelectedHTTPRoutes((prev) =>
      prev.includes(itemStr) ? prev.filter((r) => r !== itemStr) : [...prev, itemStr],
    );
    setCurrentPage(1);
  };

  const handleFilterChange = (value: string) => {
    setCurrentPage(1);
    if (filterSelected === 'name') {
      setNameFilter(value);
    } else if (filterSelected === 'namespace') {
      setNamespaceFilter(value);
    }
  };

  // Status filter menu handlers
  const handleStatusMenuKeys = (event: KeyboardEvent) => {
    if (isStatusFilterOpen && statusMenuRef.current?.contains(event.target as Node)) {
      if (event.key === 'Escape' || event.key === 'Tab') {
        setIsStatusFilterOpen(false);
        statusToggleRef.current?.focus();
      }
    }
  };

  const handleStatusClickOutside = (event: MouseEvent) => {
    if (isStatusFilterOpen && !statusMenuRef.current?.contains(event.target as Node)) {
      setIsStatusFilterOpen(false);
    }
  };

  React.useEffect(() => {
    window.addEventListener('keydown', handleStatusMenuKeys);
    window.addEventListener('click', handleStatusClickOutside);
    return () => {
      window.removeEventListener('keydown', handleStatusMenuKeys);
      window.removeEventListener('click', handleStatusClickOutside);
    };
  }, [isStatusFilterOpen]);

  const onStatusToggleClick = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    setTimeout(() => {
      if (statusMenuRef.current) {
        const firstElement = statusMenuRef.current.querySelector('li > button:not(:disabled)');
        firstElement && (firstElement as HTMLElement).focus();
      }
    }, 0);
    setIsStatusFilterOpen(!isStatusFilterOpen);
  };

  const onStatusSelect = (
    event: React.MouseEvent | undefined,
    itemId: string | number | undefined,
  ) => {
    if (typeof itemId === 'undefined') {
      return;
    }

    const itemStr = itemId.toString();
    setSelectedStatuses((prev) =>
      prev.includes(itemStr) ? prev.filter((s) => s !== itemStr) : [itemStr, ...prev],
    );
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
        title: (
          <>
            {t('Route')}{' '}
            <Tooltip
              content={t(
                "An HTTPRoute mapping that routes incoming traffic from an API Product's public endpoint to the corresponding upstream service.",
              )}
              position="top"
            >
              <QuestionCircleIcon />
            </Tooltip>
          </>
        ),
        id: 'route',
      } as TableColumn<APIProduct>,
      {
        title: (
          <>
            {t('PlanPolicy')}{' '}
            <Tooltip
              content={t(
                'A unified policy that automatically generates and manages underlying Kubernetes Rate Limit and Auth resources to define consumption rules for an API Product.',
              )}
              position="top"
            >
              <QuestionCircleIcon />
            </Tooltip>
          </>
        ),
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
        title: (
          <>
            {t('Tags')}{' '}
            <Tooltip
              content={t('Labels for categorizing and organizing API Products')}
              position="top"
            >
              <QuestionCircleIcon />
            </Tooltip>
          </>
        ),
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
        const lifecycle = resource.spec?.publishStatus || t('Draft');
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
    [planPolicyMap, t],
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
                  <DropdownWithKebab obj={obj} onDeleteClick={setDeleteModalProduct} />
                </TableData>
              );
            default:
              return null;
          }
        })}
      </>
    );
  };

  if (canListLoading) {
    return (
      <PageSection hasBodyWrapper={false}>
        <NamespaceBar onNamespaceChange={handleNamespaceChange} />
        <div>{t('Loading Permissions...')}</div>
      </PageSection>
    );
  }

  if (!canList) {
    return (
      <PageSection hasBodyWrapper={false}>
        <NamespaceBar onNamespaceChange={handleNamespaceChange} />
        <NoPermissionsView primaryMessage={t('You do not have permission to view API Products')} />
      </PageSection>
    );
  }

  return (
    <>
      <NamespaceBar onNamespaceChange={handleNamespaceChange} />
      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h1">{t('API Products')}</Title>
      </PageSection>
      <PageSection hasBodyWrapper={false} className="kuadrant-policy-list-body">
        <div className="co-m-nav-title--row kuadrant-resource-create-container">
          {productsLoadError && (
            <AlertGroup>
              <Alert title={t('Error loading API Products')} variant="danger" isInline>
                {productsLoadError.message}
              </Alert>
            </AlertGroup>
          )}
          {planPoliciesLoadError && (
            <AlertGroup>
              <Alert title={t('Error loading PlanPolicies')} variant="danger" isInline>
                {planPoliciesLoadError.message}
              </Alert>
            </AlertGroup>
          )}
          <ListPageBody>
            <Toolbar>
              <ToolbarContent>
                <ToolbarGroup variant="filter-group">
                  <ToolbarFilter
                    labels={uniqueSelectedStatuses}
                    deleteLabel={(_category, label) => onStatusSelect(undefined, label as string)}
                    deleteLabelGroup={() => setSelectedStatuses([])}
                    categoryName={t('Status')}
                  >
                    <div ref={statusContainerRef}>
                      <Popper
                        trigger={
                          <MenuToggle
                            ref={statusToggleRef}
                            id="status-filter-menu-toggle"
                            onClick={onStatusToggleClick}
                            isExpanded={isStatusFilterOpen}
                            icon={<FilterIcon />}
                            {...(uniqueSelectedStatuses.length > 0 && {
                              badge: <Badge isRead>{uniqueSelectedStatuses.length}</Badge>,
                            })}
                          >
                            {t('Status')}
                          </MenuToggle>
                        }
                        triggerRef={statusToggleRef}
                        popper={
                          <Menu
                            ref={statusMenuRef}
                            onSelect={onStatusSelect}
                            selected={uniqueSelectedStatuses}
                          >
                            <MenuContent>
                              <MenuList id="status-filter-select-list">
                                {statusOptions.map((status) => (
                                  <MenuItem
                                    key={status}
                                    hasCheckbox
                                    isSelected={uniqueSelectedStatuses.includes(status)}
                                    itemId={status}
                                  >
                                    {status}
                                  </MenuItem>
                                ))}
                              </MenuList>
                            </MenuContent>
                          </Menu>
                        }
                        popperRef={statusMenuRef}
                        appendTo={statusContainerRef.current || undefined}
                        isVisible={isStatusFilterOpen}
                      />
                    </div>
                  </ToolbarFilter>
                  <ToolbarFilter
                    labels={nameFilter ? [nameFilter] : []}
                    deleteLabel={() => {
                      setNameFilter('');
                      setCurrentPage(1);
                    }}
                    deleteLabelGroup={() => {
                      setNameFilter('');
                      setCurrentPage(1);
                    }}
                    categoryName={t('Name')}
                  >
                    <></>
                  </ToolbarFilter>
                  <ToolbarFilter
                    labels={namespaceFilter ? [namespaceFilter] : []}
                    deleteLabel={() => {
                      setNamespaceFilter('');
                      setCurrentPage(1);
                    }}
                    deleteLabelGroup={() => {
                      setNamespaceFilter('');
                      setCurrentPage(1);
                    }}
                    categoryName={t('Namespace')}
                  >
                    <></>
                  </ToolbarFilter>
                  <ToolbarFilter
                    labels={selectedHTTPRoutes}
                    deleteLabel={(_category, label) => {
                      setSelectedHTTPRoutes((prev) => prev.filter((r) => r !== label));
                      setCurrentPage(1);
                    }}
                    deleteLabelGroup={() => {
                      setSelectedHTTPRoutes([]);
                      setCurrentPage(1);
                    }}
                    categoryName={t('HTTPRoute')}
                  >
                    <></>
                  </ToolbarFilter>
                  <InputGroup>
                    <Select
                      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                        <MenuToggle
                          ref={toggleRef}
                          id="composite-filter-menu-toggle"
                          onClick={onToggleClick}
                          isExpanded={isFilterOpen}
                          style={{ minWidth: '150px' }}
                        >
                          {filterLabels[filterSelected]}
                        </MenuToggle>
                      )}
                      onSelect={onFilterSelect}
                      onOpenChange={setIsFilterOpen}
                      isOpen={isFilterOpen}
                    >
                      <SelectList id="composite-filter-select-list">
                        <SelectOption id="composite-filter-select-option-name" value="name">
                          {t('Name')}
                        </SelectOption>
                        <SelectOption
                          id="composite-filter-select-option-namespace"
                          value="namespace"
                        >
                          {t('Namespace')}
                        </SelectOption>
                        <SelectOption
                          id="composite-filter-select-option-httproute"
                          value="httproute"
                        >
                          {t('HTTPRoute')}
                        </SelectOption>
                      </SelectList>
                    </Select>
                    {filterSelected === 'httproute' ? (
                      <div ref={routeContainerRef}>
                        <Popper
                          trigger={
                            <MenuToggle
                              ref={routeToggleRef}
                              onClick={onRouteToggleClick}
                              isExpanded={isFilterValueOpen}
                              {...(selectedHTTPRoutes.length > 0 && {
                                badge: <Badge isRead>{selectedHTTPRoutes.length}</Badge>,
                              })}
                            >
                              {t('Select HTTPRoute...')}
                            </MenuToggle>
                          }
                          triggerRef={routeToggleRef}
                          popper={
                            <Menu
                              ref={routeMenuRef}
                              onSelect={onRouteSelect}
                              selected={selectedHTTPRoutes}
                            >
                              <MenuContent>
                                <MenuList>
                                  {httpRouteOptions.map((route) => (
                                    <MenuItem
                                      key={route}
                                      hasCheckbox
                                      isSelected={selectedHTTPRoutes.includes(route)}
                                      itemId={route}
                                    >
                                      {route}
                                    </MenuItem>
                                  ))}
                                </MenuList>
                              </MenuContent>
                            </Menu>
                          }
                          popperRef={routeMenuRef}
                          appendTo={routeContainerRef.current || undefined}
                          isVisible={isFilterValueOpen}
                        />
                      </div>
                    ) : (
                      <TextInput
                        type="text"
                        id="composite-filter-search-by-input"
                        placeholder={t('Search by {{filterValue}}...', {
                          filterValue: filterLabels[filterSelected],
                        })}
                        value={filterSelected === 'name' ? nameFilter : namespaceFilter}
                        onChange={(_event, value) => handleFilterChange(value)}
                        aria-label={t('Resource search')}
                      />
                    )}
                  </InputGroup>
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
                  {selectedStatuses.length > 0 ||
                  selectedHTTPRoutes.length > 0 ||
                  nameFilter ||
                  namespaceFilter
                    ? t('No API Products match the filter criteria.')
                    : t('There are no API Products to display - please create some.')}
                </EmptyStateBody>
              </EmptyState>
            ) : (
              <div className="kuadrant-resource-table">
                <VirtualizedTable<APIProduct>
                  data={paginatedProducts}
                  unfilteredData={filteredProducts}
                  loaded={productsLoaded}
                  loadError={productsLoadError}
                  columns={columns}
                  Row={APIProductRow}
                />
              </div>
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
          <div className="kuadrant-resource-create-button pf-u-mt-md">
            {!canCreateLoading && canCreate && !isAllNamespaces ? (
              <ListPageCreateLink to={`/kuadrant/apiproducts/ns/${activeNamespace}/~new`}>
                {t('Create API Product')}
              </ListPageCreateLink>
            ) : (
              <Tooltip
                content={
                  isAllNamespaces
                    ? t('Select a namespace to create an API Product')
                    : t('You do not have permission to create an API Product')
                }
              >
                <Button variant="primary" isAriaDisabled>
                  {t('Create API Product')}
                </Button>
              </Tooltip>
            )}
          </div>
        </div>
      </PageSection>
      {deleteModalProduct && (
        <APIProductDeleteModal
          isOpen={!!deleteModalProduct}
          onClose={() => setDeleteModalProduct(null)}
          resource={deleteModalProduct}
        />
      )}
    </>
  );
};

export default APIProductsListPage;
