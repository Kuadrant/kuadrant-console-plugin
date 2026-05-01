import * as React from 'react';
import { Table, Thead, Tr, Th, Tbody, Td, SortByDirection } from '@patternfly/react-table';
import { Dropdown, MenuToggle, DropdownList, DropdownItem, Tooltip } from '@patternfly/react-core';
import { Timestamp } from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import { APIKeyRequest } from './types';
import { getRequestStatus, truncateUseCase, getStatusSortWeight } from './utils';
import { EllipsisVIcon } from '@patternfly/react-icons';

interface APIKeyApprovalTableProps {
  requests: APIKeyRequest[];
  selectedRequests: Set<string>;
  onSelectRequest: (requestName: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onApprove: (request: APIKeyRequest) => void;
  onReject: (request: APIKeyRequest) => void;
}

const APIKeyApprovalTable: React.FC<APIKeyApprovalTableProps> = ({
  requests,
  selectedRequests,
  onSelectRequest,
  onSelectAll,
  onApprove,
  onReject,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [sortBy, setSortBy] = React.useState<{ index?: number; direction?: 'asc' | 'desc' }>({
    index: 6, // Status column
    direction: 'desc',
  });
  const [openActionMenus, setOpenActionMenus] = React.useState<Set<string>>(new Set());

  const toggleActionMenu = (requestName: string) => {
    setOpenActionMenus((prev) => {
      const next = new Set(prev);
      if (next.has(requestName)) {
        next.delete(requestName);
      } else {
        next.add(requestName);
      }
      return next;
    });
  };

  const getSortableRowValues = (request: APIKeyRequest): (string | number)[] => {
    const status = getRequestStatus(request);
    return [
      '', // Checkbox column
      request.spec.requestedBy.email,
      request.spec.apiProductRef.name,
      request.spec.planTier,
      request.spec.useCase,
      request.metadata?.creationTimestamp || '',
      getStatusSortWeight(status), // Status column - use weight for sorting
    ];
  };

  const sortedRequests = React.useMemo(() => {
    if (!sortBy.index) return requests;

    const sorted = [...requests].sort((a, b) => {
      const aValue = getSortableRowValues(a)[sortBy.index!];
      const bValue = getSortableRowValues(b)[sortBy.index!];

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortBy.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      const aString = String(aValue);
      const bString = String(bValue);

      if (sortBy.direction === 'asc') {
        return aString.localeCompare(bString);
      }
      return bString.localeCompare(aString);
    });
    return sorted;
  }, [requests, sortBy]);

  const onSort = (_event: React.MouseEvent, index: number, direction: SortByDirection) => {
    setSortBy({ index, direction });
  };

  const pendingRequests = requests.filter((r) => getRequestStatus(r) === 'Pending');
  const allPendingSelected =
    pendingRequests.length > 0 &&
    pendingRequests.every((r) => selectedRequests.has(r.metadata?.name || ''));

  const handleSelectAll = (checked: boolean) => {
    onSelectAll(checked);
  };

  const handleSelect = (request: APIKeyRequest, checked: boolean) => {
    onSelectRequest(request.metadata?.name || '', checked);
  };

  if (requests.length === 0) {
    return null;
  }

  return (
    <Table variant="compact">
      <Thead>
        <Tr>
          <Th
            select={{
              onSelect: (_event, checked) => handleSelectAll(checked),
              isSelected: allPendingSelected,
            }}
          />
          <Th sort={{ sortBy, onSort, columnIndex: 1 }}>{t('Requester')}</Th>
          <Th sort={{ sortBy, onSort, columnIndex: 2 }}>{t('API Product')}</Th>
          <Th sort={{ sortBy, onSort, columnIndex: 3 }}>{t('Plan')}</Th>
          <Th>{t('Use Case')}</Th>
          <Th sort={{ sortBy, onSort, columnIndex: 5 }}>{t('Date')}</Th>
          <Th sort={{ sortBy, onSort, columnIndex: 6 }}>{t('Status')}</Th>
          <Th>{t('Actions')}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {sortedRequests.map((request, rowIndex) => {
          const status = getRequestStatus(request);
          const isPending = status === 'Pending';
          const requestName = request.metadata?.name || '';
          const isSelected = selectedRequests.has(requestName);

          return (
            <Tr key={requestName}>
              <Td
                select={{
                  rowIndex: rowIndex,
                  onSelect: (_event, checked) => handleSelect(request, checked),
                  isSelected: isSelected,
                  isDisabled: !isPending, // Only pending can be selected
                }}
              />
              <Td dataLabel={t('Requester')}>{request.spec.requestedBy.email}</Td>
              <Td dataLabel={t('API Product')}>{request.spec.apiProductRef.name}</Td>
              <Td dataLabel={t('Plan')}>{request.spec.planTier}</Td>
              <Td dataLabel={t('Use Case')}>
                <Tooltip content={request.spec.useCase}>
                  <span>{truncateUseCase(request.spec.useCase)}</span>
                </Tooltip>
              </Td>
              <Td dataLabel={t('Date')}>
                <Timestamp timestamp={request.metadata?.creationTimestamp || ''} />
              </Td>
              <Td dataLabel={t('Status')}>{status}</Td>
              <Td isActionCell>
                {isPending && (
                  <Dropdown
                    isOpen={openActionMenus.has(requestName)}
                    onOpenChange={() => toggleActionMenu(requestName)}
                    toggle={(toggleRef) => (
                      <MenuToggle
                        ref={toggleRef}
                        variant="plain"
                        onClick={() => toggleActionMenu(requestName)}
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
                          onApprove(request);
                          toggleActionMenu(requestName);
                        }}
                      >
                        {t('Approve')}
                      </DropdownItem>
                      <DropdownItem
                        key="reject"
                        onClick={() => {
                          onReject(request);
                          toggleActionMenu(requestName);
                        }}
                      >
                        {t('Reject')}
                      </DropdownItem>
                    </DropdownList>
                  </Dropdown>
                )}
              </Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
};

export default APIKeyApprovalTable;
