import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  PageSection,
  Title,
  Label,
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
  AlertGroup,
  Alert,
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
  ListPageCreateLink,
} from '@openshift-console/dynamic-plugin-sdk';
import { RESOURCES } from '../../utils/resources';
import { APIKey } from './types';
import { getStatusLabel } from '../../utils/statusLabel';
import DropdownWithKebab from '../DropdownWithKebab';
import '../kuadrant.css';

const APIKeysListPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();
  const allNamespacesSubPath = '#ALL_NS#';

  const [apiKeys, keysLoaded, keysLoadError] = useK8sWatchResource<APIKey[]>({
    groupVersionKind: RESOURCES.APIKey.gvk,
    namespace: activeNamespace === allNamespacesSubPath ? undefined : activeNamespace,
    isList: true,
  });

  const [filters, setFilters] = React.useState<string>('');
  const [statusFilter, setStatusFilter] = React.useState<string>('');
  const [isStatusFilterOpen, setIsStatusFilterOpen] = React.useState(false);
  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [perPage, setPerPage] = React.useState<number>(10);

  const filteredKeys = React.useMemo(() => {
    if (!apiKeys) return [];

    return apiKeys.filter((key) => {
      // Status filter
      if (statusFilter) {
        const conditions = key.status?.conditions || [];
        const isApproved = conditions.some((c) => c.type === 'Approved' && c.status === 'True');
        const isDenied = conditions.some((c) => c.type === 'Denied' && c.status === 'True');
        const isFailed = conditions.some((c) => c.type === 'Failed' && c.status === 'True');
        const isPending = conditions.length === 0;

        if (statusFilter === 'Approved' && !isApproved) return false;
        if (statusFilter === 'Denied' && !isDenied) return false;
        if (statusFilter === 'Failed' && !isFailed) return false;
        if (statusFilter === 'Pending' && !isPending) return false;
      }

      // Name / UserID filter
      if (filters) {
        const filterValue = filters.toLowerCase();
        const name = key.metadata?.name || '';
        const userId = key.spec?.requestedBy?.userId || '';
        if (!name.toLowerCase().includes(filterValue) && !userId.toLowerCase().includes(filterValue)) {
          return false;
        }
      }

      return true;
    });
  }, [apiKeys, statusFilter, filters]);

  const startIndex = (currentPage - 1) * perPage;
  const endIndex = startIndex + perPage;
  const paginatedKeys = filteredKeys.slice(startIndex, endIndex);

  const onSetPage = (_event: any, pageNumber: number) => setCurrentPage(pageNumber);
  const onPerPageSelect = (_event: any, perPageNumber: number) => {
    setPerPage(perPageNumber);
    setCurrentPage(1);
  };

  const columns: TableColumn<APIKey>[] = React.useMemo(
    () => [
      {
        title: t('Name'),
        id: 'name',
        sort: 'metadata.name',
        transforms: [sortable],
      },
      {
        title: t('API Product'),
        id: 'apiproduct',
      },
      {
        title: t('Plan Tier'),
        id: 'planTier',
        sort: 'spec.planTier',
        transforms: [sortable],
      },
      {
        title: t('Requested By'),
        id: 'requestedBy',
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
        id: 'kebab',
        props: { className: 'pf-v6-c-table__action' },
      },
    ],
    [t],
  );

  const APIKeyRow: React.FC<RowProps<APIKey>> = ({ obj, activeColumnIDs }) => {
    return (
      <>
        <TableData id="name" activeColumnIDs={activeColumnIDs}>
          <ResourceLink
            groupVersionKind={RESOURCES.APIKey.gvk}
            name={obj.metadata?.name}
            namespace={obj.metadata?.namespace}
          />
        </TableData>
        <TableData id="apiproduct" activeColumnIDs={activeColumnIDs}>
          <ResourceLink
            groupVersionKind={RESOURCES.APIProduct.gvk}
            name={obj.spec.apiProductRef.name}
            namespace={obj.spec.apiProductRef.namespace}
          />
        </TableData>
        <TableData id="planTier" activeColumnIDs={activeColumnIDs}>
          <Label color="blue">{obj.spec.planTier}</Label>
        </TableData>
        <TableData id="requestedBy" activeColumnIDs={activeColumnIDs}>
          {obj.spec.requestedBy?.userId || '-'}
        </TableData>
        <TableData id="status" activeColumnIDs={activeColumnIDs}>
          {getStatusLabel(obj)}
        </TableData>
        <TableData id="created" activeColumnIDs={activeColumnIDs}>
          <Timestamp timestamp={obj.metadata?.creationTimestamp} />
        </TableData>
        <TableData id="kebab" activeColumnIDs={activeColumnIDs} className="pf-v6-c-table__action">
          <DropdownWithKebab obj={obj} />
        </TableData>
      </>
    );
  };

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h1">{t('API Keys')}</Title>
      </PageSection>
      <PageSection hasBodyWrapper={false} className="kuadrant-policy-list-body">
        <ListPageBody>
          {keysLoadError && (
            <AlertGroup>
              <Alert title={t('Error loading API Keys')} variant="danger" isInline>
                {keysLoadError.message}
              </Alert>
            </AlertGroup>
          )}
          <Toolbar>
            <ToolbarContent>
              <ToolbarGroup variant="filter-group">
                <ToolbarItem>
                  <Select
                    isOpen={isStatusFilterOpen}
                    onOpenChange={setIsStatusFilterOpen}
                    onSelect={(_evt, value) => {
                      setStatusFilter(value === statusFilter ? '' : (value as string));
                      setIsStatusFilterOpen(false);
                      setCurrentPage(1);
                    }}
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
                      {['Pending', 'Approved', 'Denied', 'Failed'].map((status) => (
                        <SelectOption key={status} value={status} isSelected={statusFilter === status}>
                          {status}
                        </SelectOption>
                      ))}
                    </SelectList>
                  </Select>
                </ToolbarItem>
                <ToolbarItem>
                  <InputGroup>
                    <TextInput
                      type="text"
                      placeholder={t('Search by name or userId...')}
                      value={filters}
                      onChange={(_event, value) => {
                        setFilters(value);
                        setCurrentPage(1);
                      }}
                      aria-label={t('Resource search')}
                    />
                  </InputGroup>
                </ToolbarItem>
              </ToolbarGroup>
              <ToolbarItem>
                <ListPageCreateLink to={`/kuadrant/ns/${activeNamespace}/apikeys/~new`}>
                  {t('Request API Key')}
                </ListPageCreateLink>
              </ToolbarItem>
            </ToolbarContent>
          </Toolbar>

          {paginatedKeys.length === 0 && keysLoaded ? (
            <EmptyState
              titleText={<Title headingLevel="h4" size="lg">{t('No API Keys found')}</Title>}
              icon={SearchIcon}
            >
              <EmptyStateBody>
                {t('There are no API Keys to display - please request some.')}
              </EmptyStateBody>
            </EmptyState>
          ) : (
            <VirtualizedTable<APIKey>
              data={paginatedKeys}
              unfilteredData={filteredKeys}
              loaded={keysLoaded}
              loadError={keysLoadError}
              columns={columns}
              Row={APIKeyRow}
            />
          )}

          {filteredKeys.length > 0 && (
            <Pagination
              itemCount={filteredKeys.length}
              perPage={perPage}
              page={currentPage}
              onSetPage={onSetPage}
              onPerPageSelect={onPerPageSelect}
              variant="bottom"
            />
          )}
        </ListPageBody>
      </PageSection>
    </>
  );
};

export default APIKeysListPage;
