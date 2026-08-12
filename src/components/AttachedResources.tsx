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
  Pagination,
  Title,
} from '@patternfly/react-core';
import {
  K8sResourceKind,
  ResourceLink,
  useK8sWatchResources,
  WatchK8sResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { SearchIcon } from '@patternfly/react-icons';
import { getStatusLabel } from '../utils/statusLabel';
import { RESOURCES } from '../utils/resources';
import AssociatedResourceList from './AssociatedResourceList';
import KuadrantDataView, {
  KuadrantDataViewColumn,
  useKuadrantDataViewPagination,
} from './KuadrantDataView';

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

  const columns = React.useMemo<KuadrantDataViewColumn<K8sResourceKind>[]>(
    () => [
      { title: t('Name'), id: 'name', sort: 'metadata.name' },
      { title: t('Namespace'), id: 'namespace', sort: 'metadata.namespace' },
      { title: t('Status'), id: 'status' },
    ],
    [t],
  );

  const getRow = React.useCallback(
    (obj: K8sResourceKind) => {
      const [group, version] = obj.apiVersion?.includes('/')
        ? obj.apiVersion.split('/')
        : ['', obj.apiVersion];
      return [
        {
          cell: (
            <ResourceLink
              groupVersionKind={{ group, version, kind: obj.kind }}
              name={obj.metadata?.name}
              namespace={obj.metadata?.namespace}
            />
          ),
        },
        obj.metadata?.namespace || '-',
        getStatusLabel(t, obj),
      ];
    },
    [t],
  );

  const allLoaded = Object.values(watchedResources).every((res) => res.loaded);
  const loadErrors = Object.values(watchedResources)
    .filter((res) => res.loadError)
    .map((res) => res.loadError);
  const combinedLoadError =
    loadErrors.length > 0 ? new Error(loadErrors.map((err) => err.message).join('; ')) : null;
  const { page, perPage, onSetPage, onPerPageSelect } = useKuadrantDataViewPagination(
    attachedResources.length,
  );

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
                <>
                  <KuadrantDataView<K8sResourceKind>
                    ariaLabel={t('Attached Resources')}
                    data={attachedResources}
                    loaded={allLoaded}
                    loadError={combinedLoadError}
                    columns={columns}
                    getRow={getRow}
                    page={page}
                    perPage={perPage}
                    ouiaId="AttachedResourcesDataView"
                  />
                  <Pagination
                    itemCount={attachedResources.length}
                    page={page}
                    perPage={perPage}
                    onSetPage={onSetPage}
                    onPerPageSelect={onPerPageSelect}
                    variant="bottom"
                    perPageOptions={[
                      { title: '5', value: 5 },
                      { title: '10', value: 10 },
                      { title: '20', value: 20 },
                    ]}
                  />
                </>
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
