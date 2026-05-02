import * as React from 'react';
import Helmet from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { EmptyState, EmptyStateBody, PageSection, Title } from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import { useLocation } from 'react-router-dom-v5-compat';
import '../kuadrant.css';
import {
  K8sResourceKind,
  ResourceLink,
  useActiveNamespace,
  useK8sWatchResources,
  VirtualizedTable,
  TableData,
  RowProps,
  TableColumn,
} from '@openshift-console/dynamic-plugin-sdk';

import extractResourceNameFromURL from '../../utils/nameFromPath';
import { RESOURCES } from '../../utils/resources';
import BackendActionsMenu from './BackendActionsMenu';

interface BackendRef {
  group?: string;
  kind?: string;
  name: string;
  namespace?: string;
  port?: number;
}

interface ParentRef {
  group?: string;
  kind?: string;
  name: string;
  namespace?: string;
}

interface HTTPRouteRule {
  backendRefs?: BackendRef[];
}

interface HTTPRouteSpec {
  parentRefs?: ParentRef[];
  rules?: HTTPRouteRule[];
}

interface HTTPRoute extends K8sResourceKind {
  spec?: HTTPRouteSpec;
}

export interface BackendRow {
  name: string;
  namespace: string;
  port: number | undefined;
  kind: string;
  group: string;
  httpRoutes: Array<{ name: string; namespace: string }>;
}

type GatewayBackendsTableRowProps = RowProps<BackendRow> & {
  columns: TableColumn<BackendRow>[];
};

const GatewayBackendsTableRow: React.FC<GatewayBackendsTableRowProps> = ({
  obj,
  activeColumnIDs,
  columns,
}) => (
  <>
    {columns.map((column) => {
      switch (column.id) {
        case 'name':
          return (
            <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
              <ResourceLink
                groupVersionKind={{
                  group: obj.group || '',
                  version: 'v1',
                  kind: obj.kind || 'Service',
                }}
                name={obj.name}
                namespace={obj.namespace}
              />
            </TableData>
          );
        case 'namespace':
          return (
            <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
              {obj.namespace}
            </TableData>
          );
        case 'port':
          return (
            <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
              {obj.port ?? '-'}
            </TableData>
          );
        case 'httproutes':
          return (
            <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
              {obj.httpRoutes.map((route, idx) => (
                <React.Fragment key={`${route.namespace}/${route.name}`}>
                  {idx > 0 ? ', ' : null}
                  <ResourceLink
                    groupVersionKind={RESOURCES.HTTPRoute.gvk}
                    name={route.name}
                    namespace={route.namespace}
                  />
                </React.Fragment>
              ))}
            </TableData>
          );
        case 'actions':
          return (
            <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
              <BackendActionsMenu backend={obj} />
            </TableData>
          );
        default:
          return null;
      }
    })}
  </>
);

const GatewayBackendsPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();
  const location = useLocation();

  const gatewayName = extractResourceNameFromURL(location.pathname);

  const resources = {
    gateway: {
      groupVersionKind: RESOURCES.Gateway.gvk,
      namespace: activeNamespace,
      name: gatewayName,
      isList: false,
    },
    httpRoutes: {
      groupVersionKind: RESOURCES.HTTPRoute.gvk,
      namespace: activeNamespace,
      isList: true,
    },
  };

  const watchedResources = useK8sWatchResources<{
    gateway: K8sResourceKind;
    httpRoutes: HTTPRoute[];
  }>(resources);

  const gatewayWatch = watchedResources.gateway;
  const httpRoutesWatch = watchedResources.httpRoutes;

  const allLoaded = gatewayWatch.loaded && httpRoutesWatch.loaded;

  const loadErrors = [gatewayWatch.loadError, httpRoutesWatch.loadError].filter(Boolean);
  const loadError =
    loadErrors.length > 0
      ? new Error(loadErrors.map((err) => err.message).join('; '))
      : null;

  const backends = React.useMemo(() => {
    const raw = httpRoutesWatch.data;
    if (!gatewayName || !raw || !Array.isArray(raw)) {
      return [];
    }

    const filtered = raw.filter((route) =>
      route.spec?.parentRefs?.some(
        (ref) => ref.name === gatewayName && (!ref.kind || ref.kind === 'Gateway'),
      ),
    );

    const map = new Map<string, BackendRow>();

    for (const route of filtered) {
      const routeNs = route.metadata?.namespace ?? '';
      const routeLink = {
        name: route.metadata?.name ?? '',
        namespace: route.metadata?.namespace ?? '',
      };

      for (const rule of route.spec?.rules ?? []) {
        for (const ref of rule.backendRefs ?? []) {
          const group = ref.group ?? '';
          const kind = !ref.kind ? 'Service' : ref.kind;
          const namespace = ref.namespace ?? routeNs;
          const key = `${group}/${kind}/${namespace}/${ref.name}`;
          const existing = map.get(key);

          if (!existing) {
            map.set(key, {
              name: ref.name,
              namespace,
              port: ref.port,
              kind,
              group,
              httpRoutes: [routeLink],
            });
          } else {
            const dup = existing.httpRoutes.some(
              (r) => r.name === routeLink.name && r.namespace === routeLink.namespace,
            );
            if (!dup) {
              existing.httpRoutes.push(routeLink);
            }
          }
        }
      }
    }

    return Array.from(map.values());
  }, [httpRoutesWatch.data, gatewayName]);

  const columns: TableColumn<BackendRow>[] = React.useMemo(
    () => [
      { title: t('plugin__kuadrant-console-plugin~Name'), id: 'name', sort: 'name' },
      {
        title: t('plugin__kuadrant-console-plugin~Namespace'),
        id: 'namespace',
        sort: 'namespace',
      },
      { title: t('plugin__kuadrant-console-plugin~Port'), id: 'port' },
      { title: t('plugin__kuadrant-console-plugin~HTTPRoutes'), id: 'httproutes' },
      { title: '', id: 'actions' },
    ],
    [t],
  );

  const renderRow = React.useCallback(
    (props: RowProps<BackendRow>) => <GatewayBackendsTableRow {...props} columns={columns} />,
    [columns],
  );

  let body: React.ReactNode;
  if (!allLoaded) {
    body = <div>{t('Loading...')}</div>;
  } else if (loadError) {
    body = (
      <div>
        {t('Error loading Gateway')}: {loadError.message}
      </div>
    );
  } else if (backends.length === 0) {
    body = (
      <EmptyState
        titleText={
          <Title headingLevel="h4" size="lg">
            {t('No backends found for this gateway.')}
          </Title>
        }
        icon={SearchIcon}
      >
        <EmptyStateBody>{t('No backends found for this gateway.')}</EmptyStateBody>
      </EmptyState>
    );
  } else {
    body = (
      <VirtualizedTable<BackendRow>
        data={backends}
        unfilteredData={backends}
        loaded={allLoaded}
        loadError={loadError}
        columns={columns}
        Row={renderRow}
      />
    );
  }

  return (
    <>
      <Helmet>
        <title data-test="gateway-backends-page-title">{t('Gateway Backends')}</title>
      </Helmet>
      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h2">{t('Gateway Backends')}</Title>
        {body}
      </PageSection>
    </>
  );
};

export default GatewayBackendsPage;
