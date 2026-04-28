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
  Button,
  Modal,
  ModalVariant,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Checkbox,
  ClipboardCopy,
} from '@patternfly/react-core';
import {
  useActiveNamespace,
  useK8sWatchResource,
  VirtualizedTable,
  K8sResourceCommon,
  TableColumn,
  RowProps,
  TableData,
  Timestamp,
  ListPageBody,
  ResourceLink,
  k8sGet,
  useK8sModel,
  k8sPatch,
} from '@openshift-console/dynamic-plugin-sdk';
import {
  SearchIcon,
  EyeIcon,
  ExclamationTriangleIcon,
  EyeSlashIcon,
} from '@patternfly/react-icons';
import { RESOURCES } from '../../utils/resources';
import '../kuadrant.css';

interface APIKey extends K8sResourceCommon {
  spec?: {
    apiProductRef?: {
      name: string;
    };
    planTier?: string;
    requestedBy?: {
      userId: string;
    };
    useCase?: string;
  };
  status?: {
    phase?: 'Pending' | 'Approved' | 'Rejected';
    secretRef?: {
      name: string;
    };
  };
}

interface Secret extends K8sResourceCommon {
  data?: {
    [key: string]: string;
  };
}

const APIKeyReveal: React.FC<{ apiKeyObj: APIKey }> = ({ apiKeyObj }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [isWarningModalOpen, setIsWarningModalOpen] = React.useState(false);
  const [isRevealModalOpen, setIsRevealModalOpen] = React.useState(false);
  const [apiKey, setApiKey] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>('');
  const [confirmed, setConfirmed] = React.useState(false);
  const [alreadyViewed, setAlreadyViewed] = React.useState(false);

  const secretName = apiKeyObj.status?.secretRef?.name || '';
  const namespace = apiKeyObj.metadata.namespace || '';

  // Get the Secret model from the cluster
  const [secretModel] = useK8sModel({ version: 'v1', kind: 'Secret' });

  // Check if secret has been viewed on mount
  React.useEffect(() => {
    const checkViewed = async () => {
      if (!secretModel || !secretName || !namespace) return;

      try {
        const secret = await k8sGet<Secret>({
          model: secretModel,
          name: secretName,
          ns: namespace,
        });

        const viewed =
          secret.metadata?.annotations?.['devportal.kuadrant.io/apikey-viewed'] === 'true';
        setAlreadyViewed(viewed);
      } catch (err) {
        console.error('Error checking secret viewed status:', err);
      }
    };

    checkViewed();
  }, [secretModel, secretName, namespace]);

  const fetchSecret = React.useCallback(async () => {
    if (!secretModel) {
      setError(t('Secret model not available'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const secret = await k8sGet<Secret>({
        model: secretModel,
        name: secretName,
        ns: namespace,
      });

      // The API key is typically stored in the 'api_key' or 'key' field
      const encodedKey = secret.data?.api_key || secret.data?.key || '';
      if (encodedKey) {
        // Decode from base64
        const decodedKey = atob(encodedKey);
        setApiKey(decodedKey);

        // Update the Secret annotation to mark it as viewed
        try {
          await k8sPatch({
            model: secretModel,
            resource: secret,
            data: [
              {
                op: 'add',
                path: '/metadata/annotations/devportal.kuadrant.io~1apikey-viewed',
                value: 'true',
              },
            ],
          });
          setAlreadyViewed(true);
        } catch (patchErr) {
          console.error('Failed to update apikey-viewed annotation:', patchErr);
          // Continue showing the key even if annotation update fails
        }

        setIsWarningModalOpen(false);
        setIsRevealModalOpen(true);
      } else {
        setError(t('API key not found in secret'));
      }
    } catch (err) {
      setError(t('Failed to fetch API key'));
      console.error('Error fetching secret:', err);
    } finally {
      setLoading(false);
    }
  }, [secretModel, secretName, namespace, t]);

  const handleRevealClick = () => {
    setIsWarningModalOpen(true);
  };

  const handleWarningConfirm = () => {
    fetchSecret();
  };

  const handleWarningCancel = () => {
    setIsWarningModalOpen(false);
  };

  const handleRevealModalClose = () => {
    if (confirmed) {
      setIsRevealModalOpen(false);
      setConfirmed(false);
    }
  };

  const renderTrigger = () => {
    if (error) {
      return <span style={{ color: 'var(--pf-v6-global--danger-color--100)' }}>{error}</span>;
    }

    if (alreadyViewed && !isRevealModalOpen) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--pf-v6-global--disabled-color--100)',
          }}
        >
          <EyeSlashIcon />
          <span>{t('Already viewed')}</span>
        </div>
      );
    }

    return (
      <div
        onClick={handleRevealClick}
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
            handleRevealClick();
          }
        }}
        aria-label={t('Reveal API key')}
      >
        <span style={{ fontFamily: 'monospace' }}>••••••••••••••••</span>
        <EyeIcon style={{ color: 'var(--pf-v6-global--primary-color--100)' }} />
      </div>
    );
  };

  return (
    <>
      {renderTrigger()}

      {/* Warning Modal */}
      <Modal isOpen={isWarningModalOpen} onClose={handleWarningCancel} variant={ModalVariant.small}>
        <ModalHeader
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ExclamationTriangleIcon color="#F0AB00" />
              <span>{t('Reveal API Key')}</span>
            </div>
          }
        />
        <ModalBody>
          {t(
            'The API Key can only be viewed once. After you reveal it, you will not be able to retrieve it again.',
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            key="reveal"
            variant="primary"
            onClick={handleWarningConfirm}
            isLoading={loading}
            isDisabled={loading}
          >
            {t('Reveal')}
          </Button>
          <Button key="cancel" variant="link" onClick={handleWarningCancel} isDisabled={loading}>
            {t('Cancel')}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Reveal Modal */}
      <Modal
        isOpen={isRevealModalOpen}
        onClose={handleRevealModalClose}
        variant={ModalVariant.small}
        disableFocusTrap={false}
      >
        <ModalHeader
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ExclamationTriangleIcon color="#F0AB00" />
              <span>{t('Reveal API Key')}</span>
            </div>
          }
        />
        <ModalBody>
          <div style={{ marginBottom: '16px' }}>
            {t('Make sure to copy and store it securely before closing this view.')}
          </div>
          <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>{t('API key')}</div>
          <ClipboardCopy isReadOnly hoverTip={t('Copy')} clickTip={t('Copied')}>
            {apiKey}
          </ClipboardCopy>
          <div style={{ marginTop: '16px' }}>
            <Checkbox
              id="confirm-copied"
              label={t("I've copied the key and I'm aware that it's only shown once.")}
              isChecked={confirmed}
              onChange={(_event, checked) => setConfirmed(checked)}
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            key="close"
            variant="primary"
            onClick={handleRevealModalClose}
            isDisabled={!confirmed}
          >
            {t('Close')}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

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
