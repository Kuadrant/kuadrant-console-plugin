import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AlertGroup,
  Card,
  CardBody,
  CardTitle,
  EmptyState,
  EmptyStateBody,
  Grid,
  GridItem,
  PageSection,
  Title,
} from '@patternfly/react-core';
import {
  K8sResourceKind,
  ResourceLink,
  useK8sWatchResources,
  VirtualizedTable,
  TableData,
  RowProps,
  TableColumn,
  WatchK8sResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { SearchIcon } from '@patternfly/react-icons';
import { getStatusLabel } from '../utils/statusLabel';
import { RESOURCES } from '../utils/resources';
import AssociatedResourceList from './AssociatedResourceList';

type AttachedResourcesProps = {
  resource: K8sResourceKind;
};

type ParentRef = {
  name: string;
  namespace?: string;
  group?: string;
  kind?: string;
};

type ParentStatus = {
  parentRef: ParentRef;
};

const AttachedResources: React.FC<AttachedResourcesProps> = ({ resource }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  const associatedResources: { [key: string]: WatchK8sResource } = {};
  if (resource.kind === 'Gateway') {
    associatedResources.HTTPRoute = {
      groupVersionKind: RESOURCES.HTTPRoute.gvk,
      isList: true,
    };
  }
  if (resource.kind === 'HTTPRoute' || resource.kind === 'GRPCRoute') {
    associatedResources.Gateway = {
      groupVersionKind: RESOURCES.Gateway.gvk,
      isList: true,
    };
  }

  const watchedResources = useK8sWatchResources<{ [key: string]: K8sResourceKind[] }>(
    associatedResources,
  );

  const resourceGroup = resource.apiVersion?.includes('/') ? resource.apiVersion.split('/')[0] : '';

  const checkParentRef = (parentRef: ParentRef, targetResource: K8sResourceKind) => {
    if (!parentRef) return false;

    const refNamespace = parentRef.namespace ?? targetResource.metadata?.namespace;
    const refGroup = parentRef.group ?? 'gateway.networking.k8s.io';
    const refKind = parentRef.kind ?? 'Gateway';

    return (
      parentRef.name === targetResource.metadata?.name &&
      refNamespace === targetResource.metadata?.namespace &&
      refGroup === resourceGroup &&
      refKind === targetResource.kind
    );
  };

  const attachedResources = React.useMemo(() => {
    let results: K8sResourceKind[] = [];
    if (resource.kind === 'Gateway') {
      const httpRoutes = watchedResources.HTTPRoute;
      if (httpRoutes?.loaded && !httpRoutes.loadError && httpRoutes.data) {
        const matchingRoutes = httpRoutes.data.filter((route) => {
          const statusParents = route.status?.parents ?? [];
          return statusParents.some((parent: ParentStatus) =>
            checkParentRef(parent.parentRef, resource),
          );
        });
        results = results.concat(matchingRoutes);
      }
    }

    if (resource.kind === 'HTTPRoute' || resource.kind === 'GRPCRoute') {
      const gateways = watchedResources.Gateway;
      if (gateways?.loaded && !gateways.loadError && gateways.data) {
        const matchingGateways = gateways.data.filter((gateway) => {
          const statusParents = resource.status?.parents ?? [];
          return statusParents.some((parent: ParentStatus) =>
            checkParentRef(parent.parentRef, gateway),
          );
        });
        results = results.concat(matchingGateways);
      }
    }

    return results;
  }, [watchedResources, resource, resourceGroup]);

  const columns: TableColumn<K8sResourceKind>[] = [
    { title: t('Name'), id: 'name', sort: 'metadata.name' },
    { title: t('Namespace'), id: 'namespace', sort: 'metadata.namespace' },
    { title: t('Status'), id: 'status' },
  ];

  const ResourceRow: React.FC<RowProps<K8sResourceKind>> = ({ obj, activeColumnIDs }) => {
    const [group, version] = obj.apiVersion?.includes('/')
      ? obj.apiVersion.split('/')
      : ['', obj.apiVersion];

    return (
      <>
        <TableData id="name" activeColumnIDs={activeColumnIDs}>
          <ResourceLink
            groupVersionKind={{ group, version, kind: obj.kind }}
            name={obj.metadata?.name}
            namespace={obj.metadata?.namespace}
          />
        </TableData>
        <TableData id="namespace" activeColumnIDs={activeColumnIDs}>
          {obj.metadata?.namespace || '-'}
        </TableData>
        <TableData id="status" activeColumnIDs={activeColumnIDs}>
          {getStatusLabel(t, obj)}
        </TableData>
      </>
    );
  };

  const allLoaded = Object.values(watchedResources).every((res) => res.loaded);
  const loadErrors = Object.values(watchedResources)
    .filter((res) => res.loadError)
    .map((res) => res.loadError);
  const combinedLoadError =
    loadErrors.length > 0 ? new Error(loadErrors.map((err) => err.message).join('; ')) : null;

  return (
    <PageSection hasBodyWrapper={false}>
      <Grid hasGutter>
        <GridItem span={6}>
          <Card>
            <CardTitle>{t('Attached Resources')}</CardTitle>
            <CardBody>
              {combinedLoadError && (
                <AlertGroup>
                  <Alert title={t('Error loading attached resources')} variant="danger" isInline>
                    {combinedLoadError.message}
                  </Alert>
                </AlertGroup>
              )}
              {attachedResources.length === 0 && allLoaded ? (
                <EmptyState
                  titleText={
                    <Title headingLevel="h4" size="lg">
                      {t('No attached resources found')}
                    </Title>
                  }
                  icon={SearchIcon}
                >
                  <EmptyStateBody>
                    {t('This resource has no related items configured')}
                  </EmptyStateBody>
                </EmptyState>
              ) : (
                <VirtualizedTable<K8sResourceKind>
                  data={attachedResources}
                  unfilteredData={attachedResources}
                  loaded={allLoaded}
                  loadError={combinedLoadError}
                  columns={columns}
                  Row={ResourceRow}
                />
              )}
            </CardBody>
          </Card>
        </GridItem>
        <GridItem span={6}>
          <Card>
            <CardTitle>{t('Attached Policies')}</CardTitle>
            <CardBody>
              <AssociatedResourceList resource={resource} />
            </CardBody>
          </Card>
        </GridItem>
      </Grid>
    </PageSection>
  );
};

export default AttachedResources;
