import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { sortable } from '@patternfly/react-table';
import {
  PageSection,
  Title,
  EmptyState,
  EmptyStateBody,
  AlertGroup,
  Alert,
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
} from '@openshift-console/dynamic-plugin-sdk';
import { SearchIcon } from '@patternfly/react-icons';
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

const MyAPIKeysPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();

  const [apiKeys, loaded, apiKeysLoadError] = useK8sWatchResource<APIKey[]>({
    groupVersionKind: RESOURCES.APIKey.gvk,
    namespace: activeNamespace === '#ALL_NS#' ? undefined : activeNamespace,
    isList: true,
  });

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
    const { apiVersion, kind } = obj;
    const [group, version] = apiVersion.includes('/') ? apiVersion.split('/') : ['', apiVersion];

    return (
      <>
        <TableData id="name" activeColumnIDs={activeColumnIDs}>
          <ResourceLink
            groupVersionKind={{ group, version, kind }}
            name={obj.metadata.name}
            namespace={obj.metadata.namespace}
          />
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
          {''}
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
          {loaded && apiKeys.length === 0 ? (
            <EmptyState
              titleText={
                <Title headingLevel="h4" size="lg">
                  {t('No API Keys found')}
                </Title>
              }
              icon={SearchIcon}
            >
              <EmptyStateBody>
                {t(
                  'There are no API Keys to display - request access to an API Product to get started.',
                )}
              </EmptyStateBody>
            </EmptyState>
          ) : (
            <VirtualizedTable<APIKey>
              data={apiKeys}
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
