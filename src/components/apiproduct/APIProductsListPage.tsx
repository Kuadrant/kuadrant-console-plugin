import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  PageSection,
  Title,
  Label,
  LabelGroup,
  Pagination,
  EmptyState,
  EmptyStateBody,
  Alert,
  AlertGroup,
  Tooltip,
  Button,
} from '@patternfly/react-core';
import { SearchIcon, QuestionCircleIcon } from '@patternfly/react-icons';
import {
  DataViewCheckboxFilter,
  DataViewFilters,
  DataViewTextFilter,
  DataViewToolbar,
} from '@patternfly/react-data-view';
import type { DataViewTr } from '@patternfly/react-data-view';
import {
  NamespaceBar,
  ResourceLink,
  Timestamp,
  useK8sWatchResource,
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
import KuadrantDataView, { KuadrantDataViewColumn } from '../KuadrantDataView';

type APIProductFilters = {
  name: string;
  namespace: string;
  httproute: string[];
  status: string[];
};

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

  const [filters, setFilters] = React.useState<APIProductFilters>({
    name: '',
    namespace: '',
    httproute: [],
    status: [],
  });
  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [perPage, setPerPage] = React.useState<number>(10);

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
      if (filters.status.length > 0) {
        const productStatus = product.spec?.publishStatus || t('Draft');
        if (!filters.status.includes(productStatus)) {
          return false;
        }
      }

      // HTTPRoute filter
      if (filters.httproute.length > 0) {
        const targetRef = product.spec?.targetRef;
        if (!targetRef || targetRef.kind !== 'HTTPRoute') {
          return false;
        }
        const targetNamespace = targetRef.namespace || product.metadata?.namespace;
        const routeKey = `${targetNamespace}/${targetRef.name}`;
        if (!filters.httproute.includes(routeKey)) {
          return false;
        }
      }

      // Name filter
      if (filters.name) {
        const name = product.metadata?.name || '';
        if (!name.toLowerCase().includes(filters.name.toLowerCase())) {
          return false;
        }
      }

      // Namespace filter
      if (filters.namespace) {
        const namespace = product.metadata?.namespace || '';
        if (!namespace.toLowerCase().includes(filters.namespace.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }, [apiProducts, filters, t]);

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

  const onFilterChange = (_filterId: string, values: Partial<APIProductFilters>) => {
    setFilters((current) => ({ ...current, ...values }));
    setCurrentPage(1);
  };

  const onClearAllFilters = () => {
    setFilters({ name: '', namespace: '', httproute: [], status: [] });
    setCurrentPage(1);
  };

  // Custom columns for API Products - in specified order
  const columns: KuadrantDataViewColumn<APIProduct>[] = React.useMemo(
    () => [
      {
        title: t('Name'),
        id: 'name',
        sort: 'metadata.name',
      },
      {
        title: t('Version'),
        id: 'version',
        sort: 'spec.version',
      },
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
      },
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
      },
      {
        title: t('Namespace'),
        id: 'namespace',
        sort: 'metadata.namespace',
      },
      {
        title: t('Status'),
        id: 'status',
        sort: 'spec.publishStatus',
      },
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
      },
      {
        title: t('Created'),
        id: 'created',
        sort: 'metadata.creationTimestamp',
      },
      {
        title: '',
        id: 'kebab',
        props: { className: 'pf-v6-c-table__action' },
      },
    ],
    [t],
  );

  const getRow = React.useCallback(
    (resource: APIProduct): DataViewTr => {
      const targetRef = resource.spec?.targetRef;
      const lifecycle = resource.spec?.publishStatus || t('Draft');
      const tags = resource.spec?.tags || [];
      let matchingPolicy: PlanPolicy | undefined;

      if (targetRef?.kind === 'HTTPRoute' && targetRef.name) {
        const targetNamespace = targetRef.namespace || resource.metadata?.namespace;
        matchingPolicy = planPolicyMap.get(targetNamespace + '/' + targetRef.name);
      }

      return [
        {
          cell: (
            <ResourceLink
              groupVersionKind={RESOURCES.APIProduct.gvk}
              name={resource.metadata?.name}
              namespace={resource.metadata?.namespace}
            />
          ),
        },
        resource.spec?.version ?? '-',
        {
          cell: targetRef ? (
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
          ),
        },
        {
          cell: matchingPolicy ? (
            <ResourceLink
              groupVersionKind={RESOURCES.PlanPolicy.gvk}
              name={matchingPolicy.metadata?.name}
              namespace={matchingPolicy.metadata?.namespace}
            />
          ) : (
            '-'
          ),
        },
        {
          cell: resource.metadata?.namespace ? (
            <ResourceLink
              groupVersionKind={{ version: 'v1', kind: 'Namespace' }}
              name={resource.metadata.namespace}
            />
          ) : (
            '-'
          ),
        },
        {
          cell: <Label color={lifecycle === 'Published' ? 'green' : 'orange'}>{lifecycle}</Label>,
        },
        {
          cell:
            tags.length > 0 ? (
              <LabelGroup numLabels={3}>
                {tags.map((tag, index) => (
                  <Label key={index} color="teal">
                    {tag}
                  </Label>
                ))}
              </LabelGroup>
            ) : (
              '-'
            ),
        },
        { cell: <Timestamp timestamp={resource.metadata?.creationTimestamp} /> },
        {
          cell: (
            <DropdownWithKebab
              obj={resource}
              onDeleteClick={(item) => setDeleteModalProduct(item as APIProduct)}
            />
          ),
          props: { isActionCell: true, className: 'pf-v6-c-table__action' },
        },
      ];
    },
    [planPolicyMap, t],
  );

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
            <DataViewToolbar
              clearAllFilters={onClearAllFilters}
              filters={
                <DataViewFilters<APIProductFilters>
                  onChange={onFilterChange}
                  values={filters}
                  ouiaId="APIProductsDataViewFilters"
                >
                  <DataViewTextFilter
                    filterId="name"
                    title={t('Name')}
                    placeholder={t('Search by {{filterValue}}...', {
                      filterValue: t('Name').toLowerCase(),
                    })}
                    ouiaId="APIProductsNameFilter"
                  />
                  <DataViewTextFilter
                    filterId="namespace"
                    title={t('Namespace')}
                    placeholder={t('Search by {{filterValue}}...', {
                      filterValue: t('Namespace').toLowerCase(),
                    })}
                    ouiaId="APIProductsNamespaceFilter"
                  />
                  <DataViewCheckboxFilter
                    filterId="httproute"
                    title={t('HTTPRoute')}
                    placeholder={t('Select HTTPRoute...')}
                    options={httpRouteOptions}
                    ouiaId="APIProductsHTTPRouteFilter"
                    showBadge
                  />
                  <DataViewCheckboxFilter
                    filterId="status"
                    title={t('Status')}
                    placeholder={t('Select status')}
                    options={statusOptions}
                    ouiaId="APIProductsStatusFilter"
                    showBadge
                  />
                </DataViewFilters>
              }
              ouiaId="APIProductsDataViewToolbar"
            />

            {filteredProducts.length === 0 && productsLoaded ? (
              <EmptyState
                titleText={
                  <Title headingLevel="h4" size="lg">
                    {t('No API Products found')}
                  </Title>
                }
                icon={SearchIcon}
              >
                <EmptyStateBody>
                  {filters.status.length > 0 ||
                  filters.httproute.length > 0 ||
                  filters.name ||
                  filters.namespace
                    ? t('No API Products match the filter criteria.')
                    : t('There are no API Products to display - please create some.')}
                </EmptyStateBody>
              </EmptyState>
            ) : (
              <div className="kuadrant-resource-table">
                <KuadrantDataView<APIProduct>
                  ariaLabel={t('API Products')}
                  data={filteredProducts}
                  loaded={productsLoaded}
                  loadError={productsLoadError}
                  columns={columns}
                  getRow={getRow}
                  page={currentPage}
                  perPage={perPage}
                  ouiaId="APIProductsDataView"
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
