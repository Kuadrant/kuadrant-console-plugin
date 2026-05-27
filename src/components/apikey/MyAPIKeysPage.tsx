import * as React from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import Helmet from 'react-helmet';
import { Link } from 'react-router-dom-v5-compat';
import { sortable } from '@patternfly/react-table';
import {
  PageSection,
  Title,
  EmptyState,
  EmptyStateBody,
  AlertGroup,
  Alert,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  ToolbarGroup,
  Select,
  SelectOption,
  MenuToggle,
  MenuToggleElement,
  InputGroup,
  TextInput,
  ToolbarFilter,
  Dropdown,
  DropdownList,
  DropdownItem,
  Button,
  Tooltip,
  Pagination,
  Label,
} from '@patternfly/react-core';
import {
  useK8sWatchResource,
  VirtualizedTable,
  TableColumn,
  RowProps,
  TableData,
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
import APIKeyRevealModal from './APIKeyRevealModal';
import APIKeyDeleteModal from './APIKeyDeleteModal';
import RequestAPIKeyModal from './RequestAPIKeyModal';
import { APIKeyStatusBadge } from './APIKeyStatusBadge';
import { APIProduct } from '../apiproduct/types';
import { formatLimits } from '../../utils/apiKeyUtils';
import '../kuadrant.css';
import { useKuadrantNamespaceChange } from '../../hooks/useKuadrantNamespaceChange';

// APIKeyRow component defined outside to avoid hooks violations
const APIKeyRow: React.FC<
  RowProps<APIKey> & {
    activeNamespace: string;
    onReveal: (apiKey: APIKey) => void;
    onDelete: (apiKey: APIKey) => void;
    canDelete: boolean;
    canDeleteLoading: boolean;
    getPlanLimits: (apiKey: APIKey) => string | null;
  }
> = ({
  obj,
  activeColumnIDs,
  activeNamespace,
  onReveal,
  onDelete,
  canDelete,
  canDeleteLoading,
  getPlanLimits,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [isKebabOpen, setIsKebabOpen] = React.useState(false);

  return (
    <>
      <TableData id="name" activeColumnIDs={activeColumnIDs}>
        <Link to={`/kuadrant/ns/${obj.metadata.namespace}/apikeys/name/${obj.metadata.name}`}>
          {obj.metadata.name}
        </Link>
      </TableData>
      {activeNamespace === '#ALL_NS#' && (
        <TableData id="namespace" activeColumnIDs={activeColumnIDs}>
          {obj.metadata.namespace ? (
            <ResourceLink
              groupVersionKind={{ version: 'v1', kind: 'Namespace' }}
              name={obj.metadata.namespace}
            />
          ) : (
            '-'
          )}
        </TableData>
      )}
      <TableData id="owner" activeColumnIDs={activeColumnIDs}>
        {obj.spec?.requestedBy?.userId || '-'}
      </TableData>
      <TableData id="apiProduct" activeColumnIDs={activeColumnIDs}>
        {obj.spec?.apiProductRef?.name ? (
          <Link
            to={`/k8s/ns/${
              obj.spec.apiProductRef.namespace || obj.metadata.namespace
            }/devportal.kuadrant.io~v1alpha1~APIProduct/${obj.spec.apiProductRef.name}/overview`}
          >
            {obj.spec.apiProductRef.name}
          </Link>
        ) : (
          '-'
        )}
      </TableData>
      <TableData id="status" activeColumnIDs={activeColumnIDs}>
        <APIKeyStatusBadge phase={getAPIKeyPhase(obj)} />
      </TableData>
      <TableData id="tier" activeColumnIDs={activeColumnIDs}>
        {(() => {
          const limitsText = getPlanLimits(obj);
          return obj.spec?.planTier || limitsText ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {obj.spec?.planTier && <Label isCompact>{obj.spec.planTier}</Label>}
              {limitsText && <span>{limitsText}</span>}
            </div>
          ) : (
            '-'
          );
        })()}
      </TableData>
      <TableData id="apiKey" activeColumnIDs={activeColumnIDs}>
        {getAPIKeyPhase(obj) !== 'Approved' || !obj.spec?.secretRef?.name ? (
          '-'
        ) : (
          <div
            onClick={(e) => {
              e.stopPropagation();
              onReveal(obj);
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
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onReveal(obj);
              }
            }}
            aria-label={t('Reveal API key')}
          >
            <span style={{ fontFamily: 'monospace' }}>••••••••••••••••</span>
            <EyeIcon style={{ color: 'var(--pf-v6-global--primary-color--100)' }} />
          </div>
        )}
      </TableData>
      <TableData id="requestedTime" activeColumnIDs={activeColumnIDs}>
        <Timestamp timestamp={obj.metadata.creationTimestamp} />
      </TableData>
      <TableData id="actions" activeColumnIDs={activeColumnIDs}>
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
                onDelete(obj);
              }}
              isDisabled={canDeleteLoading || !canDelete}
            >
              {t('Delete')}
            </DropdownItem>
          </DropdownList>
        </Dropdown>
      </TableData>
    </>
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

  const [apiKeys, loaded, apiKeysLoadError] = useK8sWatchResource<APIKey[]>({
    groupVersionKind: RESOURCES.APIKey.gvk,
    namespace: activeNamespace === '#ALL_NS#' ? undefined : activeNamespace,
    isList: true,
  });

  // Watch APIProduct resources to get plan limits
  const [products, productsLoaded] = useK8sWatchResource<APIProduct[]>({
    groupVersionKind: RESOURCES.APIProduct.gvk,
    namespace: activeNamespace === '#ALL_NS#' ? undefined : activeNamespace,
    isList: true,
  });

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
        } catch (error) {
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

  // Filter state
  const [isFilterTypeOpen, setIsFilterTypeOpen] = React.useState(false);
  const [filterType, setFilterType] = React.useState<string>('Name');
  const [isFilterValueOpen, setIsFilterValueOpen] = React.useState(false);
  const [nameFilter, setNameFilter] = React.useState<string>('');
  const [statusFilters, setStatusFilters] = React.useState<string[]>([]);
  const [ownerFilter, setOwnerFilter] = React.useState<string>('');
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
    return apiKeys.filter((key) => {
      // Name filter
      if (nameFilter && !key.metadata.name.toLowerCase().includes(nameFilter.toLowerCase())) {
        return false;
      }

      // Status filter (multiple selection)
      if (statusFilters.length > 0) {
        const phase = getAPIKeyPhase(key);
        if (!statusFilters.includes(phase)) {
          return false;
        }
      }

      // Owner filter
      if (
        ownerFilter &&
        !key.spec?.requestedBy?.userId?.toLowerCase().includes(ownerFilter.toLowerCase())
      ) {
        return false;
      }

      return true;
    });
  }, [apiKeys, nameFilter, statusFilters, ownerFilter]);

  // Pagination
  const startIndex = (currentPage - 1) * perPage;
  const endIndex = startIndex + perPage;
  const paginatedData = filteredData.slice(startIndex, endIndex);

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

  const onFilterTypeToggle = () => setIsFilterTypeOpen(!isFilterTypeOpen);

  const onFilterTypeSelect = (
    _event: React.MouseEvent<Element, MouseEvent> | undefined,
    selection: string,
  ) => {
    setFilterType(selection);
    setIsFilterTypeOpen(false);
  };

  const onFilterValueToggle = () => setIsFilterValueOpen(!isFilterValueOpen);

  const onStatusFilterSelect = (
    _event: React.MouseEvent<Element, MouseEvent> | undefined,
    selection: string,
  ) => {
    setStatusFilters((prev) =>
      prev.includes(selection) ? prev.filter((s) => s !== selection) : [...prev, selection],
    );
    setCurrentPage(1);
  };

  const handleNameFilterChange = (_event: React.FormEvent<HTMLInputElement>, value: string) => {
    setNameFilter(value);
    setCurrentPage(1);
  };

  const handleOwnerFilterChange = (_event: React.FormEvent<HTMLInputElement>, value: string) => {
    setOwnerFilter(value);
    setCurrentPage(1);
  };

  const onDeleteNameFilter = () => {
    setNameFilter('');
    setCurrentPage(1);
  };

  const onDeleteStatusFilter = (_category: string, label: string) => {
    setStatusFilters((prev) => prev.filter((s) => s !== label));
    setCurrentPage(1);
  };

  const onDeleteOwnerFilter = () => {
    setOwnerFilter('');
    setCurrentPage(1);
  };

  const onDeleteNameGroup = () => {
    setNameFilter('');
    setCurrentPage(1);
  };

  const onDeleteStatusGroup = () => {
    setStatusFilters([]);
    setCurrentPage(1);
  };

  const onDeleteOwnerGroup = () => {
    setOwnerFilter('');
    setCurrentPage(1);
  };

  const onClearAllFilters = () => {
    setNameFilter('');
    setStatusFilters([]);
    setOwnerFilter('');
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

  const columns: TableColumn<APIKey>[] = React.useMemo(() => {
    const cols: TableColumn<APIKey>[] = [
      {
        title: t('Name'),
        id: 'name',
        sort: 'metadata.name',
        transforms: [sortable],
      },
    ];

    // Add namespace column only when viewing all namespaces
    if (activeNamespace === '#ALL_NS#') {
      cols.push({
        title: t('Namespace'),
        id: 'namespace',
        sort: 'metadata.namespace',
        transforms: [sortable],
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
        transforms: [sortable],
      },
      {
        title: '',
        id: 'actions',
      },
    );

    return cols;
  }, [t, activeNamespace]);

  // Create a memoized wrapper for APIKeyRow with bound props
  const BoundAPIKeyRow = React.useCallback(
    (props: RowProps<APIKey>) => (
      <APIKeyRow
        {...props}
        activeNamespace={activeNamespace}
        onReveal={setRevealAPIKey}
        onDelete={handleDeleteClick}
        canDelete={canDelete}
        canDeleteLoading={canDeleteLoading}
        getPlanLimits={getPlanLimits}
      />
    ),
    [activeNamespace, handleDeleteClick, canDelete, canDeleteLoading, getPlanLimits],
  );

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
          <Toolbar
            clearAllFilters={onClearAllFilters}
            clearFiltersButtonText={t('Clear all filters')}
          >
            <ToolbarContent>
              <ToolbarGroup variant="filter-group">
                <ToolbarItem>
                  <Select
                    toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                      <MenuToggle
                        ref={toggleRef}
                        onClick={onFilterTypeToggle}
                        isExpanded={isFilterTypeOpen}
                      >
                        {filterType}
                      </MenuToggle>
                    )}
                    onSelect={onFilterTypeSelect}
                    onOpenChange={setIsFilterTypeOpen}
                    isOpen={isFilterTypeOpen}
                  >
                    <SelectOption value="Name">{t('Name')}</SelectOption>
                    <SelectOption value="Status">{t('Status')}</SelectOption>
                    <SelectOption value="Owner">{t('Owner')}</SelectOption>
                  </Select>
                </ToolbarItem>

                <ToolbarFilter
                  categoryName={t('Name')}
                  labels={nameFilter ? [nameFilter] : []}
                  deleteLabel={onDeleteNameFilter}
                  deleteLabelGroup={onDeleteNameGroup}
                  showToolbarItem={filterType === 'Name'}
                >
                  <InputGroup className="pf-v5-c-input-group co-filter-group">
                    <TextInput
                      type="text"
                      placeholder={t('Search by {{filterValue}}...', {
                        filterValue: filterType.toLowerCase(),
                      })}
                      onChange={handleNameFilterChange}
                      value={nameFilter}
                      className="pf-v5-c-form-control co-text-filter-with-icon"
                      aria-label="Name filter"
                    />
                  </InputGroup>
                </ToolbarFilter>

                <ToolbarFilter
                  categoryName={t('Status')}
                  labels={statusFilters}
                  deleteLabel={onDeleteStatusFilter}
                  deleteLabelGroup={onDeleteStatusGroup}
                  showToolbarItem={filterType === 'Status'}
                >
                  <Select
                    toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                      <MenuToggle
                        ref={toggleRef}
                        onClick={onFilterValueToggle}
                        isExpanded={isFilterValueOpen}
                      >
                        {t('Select status')}
                      </MenuToggle>
                    )}
                    onSelect={onStatusFilterSelect}
                    onOpenChange={setIsFilterValueOpen}
                    isOpen={isFilterValueOpen}
                    selected={statusFilters}
                  >
                    <SelectOption
                      hasCheckbox
                      value="Approved"
                      isSelected={statusFilters.includes('Approved')}
                    >
                      {t('Approved')}
                    </SelectOption>
                    <SelectOption
                      hasCheckbox
                      value="Pending"
                      isSelected={statusFilters.includes('Pending')}
                    >
                      {t('Pending')}
                    </SelectOption>
                    <SelectOption
                      hasCheckbox
                      value="Denied"
                      isSelected={statusFilters.includes('Denied')}
                    >
                      {t('Denied')}
                    </SelectOption>
                    <SelectOption
                      hasCheckbox
                      value="Failed"
                      isSelected={statusFilters.includes('Failed')}
                    >
                      {t('Failed')}
                    </SelectOption>
                  </Select>
                </ToolbarFilter>

                <ToolbarFilter
                  categoryName={t('Owner')}
                  labels={ownerFilter ? [ownerFilter] : []}
                  deleteLabel={onDeleteOwnerFilter}
                  deleteLabelGroup={onDeleteOwnerGroup}
                  showToolbarItem={filterType === 'Owner'}
                >
                  <InputGroup className="pf-v5-c-input-group co-filter-group">
                    <TextInput
                      type="text"
                      placeholder={t('Search by {{filterValue}}...', {
                        filterValue: filterType.toLowerCase(),
                      })}
                      onChange={handleOwnerFilterChange}
                      value={ownerFilter}
                      className="pf-v5-c-form-control co-text-filter-with-icon"
                      aria-label="Owner filter"
                    />
                  </InputGroup>
                </ToolbarFilter>
              </ToolbarGroup>
            </ToolbarContent>
          </Toolbar>
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
                {!nameFilter && statusFilters.length === 0 && !ownerFilter
                  ? t(
                      'There are no API Keys to display - request access to an API Product to get started.',
                    )
                  : t('No API Keys match the filter criteria.')}
              </EmptyStateBody>
            </EmptyState>
          ) : (
            <VirtualizedTable<APIKey>
              data={paginatedData}
              unfilteredData={filteredData}
              loaded={loaded}
              loadError={apiKeysLoadError}
              columns={columns}
              Row={BoundAPIKeyRow}
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
