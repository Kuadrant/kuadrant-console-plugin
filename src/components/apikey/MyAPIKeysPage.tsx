import * as React from 'react';
import { useTranslation } from 'react-i18next';
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
  ResourceLink,
} from '@openshift-console/dynamic-plugin-sdk';
import { SearchIcon } from '@patternfly/react-icons';
import { RESOURCES, APIKey } from '../../utils/resources';
import APIKeyReveal from './APIKeyReveal';
import '../kuadrant.css';

const MyAPIKeysPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();

  const [apiKeys, loaded, apiKeysLoadError] = useK8sWatchResource<APIKey[]>({
    groupVersionKind: RESOURCES.APIKey.gvk,
    namespace: activeNamespace === '#ALL_NS#' ? undefined : activeNamespace,
    isList: true,
  });

  // Filter state
  const [isFilterTypeOpen, setIsFilterTypeOpen] = React.useState(false);
  const [filterType, setFilterType] = React.useState<string>('Name');
  const [isFilterValueOpen, setIsFilterValueOpen] = React.useState(false);
  const [nameFilter, setNameFilter] = React.useState<string>('');
  const [statusFilters, setStatusFilters] = React.useState<string[]>([]);
  const [ownerFilter, setOwnerFilter] = React.useState<string>('');

  // Filter data based on filter type and value
  const filteredData = React.useMemo(() => {
    return apiKeys.filter((key) => {
      // Name filter
      if (nameFilter && !key.metadata.name.toLowerCase().includes(nameFilter.toLowerCase())) {
        return false;
      }

      // Status filter (multiple selection)
      if (statusFilters.length > 0) {
        const phase = key.status?.phase || 'Unknown';
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

  const onDeleteNameFilter = (_category: string, _label: string) => {
    setNameFilter('');
  };

  const onDeleteStatusFilter = (_category: string, label: string) => {
    setStatusFilters((prev) => prev.filter((s) => s !== label));
  };

  const onDeleteOwnerFilter = (_category: string, _label: string) => {
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
    );

    return cols;
  }, [t, activeNamespace]);

  const APIKeyRow: React.FC<RowProps<APIKey>> = ({ obj, activeColumnIDs }) => {
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
          {obj.spec?.apiProductRef?.name || '-'}
        </TableData>
        <TableData id="status" activeColumnIDs={activeColumnIDs}>
          {obj.status?.phase || 'Unknown'}
        </TableData>
        <TableData id="tier" activeColumnIDs={activeColumnIDs}>
          {obj.spec?.planTier || '-'}
        </TableData>
        <TableData id="apiKey" activeColumnIDs={activeColumnIDs}>
          {obj.status?.phase === 'Approved' && obj.status?.secretRef?.name ? (
            <APIKeyReveal apiKeyObj={obj} />
          ) : (
            '-'
          )}
        </TableData>
        <TableData id="requestedTime" activeColumnIDs={activeColumnIDs}>
          <Timestamp timestamp={obj.metadata.creationTimestamp} />
        </TableData>
      </>
    );
  };

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h1">{t('My API Keys')}</Title>
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
                      value="Rejected"
                      isSelected={statusFilters.includes('Rejected')}
                    >
                      {t('Rejected')}
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
              data={filteredData}
              unfilteredData={apiKeys}
              loaded={loaded}
              loadError={apiKeysLoadError}
              columns={columns}
              Row={APIKeyRow}
            />
          )}
        </ListPageBody>
      </PageSection>
    </>
  );
};

export default MyAPIKeysPage;
