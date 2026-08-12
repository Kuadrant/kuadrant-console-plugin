import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import {
  PageSection,
  Title,
  EmptyState,
  EmptyStateBody,
  Alert,
  MenuToggle,
  Dropdown,
  DropdownList,
  DropdownItem,
  Spinner,
  Pagination,
  Popover,
} from '@patternfly/react-core';
import {
  DataViewCheckboxFilter,
  DataViewFilters,
  DataViewTextFilter,
  DataViewToolbar,
} from '@patternfly/react-data-view';
import {
  useActiveNamespace,
  useK8sWatchResource,
  Timestamp,
  ListPageBody,
  useAccessReview,
  consoleFetchJSON,
} from '@openshift-console/dynamic-plugin-sdk';
import { SearchIcon, EllipsisVIcon, InfoCircleIcon } from '@patternfly/react-icons';
import { SortByDirection } from '@patternfly/react-table';
import { RESOURCES, OpenshiftUser, SelfSubjectReviewResponse } from '../../utils/resources';
import { getResourceNameFromKind } from '../../utils/getModelFromResource';
import { APIKeyRequest } from '../apikey/types';
import { getRequestStatus, handleAPIKeyApprovalOrDenial } from '../apikey/utils';
import { APIKeyStatusBadge } from '../apikey/APIKeyStatusBadge';
import ApprovalModal from '../apikey/ApprovalModal';
import RejectionModal from '../apikey/RejectionModal';
import NoPermissionsView from '../NoPermissionsView';
import KuadrantDataView, { KuadrantDataViewColumn } from '../KuadrantDataView';
import extractResourceNameFromURL from '../../utils/nameFromPath';
import '../kuadrant.css';

type APIKeyRequestFilters = {
  name: string;
  status: string[];
  requester: string;
};

const getAPIKeyRequestDisplayName = (request: APIKeyRequest): string =>
  request.spec?.apiKeyRef?.name || request.metadata.name;

type RequestActionsProps = {
  request: APIKeyRequest;
  canApprove: boolean;
  canApproveLoading: boolean;
  onApprove: (request: APIKeyRequest) => void;
  onReject: (request: APIKeyRequest) => void;
};

const RequestActions: React.FC<RequestActionsProps> = ({
  request,
  canApprove,
  canApproveLoading,
  onApprove,
  onReject,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [isOpen, setIsOpen] = React.useState(false);
  const status = getRequestStatus(request);

  if (status !== 'Pending' && status !== 'Approved') {
    return <>-</>;
  }

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          variant="plain"
          onClick={() => setIsOpen(!isOpen)}
          isExpanded={isOpen}
          aria-label={t('Actions')}
        >
          <EllipsisVIcon />
        </MenuToggle>
      )}
    >
      <DropdownList>
        {status === 'Pending' && (
          <DropdownItem
            key="approve"
            onClick={() => {
              setIsOpen(false);
              onApprove(request);
            }}
            isDisabled={canApproveLoading || !canApprove}
          >
            {t('Approve')}
          </DropdownItem>
        )}
        <DropdownItem
          key="reject"
          onClick={() => {
            setIsOpen(false);
            onReject(request);
          }}
          isDisabled={canApproveLoading || !canApprove}
        >
          {t('Deny')}
        </DropdownItem>
      </DropdownList>
    </Dropdown>
  );
};

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

  const [filters, setFilters] = React.useState<APIKeyRequestFilters>({
    name: '',
    status: [],
    requester: '',
  });

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
      if (
        filters.name &&
        !getAPIKeyRequestDisplayName(request).toLowerCase().includes(filters.name.toLowerCase())
      ) {
        return false;
      }

      // Status filter (multiple selection)
      if (filters.status.length > 0) {
        const status = getRequestStatus(request);
        if (!filters.status.includes(status)) {
          return false;
        }
      }

      // Owner filter
      if (
        filters.requester &&
        !request.spec?.requestedBy?.userId?.toLowerCase().includes(filters.requester.toLowerCase())
      ) {
        return false;
      }

      return true;
    });
  }, [requests, productName, filters]);

  const onFilterChange = (_filterId: string, values: Partial<APIKeyRequestFilters>) => {
    setFilters((current) => ({ ...current, ...values }));
    setPage(1);
  };

  const onClearAllFilters = () => {
    setFilters({ name: '', status: [], requester: '' });
    setPage(1);
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

  React.useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filteredData.length / perPage));
    if (page > lastPage) {
      setPage(lastPage);
    }
  }, [filteredData.length, page, perPage]);

  const handleApproveClick = (request: APIKeyRequest) => {
    setApprovalModalRequests([request]);
  };

  const handleRejectClick = (request: APIKeyRequest) => {
    setRejectionModalRequests([request]);
  };

  const handleApprove = async (requests: APIKeyRequest[]) => {
    try {
      for (const request of requests) {
        await handleAPIKeyApprovalOrDenial(request, true, currentUser);
      }
      setApprovalModalRequests([]);
    } catch (error) {
      console.error('Failed to approve request:', error);
      throw error;
    }
  };

  const handleReject = async (requests: APIKeyRequest[], reason?: string) => {
    try {
      for (const request of requests) {
        await handleAPIKeyApprovalOrDenial(request, false, currentUser, reason);
      }
      setRejectionModalRequests([]);
    } catch (error) {
      console.error('Failed to deny request:', error);
      throw error;
    }
  };

  const columns = React.useMemo<KuadrantDataViewColumn<APIKeyRequest>[]>(() => {
    return [
      {
        title: t('Name'),
        id: 'name',
        sort: (data, direction) => {
          const sorted = [...data].sort((left, right) =>
            getAPIKeyRequestDisplayName(left).localeCompare(
              getAPIKeyRequestDisplayName(right),
              undefined,
              {
                numeric: true,
                sensitivity: 'base',
              },
            ),
          );
          return direction === SortByDirection.desc ? sorted.reverse() : sorted;
        },
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
      },
      {
        title: '',
        id: 'actions',
      },
    ];
  }, [t]);

  const getRow = React.useCallback(
    (obj: APIKeyRequest) => {
      const status = getRequestStatus(obj);
      const hasUseCase = obj.spec?.useCase && obj.spec.useCase.trim().length > 0;

      return [
        getAPIKeyRequestDisplayName(obj),
        obj.spec?.requestedBy?.userId || '-',
        hasUseCase
          ? {
              cell: (
                <Popover
                  aria-label={t('Use case details')}
                  headerContent={<div>{t('Use Case')}</div>}
                  bodyContent={<div>{obj.spec.useCase}</div>}
                >
                  <InfoCircleIcon
                    style={{ color: 'var(--pf-v6-global--info-color--100)', cursor: 'pointer' }}
                  />
                </Popover>
              ),
            }
          : '-',
        { cell: <APIKeyStatusBadge phase={status} /> },
        obj.spec?.planTier || '-',
        { cell: <Timestamp timestamp={obj.metadata.creationTimestamp} /> },
        {
          cell: (
            <RequestActions
              request={obj}
              canApprove={canApprove}
              canApproveLoading={canApproveLoading}
              onApprove={handleApproveClick}
              onReject={handleRejectClick}
            />
          ),
          props: { isActionCell: true },
        },
      ];
    },
    [canApprove, canApproveLoading, t],
  );

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
          <DataViewToolbar
            clearAllFilters={onClearAllFilters}
            filters={
              <DataViewFilters<APIKeyRequestFilters>
                onChange={onFilterChange}
                values={filters}
                ouiaId="APIProductAPIKeysDataViewFilters"
              >
                <DataViewTextFilter
                  filterId="name"
                  title={t('Name')}
                  placeholder={t('Search by {{filterValue}}...', {
                    filterValue: t('Name').toLowerCase(),
                  })}
                  ouiaId="APIProductAPIKeysNameFilter"
                />
                <DataViewCheckboxFilter
                  filterId="status"
                  title={t('Status')}
                  placeholder={t('Select status')}
                  options={[
                    { value: 'Pending', label: t('Pending') },
                    { value: 'Approved', label: t('Approved') },
                    { value: 'Denied', label: t('Denied') },
                  ]}
                  ouiaId="APIProductAPIKeysStatusFilter"
                />
                <DataViewTextFilter
                  filterId="requester"
                  title={t('Requester')}
                  placeholder={t('Search by {{filterValue}}...', {
                    filterValue: t('Requester').toLowerCase(),
                  })}
                  ouiaId="APIProductAPIKeysRequesterFilter"
                />
              </DataViewFilters>
            }
            pagination={
              <Pagination
                itemCount={filteredData.length}
                perPage={perPage}
                page={page}
                onSetPage={onSetPage}
                onPerPageSelect={onPerPageSelect}
                variant="top"
                isCompact
              />
            }
            ouiaId="APIProductAPIKeysDataViewToolbar"
          />
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
                {!filters.name && filters.status.length === 0 && !filters.requester
                  ? t('No API Key requests have been made for this API Product.')
                  : t('No API Key requests match the filter criteria.')}
              </EmptyStateBody>
            </EmptyState>
          ) : (
            <>
              <KuadrantDataView<APIKeyRequest>
                ariaLabel={t('API Key Requests')}
                data={filteredData}
                loaded={loaded}
                loadError={requestsLoadError}
                columns={columns}
                getRow={getRow}
                page={page}
                perPage={perPage}
                ouiaId="APIProductAPIKeysDataView"
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
