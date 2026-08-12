import * as React from 'react';
import { useNavigate, useLocation, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import Helmet from 'react-helmet';
import { Link } from 'react-router';
import {
  PageSection,
  Title,
  EmptyState,
  EmptyStateBody,
  AlertGroup,
  Alert,
  MenuToggle,
  Dropdown,
  DropdownList,
  DropdownItem,
  Button,
  Tooltip,
  Pagination,
  Label,
  Spinner,
} from '@patternfly/react-core';
import {
  DataViewCheckboxFilter,
  DataViewFilters,
  DataViewTextFilter,
  DataViewToolbar,
} from '@patternfly/react-data-view';
import type { DataViewTr } from '@patternfly/react-data-view';
import {
  useK8sWatchResource,
  Timestamp,
  ListPageBody,
  ResourceLink,
  k8sDelete,
  consoleFetchJSON,
  useAccessReview,
  NamespaceBar,
  checkAccess,
} from '@openshift-console/dynamic-plugin-sdk';
import { SearchIcon, EllipsisVIcon, EyeIcon } from '@patternfly/react-icons';
import {
  RESOURCES,
  APIKey,
  OpenshiftUser,
  SelfSubjectReviewResponse,
  getAPIKeyPhase,
} from '../../utils/resources';
import { getModelFromResource, getResourceNameFromKind } from '../../utils/getModelFromResource';
import { formatExpiry } from './utils';
import APIKeyRevealModal from './APIKeyRevealModal';
import APIKeyDeleteModal from './APIKeyDeleteModal';
import RequestAPIKeyModal from './RequestAPIKeyModal';
import { APIKeyStatusBadge } from './APIKeyStatusBadge';
import { APIProduct } from '../apiproduct/types';
import { formatLimits } from '../../utils/apiKeyUtils';
import NoPermissionsView from '../NoPermissionsView';
import '../kuadrant.css';
import { useKuadrantNamespaceChange } from '../../hooks/useKuadrantNamespaceChange';
import KuadrantDataView, { KuadrantDataViewColumn } from '../KuadrantDataView';

type APIKeyFilters = {
  name: string;
  status: string[];
  owner: string;
};

type APIKeyActionsProps = {
  apiKey: APIKey;
  onDelete: (apiKey: APIKey) => void;
  canDelete: boolean;
  canDeleteLoading: boolean;
};

const APIKeyActions: React.FC<APIKeyActionsProps> = ({
  apiKey,
  onDelete,
  canDelete,
  canDeleteLoading,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [isKebabOpen, setIsKebabOpen] = React.useState(false);

  return (
    <Dropdown
      isOpen={isKebabOpen}
      onOpenChange={(isOpen) => setIsKebabOpen(isOpen)}
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          variant="plain"
          onClick={() => setIsKebabOpen(!isKebabOpen)}
          isExpanded={isKebabOpen}
          aria-label={t('Actions')}
        >
          <EllipsisVIcon />
        </MenuToggle>
      )}
    >
      <DropdownList>
        <DropdownItem
          key="delete"
          onClick={() => {
            setIsKebabOpen(false);
            onDelete(apiKey);
          }}
          isDisabled={canDeleteLoading || !canDelete}
        >
          {t('Delete')}
        </DropdownItem>
      </DropdownList>
    </Dropdown>
  );
};

const MyAPIKeysPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { ns } = useParams<{ ns: string }>();
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const { handleNamespaceChange, activeNamespace } = useKuadrantNamespaceChange('/apikeys');

  const [username, setUsername] = React.useState<string>('');
  const [usernameLoaded, setUsernameLoaded] = React.useState(false);

  const namespace = activeNamespace === '#ALL_NS#' ? undefined : activeNamespace;

  // Check list permission before watching resources
  const [canList, canListLoading] = useAccessReview({
    group: RESOURCES.APIKey.gvk.group,
    resource: getResourceNameFromKind(RESOURCES.APIKey.gvk.kind),
    verb: 'list',
    namespace,
  });

  const [canListProducts, canListProductsLoading] = useAccessReview({
    group: RESOURCES.APIProduct.gvk.group,
    resource: 'apiproducts',
    verb: 'list',
    namespace,
  });

  // Only watch APIKeys if user has permission
  const [apiKeys, loaded, apiKeysLoadError] = useK8sWatchResource<APIKey[]>(
    canList && !canListLoading
      ? {
          groupVersionKind: RESOURCES.APIKey.gvk,
          namespace,
          isList: true,
        }
      : null,
  );

  // Watch APIProduct resources to get plan limits - only if user has permission
  const [products, productsLoaded] = useK8sWatchResource<APIProduct[]>(
    canListProducts && !canListProductsLoading
      ? {
          groupVersionKind: RESOURCES.APIProduct.gvk,
          namespace,
          isList: true,
        }
      : null,
  );

  // Helper function to find plan limits from APIProduct
  const getPlanLimits = React.useCallback(
    (apiKey: APIKey): string | null => {
      if (!productsLoaded || !products) return null;

      const product = products.find(
        (p) =>
          p.metadata.name === apiKey.spec?.apiProductRef?.name &&
          (p.metadata.namespace === apiKey.spec?.apiProductRef?.namespace ||
            p.metadata.namespace === apiKey.metadata.namespace),
      );
      if (!product?.status?.discoveredPlans) return null;

      const plan = product.status.discoveredPlans.find((p) => p.tier === apiKey.spec?.planTier);
      return plan ? formatLimits(plan.limits) : null;
    },
    [products, productsLoaded],
  );

  // Smart default redirect: check cluster-wide permissions and redirect namespace-scoped users
  React.useEffect(() => {
    const performRedirect = async () => {
      if (location.pathname === '/kuadrant/apikeys/all-namespaces') {
        try {
          const result = await checkAccess({
            group: RESOURCES.APIKey.gvk.group,
            resource: getResourceNameFromKind(RESOURCES.APIKey.gvk.kind),
            verb: 'list',
            namespace: activeNamespace,
          });

          // If user doesn't have cluster-wide access, redirect to namespace-scoped view
          if (!result.status?.allowed) {
            const targetNamespace =
              activeNamespace && activeNamespace !== '#ALL_NS#' ? activeNamespace : 'default';
            navigate(`/kuadrant/apikeys/ns/${targetNamespace}`, { replace: true });
          }
          // Otherwise, stay on current path (cluster-wide view)
        } catch (_error) {
          // On error, redirect to namespace-scoped view
          const targetNamespace =
            activeNamespace && activeNamespace !== '#ALL_NS#' ? activeNamespace : 'default';
          navigate(`/kuadrant/apikeys/ns/${targetNamespace}`, { replace: true });
        }
      }
    };

    performRedirect();
  }, [location.pathname, activeNamespace, navigate]);

  React.useEffect(() => {
    if (ns && ns !== activeNamespace) {
      handleNamespaceChange(ns);
    }
  }, [ns, handleNamespaceChange]);

  // Fetch current username (works in both MicroShift and OpenShift)
  React.useEffect(() => {
    const fetchUsername = async () => {
      try {
        // Try OpenShift User API first (OpenShift 4.x)
        try {
          const user = (await consoleFetchJSON(
            '/api/kubernetes/apis/user.openshift.io/v1/users/~',
          )) as OpenshiftUser;
          if (user?.metadata?.name) {
            setUsername(user.metadata.name);
            setUsernameLoaded(true);
            return;
          }
        } catch (_openshiftError) {
          // OpenShift User API not available, fall back to SelfSubjectReview
        }

        // Fallback: Try Kubernetes SelfSubjectReview (K8s 1.27+, MicroShift)
        const response = (await consoleFetchJSON.post(
          '/api/kubernetes/apis/authentication.k8s.io/v1/selfsubjectreviews',
          {
            apiVersion: 'authentication.k8s.io/v1',
            kind: 'SelfSubjectReview',
          },
        )) as SelfSubjectReviewResponse;

        const username = response?.status?.userInfo?.username;
        if (username) {
          setUsername(username);
        }
      } catch (_error) {
        // Failed to fetch username, proceeding without it
      } finally {
        setUsernameLoaded(true);
      }
    };
    fetchUsername();
  }, []);

  const [filters, setFilters] = React.useState<APIKeyFilters>({
    name: '',
    status: [],
    owner: '',
  });
  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [perPage, setPerPage] = React.useState<number>(10);

  // Delete modal state
  const [deleteAPIKey, setDeleteAPIKey] = React.useState<APIKey | null>(null);
  const [deleteError, setDeleteError] = React.useState<string>('');

  // Request API Key modal state
  const [isRequestModalOpen, setIsRequestModalOpen] = React.useState(false);

  // Reveal API Key modal state (lifted to parent to persist across table re-renders)
  const [revealAPIKey, setRevealAPIKey] = React.useState<APIKey | null>(null);

  // RBAC permission checks
  const isAllNamespaces = activeNamespace === '#ALL_NS#';
  const [canCreate, canCreateLoading] = useAccessReview(
    !isAllNamespaces
      ? {
          group: RESOURCES.APIKey.gvk.group,
          resource: getResourceNameFromKind(RESOURCES.APIKey.gvk.kind),
          verb: 'create',
          namespace: activeNamespace,
        }
      : {
          group: RESOURCES.APIKey.gvk.group,
          resource: getResourceNameFromKind(RESOURCES.APIKey.gvk.kind),
          verb: 'create',
          namespace: '',
        },
  );

  const [canDelete, canDeleteLoading] = useAccessReview(
    !isAllNamespaces
      ? {
          group: RESOURCES.APIKey.gvk.group,
          resource: getResourceNameFromKind(RESOURCES.APIKey.gvk.kind),
          verb: 'delete',
          namespace: activeNamespace,
        }
      : {
          group: RESOURCES.APIKey.gvk.group,
          resource: getResourceNameFromKind(RESOURCES.APIKey.gvk.kind),
          verb: 'delete',
          namespace: '',
        },
  );

  // Filter data based on filter type and value
  const filteredData = React.useMemo(() => {
    if (!Array.isArray(apiKeys)) return [];
    return apiKeys.filter((key) => {
      // Name filter
      if (filters.name && !key.metadata.name.toLowerCase().includes(filters.name.toLowerCase())) {
        return false;
      }

      // Status filter (multiple selection)
      if (filters.status.length > 0) {
        const phase = getAPIKeyPhase(key);
        if (!filters.status.includes(phase)) {
          return false;
        }
      }

      // Owner filter
      if (
        filters.owner &&
        !key.spec?.requestedBy?.userId?.toLowerCase().includes(filters.owner.toLowerCase())
      ) {
        return false;
      }

      return true;
    });
  }, [apiKeys, filters]);

  React.useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filteredData.length / perPage));
    if (currentPage > lastPage) {
      setCurrentPage(lastPage);
    }
  }, [currentPage, filteredData.length, perPage]);

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

  const onFilterChange = (_filterId: string, values: Partial<APIKeyFilters>) => {
    setFilters((current) => ({ ...current, ...values }));
    setCurrentPage(1);
  };

  const onClearAllFilters = () => {
    setFilters({ name: '', status: [], owner: '' });
    setCurrentPage(1);
  };

  const handleDeleteClick = React.useCallback((apiKey: APIKey) => {
    setDeleteAPIKey(apiKey);
    setDeleteError('');
  }, []);

  const handleDeleteConfirm = async () => {
    if (!deleteAPIKey) return;

    try {
      const model = getModelFromResource(deleteAPIKey);
      await k8sDelete({ model, resource: deleteAPIKey });
      setDeleteAPIKey(null);
      setDeleteError('');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setDeleteError(errorMessage);
      console.error('Failed to delete APIKey:', error);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteAPIKey(null);
    setDeleteError('');
  };

  const columns: KuadrantDataViewColumn<APIKey>[] = React.useMemo(() => {
    const cols: KuadrantDataViewColumn<APIKey>[] = [
      {
        title: t('Name'),
        id: 'name',
        sort: 'metadata.name',
      },
    ];

    // Add namespace column only when viewing all namespaces
    if (activeNamespace === '#ALL_NS#') {
      cols.push({
        title: t('Namespace'),
        id: 'namespace',
        sort: 'metadata.namespace',
      });
    }

    cols.push(
      {
        title: t('Owner'),
        id: 'owner',
      },
      {
        title: t('API Product'),
        id: 'apiProduct',
      },
      {
        title: t('Status'),
        id: 'status',
      },
      {
        title: t('Tier'),
        id: 'tier',
      },
      {
        title: t('API Key'),
        id: 'apiKey',
      },
      {
        title: t('Requested Time'),
        id: 'requestedTime',
        sort: 'metadata.creationTimestamp',
      },
      {
        title: t('Expires'),
        id: 'expires',
      },
      {
        title: '',
        id: 'actions',
      },
    );

    return cols;
  }, [t, activeNamespace]);

  const getRow = React.useCallback(
    (apiKey: APIKey): DataViewTr => {
      const limitsText = getPlanLimits(apiKey);
      const { text: expiryText, isExpired } = formatExpiry(apiKey.spec?.expiresAt, t);
      const row: DataViewTr = [
        {
          cell: (
            <Link
              to={
                '/kuadrant/ns/' +
                apiKey.metadata.namespace +
                '/apikeys/name/' +
                apiKey.metadata.name
              }
            >
              {apiKey.metadata.name}
            </Link>
          ),
        },
      ];

      if (activeNamespace === '#ALL_NS#') {
        row.push({
          cell: apiKey.metadata.namespace ? (
            <ResourceLink
              groupVersionKind={{ version: 'v1', kind: 'Namespace' }}
              name={apiKey.metadata.namespace}
            />
          ) : (
            '-'
          ),
        });
      }

      row.push(
        { cell: apiKey.spec?.requestedBy?.userId || '-' },
        {
          cell: apiKey.spec?.apiProductRef?.name ? (
            <Link
              to={
                '/k8s/ns/' +
                (apiKey.spec.apiProductRef.namespace || apiKey.metadata.namespace) +
                '/devportal.kuadrant.io~v1alpha1~APIProduct/' +
                apiKey.spec.apiProductRef.name +
                '/overview'
              }
            >
              {apiKey.spec.apiProductRef.name}
            </Link>
          ) : (
            '-'
          ),
        },
        { cell: <APIKeyStatusBadge phase={getAPIKeyPhase(apiKey)} /> },
        {
          cell:
            apiKey.spec?.planTier || limitsText ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {apiKey.spec?.planTier && <Label isCompact>{apiKey.spec.planTier}</Label>}
                {limitsText && <span>{limitsText}</span>}
              </div>
            ) : (
              '-'
            ),
        },
        {
          cell:
            getAPIKeyPhase(apiKey) !== 'Approved' || !apiKey.spec?.secretRef?.name ? (
              '-'
            ) : (
              <div
                onClick={(event) => {
                  event.stopPropagation();
                  setRevealAPIKey(apiKey);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    setRevealAPIKey(apiKey);
                  }
                }}
                aria-label={t('Reveal API key')}
              >
                <span style={{ fontFamily: 'monospace' }}>••••••••••••••••</span>
                <EyeIcon style={{ color: 'var(--pf-v6-global--primary-color--100)' }} />
              </div>
            ),
        },
        { cell: <Timestamp timestamp={apiKey.metadata.creationTimestamp} /> },
        {
          cell: <span style={isExpired ? { color: '#6a6e73' } : undefined}>{expiryText}</span>,
        },
        {
          cell: (
            <APIKeyActions
              apiKey={apiKey}
              onDelete={handleDeleteClick}
              canDelete={canDelete}
              canDeleteLoading={canDeleteLoading}
            />
          ),
          props: { isActionCell: true },
        },
      );

      return row;
    },
    [activeNamespace, canDelete, canDeleteLoading, getPlanLimits, handleDeleteClick, t],
  );

  // Loading view while checking permissions
  if (canListLoading || canListProductsLoading) {
    return (
      <>
        <Helmet>
          <title data-test="example-page-title">{t('My API Keys')}</title>
        </Helmet>
        <NamespaceBar onNamespaceChange={handleNamespaceChange} />
        <PageSection hasBodyWrapper={false}>
          <EmptyState>
            <Spinner size="xl" />
            <Title headingLevel="h2" size="lg">
              {t('Loading...')}
            </Title>
          </EmptyState>
        </PageSection>
      </>
    );
  }

  // No permissions view
  if (!canListLoading && canList === false) {
    return (
      <>
        <Helmet>
          <title data-test="example-page-title">{t('My API Keys')}</title>
        </Helmet>
        <NamespaceBar onNamespaceChange={handleNamespaceChange} />
        <PageSection hasBodyWrapper={false}>
          <NoPermissionsView primaryMessage={t('You do not have permission to view API keys')} />
        </PageSection>
      </>
    );
  }

  // Loading view - only show when we have permission and resources are loading
  if (canList && !loaded) {
    return (
      <>
        <Helmet>
          <title data-test="example-page-title">{t('My API Keys')}</title>
        </Helmet>
        <NamespaceBar onNamespaceChange={handleNamespaceChange} />
        <PageSection hasBodyWrapper={false}>
          <EmptyState>
            <Spinner size="xl" />
            <Title headingLevel="h2" size="lg">
              {t('Loading API Keys...')}
            </Title>
          </EmptyState>
        </PageSection>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('My API Keys')}</title>
      </Helmet>
      <NamespaceBar onNamespaceChange={handleNamespaceChange} />
      <PageSection hasBodyWrapper={false}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title headingLevel="h1">{t('My API Keys')}</Title>
          {!canCreateLoading &&
          canCreate &&
          activeNamespace !== '#ALL_NS#' &&
          usernameLoaded &&
          username ? (
            <Button variant="primary" onClick={() => setIsRequestModalOpen(true)}>
              {t('Request API Key')}
            </Button>
          ) : (
            <Tooltip
              content={
                activeNamespace === '#ALL_NS#'
                  ? t('Select a namespace to request an API Key')
                  : !canCreate
                  ? t('You do not have permission to request an API Key')
                  : !usernameLoaded || canCreateLoading
                  ? t('Loading user information...')
                  : !username
                  ? t('Unable to fetch user information. Please try refreshing the page.')
                  : ''
              }
            >
              <Button variant="primary" isAriaDisabled>
                {t('Request API Key')}
              </Button>
            </Tooltip>
          )}
        </div>
      </PageSection>
      <PageSection hasBodyWrapper={false} className="kuadrant-policy-list-body">
        {apiKeysLoadError && (
          <AlertGroup>
            <Alert title={t('Error loading API Keys')} variant="danger" isInline>
              {apiKeysLoadError.message}
            </Alert>
          </AlertGroup>
        )}
        <ListPageBody>
          <DataViewToolbar
            clearAllFilters={onClearAllFilters}
            filters={
              <DataViewFilters<APIKeyFilters>
                onChange={onFilterChange}
                values={filters}
                ouiaId="MyAPIKeysDataViewFilters"
              >
                <DataViewTextFilter
                  filterId="name"
                  title={t('Name')}
                  placeholder={t('Search by {{filterValue}}...', {
                    filterValue: t('Name').toLowerCase(),
                  })}
                  ouiaId="MyAPIKeysNameFilter"
                />
                <DataViewCheckboxFilter
                  filterId="status"
                  title={t('Status')}
                  placeholder={t('Select status')}
                  options={[
                    { value: 'Approved', label: t('Approved') },
                    { value: 'Pending', label: t('Pending') },
                    { value: 'Denied', label: t('Denied') },
                    { value: 'Failed', label: t('Failed') },
                    { value: 'Expired', label: t('Expired') },
                  ]}
                  ouiaId="MyAPIKeysStatusFilter"
                />
                <DataViewTextFilter
                  filterId="owner"
                  title={t('Owner')}
                  placeholder={t('Search by {{filterValue}}...', {
                    filterValue: t('Owner').toLowerCase(),
                  })}
                  ouiaId="MyAPIKeysOwnerFilter"
                />
              </DataViewFilters>
            }
            ouiaId="MyAPIKeysDataViewToolbar"
          />
          {loaded && filteredData.length === 0 ? (
            <EmptyState
              titleText={
                <Title headingLevel="h4" size="lg">
                  {t('No API Keys found')}
                </Title>
              }
              icon={SearchIcon}
            >
              <EmptyStateBody>
                {!filters.name && filters.status.length === 0 && !filters.owner
                  ? t(
                      'There are no API Keys to display - request access to an API Product to get started.',
                    )
                  : t('No API Keys match the filter criteria.')}
              </EmptyStateBody>
            </EmptyState>
          ) : (
            <KuadrantDataView<APIKey>
              ariaLabel={t('My API Keys')}
              data={filteredData}
              loaded={loaded}
              loadError={apiKeysLoadError}
              columns={columns}
              getRow={getRow}
              page={currentPage}
              perPage={perPage}
              ouiaId="MyAPIKeysDataView"
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
      </PageSection>

      {/* Delete Confirmation Modal */}
      <APIKeyDeleteModal
        isOpen={deleteAPIKey !== null}
        apiKeyName={deleteAPIKey?.metadata.name || ''}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        error={deleteError}
      />

      {/* Request API Key Modal */}
      <RequestAPIKeyModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        username={username}
      />

      {/* Reveal API Key Modal (lifted to parent to persist across table re-renders) */}
      {revealAPIKey && (
        <APIKeyRevealModal apiKeyObj={revealAPIKey} onClose={() => setRevealAPIKey(null)} />
      )}
    </>
  );
};

export default MyAPIKeysPage;
