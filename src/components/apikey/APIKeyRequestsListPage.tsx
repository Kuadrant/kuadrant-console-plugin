import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
  EmptyState,
  EmptyStateBody,
  Title,
  Button,
  Pagination,
} from '@patternfly/react-core';
import { sortable } from '@patternfly/react-table';
import { SearchIcon } from '@patternfly/react-icons';
import {
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
import { APIKeyRequest } from './types';
import { getStatusLabel } from '../../utils/statusLabel';
import APIKeyApprovalModal from './APIKeyApprovalModal';
import '../kuadrant.css';

interface APIKeyRequestsListPageProps {
  namespace?: string;
  apiProductName?: string;
}

const APIKeyRequestsListPage: React.FC<APIKeyRequestsListPageProps> = ({
  namespace,
  apiProductName,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [selectedRequest, setSelectedRequest] = React.useState<APIKeyRequest | null>(null);

  const [requests, loaded, loadError] = useK8sWatchResource<APIKeyRequest[]>({
    groupVersionKind: RESOURCES.APIKeyRequest.gvk,
    namespace,
    isList: true,
  });

  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [perPage, setPerPage] = React.useState<number>(10);

  const filteredRequests = React.useMemo(() => {
    if (!requests) return [];
    if (apiProductName) {
      return requests.filter((r) => r.spec.apiProductRef.name === apiProductName);
    }
    return requests;
  }, [requests, apiProductName]);

  const startIndex = (currentPage - 1) * perPage;
  const endIndex = startIndex + perPage;
  const paginatedRequests = filteredRequests.slice(startIndex, endIndex);

  const onSetPage = (_event: any, pageNumber: number) => setCurrentPage(pageNumber);
  const onPerPageSelect = (_event: any, perPageNumber: number) => {
    setPerPage(perPageNumber);
    setCurrentPage(1);
  };

  const columns: TableColumn<APIKeyRequest>[] = React.useMemo(
    () => [
      {
        title: t('Name'),
        id: 'name',
        sort: 'metadata.name',
        transforms: [sortable],
      },
      {
        title: t('Requested By'),
        id: 'requestedBy',
      },
      {
        title: t('Plan Tier'),
        id: 'planTier',
      },
      {
        title: t('Status'),
        id: 'status',
      },
      {
        title: t('Created'),
        id: 'created',
        sort: 'metadata.creationTimestamp',
        transforms: [sortable],
      },
      {
        title: '',
        id: 'actions',
      },
    ],
    [t],
  );

  const APIKeyRequestRow: React.FC<RowProps<APIKeyRequest>> = ({ obj, activeColumnIDs }) => {
    const isPending = !obj.status?.conditions || obj.status.conditions.length === 0;

    return (
      <>
        <TableData id="name" activeColumnIDs={activeColumnIDs}>
          <ResourceLink
            groupVersionKind={RESOURCES.APIKeyRequest.gvk}
            name={obj.metadata?.name}
            namespace={obj.metadata?.namespace}
          />
        </TableData>
        <TableData id="requestedBy" activeColumnIDs={activeColumnIDs}>
          {obj.spec.requestedBy?.email || obj.spec.requestedBy?.userId || '-'}
        </TableData>
        <TableData id="planTier" activeColumnIDs={activeColumnIDs}>
          {obj.spec.planTier}
        </TableData>
        <TableData id="status" activeColumnIDs={activeColumnIDs}>
          {getStatusLabel(obj)}
        </TableData>
        <TableData id="created" activeColumnIDs={activeColumnIDs}>
          <Timestamp timestamp={obj.metadata?.creationTimestamp} />
        </TableData>
        <TableData id="actions" activeColumnIDs={activeColumnIDs}>
          {isPending && (
            <Button variant="secondary" isSmall onClick={() => setSelectedRequest(obj)}>
              {t('Review')}
            </Button>
          )}
        </TableData>
      </>
    );
  };

  return (
    <ListPageBody>
      {selectedRequest && (
        <APIKeyApprovalModal
          request={selectedRequest}
          isOpen={!!selectedRequest}
          onClose={() => setSelectedRequest(null)}
        />
      )}
      <Toolbar>
        <ToolbarContent>
          <ToolbarGroup variant="filter-group">
            <ToolbarItem>
              <Title headingLevel="h2" size="md">
                {t('Access Requests')}
              </Title>
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>

      {paginatedRequests.length === 0 && loaded ? (
        <EmptyState
          titleText={<Title headingLevel="h4" size="lg">{t('No access requests found')}</Title>}
          icon={SearchIcon}
        >
          <EmptyStateBody>
            {t('There are no pending access requests for this API Product.')}
          </EmptyStateBody>
        </EmptyState>
      ) : (
        <VirtualizedTable<APIKeyRequest>
          data={paginatedRequests}
          unfilteredData={filteredRequests}
          loaded={loaded}
          loadError={loadError}
          columns={columns}
          Row={APIKeyRequestRow}
        />
      )}

      {filteredRequests.length > 0 && (
        <Pagination
          itemCount={filteredRequests.length}
          perPage={perPage}
          page={currentPage}
          onSetPage={onSetPage}
          onPerPageSelect={onPerPageSelect}
          variant="bottom"
        />
      )}
    </ListPageBody>
  );
};

export default APIKeyRequestsListPage;
