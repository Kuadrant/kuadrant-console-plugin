import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom-v5-compat';
import { sortable } from '@patternfly/react-table';
import {
  PageSection,
  Title,
  EmptyState,
  EmptyStateBody,
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
  Spinner,
  Pagination,
  Popover,
} from '@patternfly/react-core';
import {
  useActiveNamespace,
  useK8sWatchResource,
  VirtualizedTable,
  TableColumn,
  RowProps,
  TableData,
  Timestamp,
  ListPageBody,
  useAccessReview,
  k8sCreate,
  consoleFetchJSON,
} from '@openshift-console/dynamic-plugin-sdk';
import { SearchIcon, EllipsisVIcon, InfoCircleIcon } from '@patternfly/react-icons';
import {
  RESOURCES,
  OpenshiftUser,
  SelfSubjectReviewResponse,
} from '../../utils/resources';
import { getModelFromResource, getResourceNameFromKind } from '../../utils/getModelFromResource';
import { APIKeyRequest, APIKeyApproval } from '../apikey/types';
import { getRequestStatus } from '../apikey/utils';
import { APIKeyStatusBadge } from '../apikey/APIKeyStatusBadge';
import ApprovalModal from '../apikey/ApprovalModal';
import RejectionModal from '../apikey/RejectionModal';
import NoPermissionsView from '../NoPermissionsView';
import extractResourceNameFromURL from '../../utils/nameFromPath';
import '../kuadrant.css';

const APIProductAPIKeysTab: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();
  const location = useLocation();
  const productName = extractResourceNameFromURL(location.pathname);

  // RBAC permission check - check if user can list APIKeyRequests
  const [canList, canListLoading] = useAccessReview({
    group: RESOURCES.APIKeyRequest.gvk.group,
    resource: getResourceNameFromKind(RESOURCES.APIKeyRequest.gvk.kind),
    verb: 'list',
    namespace: activeNamespace,
  });

  // Watch APIKeyRequests in the product's namespace (shadow resources)
  // Only watch if user has permission
  const [requests, loaded, requestsLoadError] = useK8sWatchResource<APIKeyRequest[]>(
    canList && !canListLoading
      ? {
          groupVersionKind: RESOURCES.APIKeyRequest.gvk,
          namespace: activeNamespace,
          isList: true,
        }
      : null,
  );

  // Filter state
  const [isFilterTypeOpen, setIsFilterTypeOpen] = React.useState(false);
  const [filterType, setFilterType] = React.useState<string>(t('Name'));
  const [isFilterValueOpen, setIsFilterValueOpen] = React.useState(false);
  const [nameFilter, setNameFilter] = React.useState<string>('');
  const [statusFilters, setStatusFilters] = React.useState<string[]>([]);
  const [ownerFilter, setOwnerFilter] = React.useState<string>('');

  // Pagination state
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(20);

  // Modal state
  const [approvalModalRequests, setApprovalModalRequests] = React.useState<APIKeyRequest[]>([]);
  const [rejectionModalRequests, setRejectionModalRequests] = React.useState<APIKeyRequest[]>([]);
  const [currentUser, setCurrentUser] = React.useState('');

  // RBAC permission checks
  const [canApprove, canApproveLoading] = useAccessReview({
    group: RESOURCES.APIKeyApproval.gvk.group,
    resource: getResourceNameFromKind(RESOURCES.APIKeyApproval.gvk.kind),
    verb: 'create',
    namespace: activeNamespace,
  });

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
            setCurrentUser(user.metadata.name);
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
          setCurrentUser(username);
        }
      } catch (_error) {
        // Failed to fetch username, proceeding without it
      }
    };

    fetchUsername();
  }, []);

  // Filter data based on filter type and value AND the API product
  const filteredData = React.useMemo(() => {
    if (!requests) return [];

    return requests.filter((request) => {
      // Filter by API Product - this is the key filter for this tab
      if (request.spec?.apiProductRef?.name !== productName) {
        return false;
      }

      // Name filter
      if (nameFilter && !request.metadata.name.toLowerCase().includes(nameFilter.toLowerCase())) {
        return false;
      }

      // Status filter (multiple selection)
      if (statusFilters.length > 0) {
        const status = getRequestStatus(request);
        if (!statusFilters.includes(status)) {
          return false;
        }
      }

      // Owner filter
      if (
        ownerFilter &&
        !request.spec?.requestedBy?.userId?.toLowerCase().includes(ownerFilter.toLowerCase())
      ) {
        return false;
      }

      return true;
    });
  }, [requests, productName, nameFilter, statusFilters, ownerFilter]);

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
  };

  const handleNameFilterChange = (_event: React.FormEvent<HTMLInputElement>, value: string) => {
    setNameFilter(value);
  };

  const handleOwnerFilterChange = (_event: React.FormEvent<HTMLInputElement>, value: string) => {
    setOwnerFilter(value);
  };

  const onDeleteNameFilter = () => {
    setNameFilter('');
  };

  const onDeleteStatusFilter = (_category: string, label: string) => {
    setStatusFilters((prev) => prev.filter((s) => s !== label));
  };

  const onDeleteOwnerFilter = () => {
    setOwnerFilter('');
  };

  const onDeleteNameGroup = () => {
    setNameFilter('');
  };

  const onDeleteStatusGroup = () => {
    setStatusFilters([]);
  };

  const onDeleteOwnerGroup = () => {
    setOwnerFilter('');
  };

  const onClearAllFilters = () => {
    setNameFilter('');
    setStatusFilters([]);
    setOwnerFilter('');
  };

  // Pagination handlers
  const onSetPage = (
    _event: React.MouseEvent | React.KeyboardEvent | MouseEvent,
    newPage: number,
  ) => {
    setPage(newPage);
  };

  const onPerPageSelect = (
    _event: React.MouseEvent | React.KeyboardEvent | MouseEvent,
    newPerPage: number,
  ) => {
    setPerPage(newPerPage);
    setPage(1); // Reset to first page when changing page size
  };

  // Paginate filtered data
  const paginatedData = React.useMemo(() => {
    const startIdx = (page - 1) * perPage;
    const endIdx = startIdx + perPage;
    return filteredData.slice(startIdx, endIdx);
  }, [filteredData, page, perPage]);

  const handleApproveClick = (request: APIKeyRequest) => {
    setApprovalModalRequests([request]);
  };

  const handleRejectClick = (request: APIKeyRequest) => {
    setRejectionModalRequests([request]);
  };

  const handleApprove = async (requests: APIKeyRequest[]) => {
    try {
      const now = new Date().toISOString();

      for (const request of requests) {
        const approval: APIKeyApproval = {
          apiVersion: 'devportal.kuadrant.io/v1alpha1',
          kind: 'APIKeyApproval',
          metadata: {
            name: `${request.metadata.name}-approval`,
            namespace: request.metadata.namespace,
          },
          spec: {
            apiKeyRequestRef: { name: request.metadata.name },
            approved: true,
            reviewedBy: currentUser,
            reviewedAt: now,
          },
        };

        const model = getModelFromResource(approval);
        await k8sCreate({ model, data: approval });
      }

      setApprovalModalRequests([]);
    } catch (error) {
      console.error('Failed to approve request:', error);
      throw error;
    }
  };

  const handleReject = async (requests: APIKeyRequest[], reason?: string) => {
    try {
      const now = new Date().toISOString();

      for (const request of requests) {
        const approval: APIKeyApproval = {
          apiVersion: 'devportal.kuadrant.io/v1alpha1',
          kind: 'APIKeyApproval',
          metadata: {
            name: `${request.metadata.name}-rejection`,
            namespace: request.metadata.namespace,
          },
          spec: {
            apiKeyRequestRef: { name: request.metadata.name },
            approved: false,
            reviewedBy: currentUser,
            reviewedAt: now,
            reason: reason,
          },
        };

        const model = getModelFromResource(approval);
        await k8sCreate({ model, data: approval });
      }

      setRejectionModalRequests([]);
    } catch (error) {
      console.error('Failed to reject request:', error);
      throw error;
    }
  };

  const columns: TableColumn<APIKeyRequest>[] = React.useMemo(() => {
    return [
      {
        title: t('Name'),
        id: 'name',
        sort: 'metadata.name',
        transforms: [sortable],
      },
      {
        title: t('Requester'),
        id: 'requester',
      },
      {
        title: t('Use Case'),
        id: 'useCase',
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
        title: t('Requested Time'),
        id: 'requestedTime',
        sort: 'metadata.creationTimestamp',
        transforms: [sortable],
      },
      {
        title: '',
        id: 'actions',
      },
    ];
  }, [t]);

  const RequestRow: React.FC<RowProps<APIKeyRequest>> = ({ obj, activeColumnIDs }) => {
    const [isKebabOpen, setIsKebabOpen] = React.useState(false);
    const status = getRequestStatus(obj);
    const isPending = status === 'Pending';
    const hasUseCase = obj.spec?.useCase && obj.spec.useCase.trim().length > 0;

    return (
      <>
        <TableData id="name" activeColumnIDs={activeColumnIDs}>
          {obj.spec?.apiKeyRef?.name || obj.metadata.name}
        </TableData>
        <TableData id="requester" activeColumnIDs={activeColumnIDs}>
          {obj.spec?.requestedBy?.userId || '-'}
        </TableData>
        <TableData id="useCase" activeColumnIDs={activeColumnIDs}>
          {hasUseCase ? (
            <Popover
              aria-label={t('Use case details')}
              headerContent={<div>{t('Use Case')}</div>}
              bodyContent={<div>{obj.spec.useCase}</div>}
            >
              <InfoCircleIcon
                style={{ color: 'var(--pf-v6-global--info-color--100)', cursor: 'pointer' }}
              />
            </Popover>
          ) : (
            '-'
          )}
        </TableData>
        <TableData id="status" activeColumnIDs={activeColumnIDs}>
          <APIKeyStatusBadge phase={status} />
        </TableData>
        <TableData id="tier" activeColumnIDs={activeColumnIDs}>
          {obj.spec?.planTier || '-'}
        </TableData>
        <TableData id="requestedTime" activeColumnIDs={activeColumnIDs}>
          <Timestamp timestamp={obj.metadata.creationTimestamp} />
        </TableData>
        <TableData id="actions" activeColumnIDs={activeColumnIDs}>
          {isPending ? (
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
                  key="approve"
                  onClick={() => {
                    setIsKebabOpen(false);
                    handleApproveClick(obj);
                  }}
                  isDisabled={canApproveLoading || !canApprove}
                >
                  {t('Approve')}
                </DropdownItem>
                <DropdownItem
                  key="reject"
                  onClick={() => {
                    setIsKebabOpen(false);
                    handleRejectClick(obj);
                  }}
                  isDisabled={canApproveLoading || !canApprove}
                >
                  {t('Reject')}
                </DropdownItem>
              </DropdownList>
            </Dropdown>
          ) : (
            '-'
          )}
        </TableData>
      </>
    );
  };

  if (canListLoading) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Spinner size="lg" />
      </PageSection>
    );
  }

  if (!canList) {
    return (
      <NoPermissionsView
        primaryMessage={t('You do not have permission to view API Key Requests')}
      />
    );
  }

  if (requestsLoadError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Alert variant="danger" isInline title={t('Error loading API Key Requests')}>
          {requestsLoadError.message}
        </Alert>
      </PageSection>
    );
  }

  return (
    <>
      <PageSection hasBodyWrapper={false} className="kuadrant-policy-list-body">
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
                    <SelectOption value={t('Name')}>{t('Name')}</SelectOption>
                    <SelectOption value={t('Status')}>{t('Status')}</SelectOption>
                    <SelectOption value={t('Requester')}>{t('Requester')}</SelectOption>
                  </Select>
                </ToolbarItem>

                <ToolbarFilter
                  categoryName={t('Name')}
                  labels={nameFilter ? [nameFilter] : []}
                  deleteLabel={onDeleteNameFilter}
                  deleteLabelGroup={onDeleteNameGroup}
                  showToolbarItem={filterType === t('Name')}
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
                      aria-label={t('Name filter')}
                    />
                  </InputGroup>
                </ToolbarFilter>

                <ToolbarFilter
                  categoryName={t('Status')}
                  labels={statusFilters}
                  deleteLabel={onDeleteStatusFilter}
                  deleteLabelGroup={onDeleteStatusGroup}
                  showToolbarItem={filterType === t('Status')}
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
                      value="Pending"
                      isSelected={statusFilters.includes('Pending')}
                    >
                      {t('Pending')}
                    </SelectOption>
                    <SelectOption
                      hasCheckbox
                      value="Approved"
                      isSelected={statusFilters.includes('Approved')}
                    >
                      {t('Approved')}
                    </SelectOption>
                    <SelectOption
                      hasCheckbox
                      value="Denied"
                      isSelected={statusFilters.includes('Denied')}
                    >
                      {t('Denied')}
                    </SelectOption>
                  </Select>
                </ToolbarFilter>

                <ToolbarFilter
                  categoryName={t('Requester')}
                  labels={ownerFilter ? [ownerFilter] : []}
                  deleteLabel={onDeleteOwnerFilter}
                  deleteLabelGroup={onDeleteOwnerGroup}
                  showToolbarItem={filterType === t('Requester')}
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
                      aria-label={t('Requester filter')}
                    />
                  </InputGroup>
                </ToolbarFilter>
              </ToolbarGroup>
              <ToolbarItem variant="pagination" align={{ default: 'alignEnd' }}>
                <Pagination
                  itemCount={filteredData.length}
                  perPage={perPage}
                  page={page}
                  onSetPage={onSetPage}
                  onPerPageSelect={onPerPageSelect}
                  variant="top"
                  isCompact
                />
              </ToolbarItem>
            </ToolbarContent>
          </Toolbar>
          {loaded && filteredData.length === 0 ? (
            <EmptyState
              titleText={
                <Title headingLevel="h4" size="lg">
                  {t('No API Key Requests found')}
                </Title>
              }
              icon={SearchIcon}
            >
              <EmptyStateBody>
                {!nameFilter && statusFilters.length === 0 && !ownerFilter
                  ? t('No API Key requests have been made for this API Product.')
                  : t('No API Key requests match the filter criteria.')}
              </EmptyStateBody>
            </EmptyState>
          ) : (
            <>
              <VirtualizedTable<APIKeyRequest>
                data={paginatedData}
                unfilteredData={requests || []}
                loaded={loaded}
                loadError={requestsLoadError}
                columns={columns}
                Row={RequestRow}
              />
              <Pagination
                itemCount={filteredData.length}
                perPage={perPage}
                page={page}
                onSetPage={onSetPage}
                onPerPageSelect={onPerPageSelect}
                variant="bottom"
              />
            </>
          )}
        </ListPageBody>
      </PageSection>

      {/* Approval Modal */}
      <ApprovalModal
        isOpen={approvalModalRequests.length > 0}
        requests={approvalModalRequests}
        onClose={() => setApprovalModalRequests([])}
        onApprove={handleApprove}
      />

      {/* Rejection Modal */}
      <RejectionModal
        isOpen={rejectionModalRequests.length > 0}
        requests={rejectionModalRequests}
        onClose={() => setRejectionModalRequests([])}
        onReject={handleReject}
      />
    </>
  );
};

export default APIProductAPIKeysTab;
