import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom-v5-compat';
import {
  PageSection,
  Title,
  Content,
  ContentVariants,
  EmptyState,
  EmptyStateBody,
  Alert,
  Spinner,
  Label,
} from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import {
  useK8sWatchResource,
  useActiveNamespace,
  useAccessReview,
  K8sResourceCommon,
  VirtualizedTable,
  TableData,
  RowProps,
  TableColumn,
} from '@openshift-console/dynamic-plugin-sdk';
import { APIProduct } from './types';
import { HTTPRouteMatch, HTTPMethod } from '../ratelimitpolicy/types';
import { RESOURCES } from '../../utils/resources';
import extractResourceNameFromURL from '../../utils/nameFromPath';
import { getResourceNameFromKind } from '../../utils/getModelFromResource';
import NoPermissionsView from '../NoPermissionsView';
import '../kuadrant.css';

// Minimal shape of the targeted HTTPRoute - we only read the routing rules to
// derive the accepted (method, path) pairs the API Product exposes.
interface RoutedHTTPRoute extends K8sResourceCommon {
  spec?: {
    rules?: {
      matches?: HTTPRouteMatch[];
    }[];
  };
}

// A single accepted path row: one method/path-match pair flattened from the
// HTTPRoute rules. When a match omits the method, all methods are accepted.
interface AcceptedPath {
  id: string;
  method: HTTPMethod | 'ALL';
  pathType: string;
  pathValue: string;
}

// Gateway API defaults: a rule with no matches accepts every path ("/" prefix),
// and a match with no method accepts every method.
const DEFAULT_PATH_TYPE = 'PathPrefix';
const DEFAULT_PATH_VALUE = '/';

const APIProductAcceptedPathsTab: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();
  const location = useLocation();
  const productName = extractResourceNameFromURL(location.pathname);

  const [canGet, canGetLoading] = useAccessReview({
    group: RESOURCES.APIProduct.gvk.group,
    resource: getResourceNameFromKind(RESOURCES.APIProduct.gvk.kind),
    verb: 'get',
    namespace: activeNamespace,
    name: productName,
  });

  // Fetch the APIProduct
  const [apiProduct, productLoaded, productLoadError] = useK8sWatchResource<APIProduct>(
    canGet && !canGetLoading
      ? {
          groupVersionKind: RESOURCES.APIProduct.gvk,
          namespace: activeNamespace,
          name: productName,
          isList: false,
        }
      : null,
  );

  // Extract target HTTPRoute reference, caching it so a transient watch
  // reconnection (where spec is briefly absent) doesn't drop the linked route.
  const targetRef = apiProduct?.spec?.targetRef;
  const [cachedTargetRef, setCachedTargetRef] = React.useState<typeof targetRef>(undefined);
  React.useEffect(() => {
    if (targetRef) {
      setCachedTargetRef(targetRef);
    }
  }, [targetRef]);
  const targetRefToUse = targetRef || cachedTargetRef;

  const httprouteNamespace = targetRefToUse?.namespace || activeNamespace;
  const httprouteName = targetRefToUse?.name;

  // Fetch the target HTTPRoute
  const [httpRoute, httprouteLoaded, httprouteLoadError] = useK8sWatchResource<RoutedHTTPRoute>(
    targetRefToUse && targetRefToUse.kind === 'HTTPRoute'
      ? {
          groupVersionKind: RESOURCES.HTTPRoute.gvk,
          namespace: httprouteNamespace,
          name: httprouteName,
          isList: false,
        }
      : null,
  );

  // Flatten the HTTPRoute rules into one row per accepted (method, path) pair.
  const acceptedPaths = React.useMemo<AcceptedPath[]>(() => {
    const rules = httpRoute?.spec?.rules;
    if (!rules) return [];

    const paths: AcceptedPath[] = [];
    rules.forEach((rule, ruleIndex) => {
      // A rule with no matches accepts all paths/methods.
      const matches: HTTPRouteMatch[] = rule.matches?.length ? rule.matches : [{}];
      matches.forEach((match, matchIndex) => {
        paths.push({
          id: `${ruleIndex}-${matchIndex}`,
          method: match.method || 'ALL',
          pathType: match.path?.type || DEFAULT_PATH_TYPE,
          pathValue: match.path?.value || DEFAULT_PATH_VALUE,
        });
      });
    });
    return paths;
  }, [httpRoute]);

  const methodColor = (method: AcceptedPath['method']) => {
    switch (method) {
      case 'GET':
      case 'HEAD':
        return 'blue';
      case 'POST':
      case 'PUT':
      case 'PATCH':
        return 'green';
      case 'DELETE':
        return 'red';
      default:
        return 'grey';
    }
  };

  const columns: TableColumn<AcceptedPath>[] = [
    {
      title: t('Method'),
      id: 'method',
    },
    {
      title: t('Path'),
      id: 'path',
    },
    {
      title: t('Match type'),
      id: 'pathType',
    },
  ];

  const AcceptedPathRow: React.FC<RowProps<AcceptedPath>> = ({ obj, activeColumnIDs }) => (
    <>
      <TableData id="method" activeColumnIDs={activeColumnIDs}>
        <Label isCompact color={methodColor(obj.method)}>
          {obj.method === 'ALL' ? t('All methods') : obj.method}
        </Label>
      </TableData>
      <TableData id="path" activeColumnIDs={activeColumnIDs}>
        {obj.pathValue}
      </TableData>
      <TableData id="pathType" activeColumnIDs={activeColumnIDs}>
        {obj.pathType}
      </TableData>
    </>
  );

  if (canGetLoading) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Spinner size="lg" />
      </PageSection>
    );
  }

  if (!canGet) {
    return (
      <NoPermissionsView primaryMessage={t('You do not have permission to view API Products')} />
    );
  }

  if (productLoadError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Alert variant="danger" isInline title={t('Error loading API Product')}>
          {productLoadError.message}
        </Alert>
      </PageSection>
    );
  }

  if (!productLoaded || !apiProduct) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Content component={ContentVariants.p}>{t('Loading...')}</Content>
      </PageSection>
    );
  }

  // Only show this empty state if we've never had a targetRef (initial load).
  if (!targetRefToUse || targetRefToUse.kind !== 'HTTPRoute') {
    return (
      <PageSection hasBodyWrapper={false}>
        <EmptyState
          titleText={
            <Title headingLevel="h4" size="lg">
              {t('No target HTTPRoute configured')}
            </Title>
          }
          icon={SearchIcon}
        >
          <EmptyStateBody>
            {t('This API Product does not have a target HTTPRoute configured.')}
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  if (httprouteLoadError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Alert variant="danger" isInline title={t('Error loading HTTPRoute')}>
          {httprouteLoadError.message}
        </Alert>
      </PageSection>
    );
  }

  if (!httprouteLoaded || !httpRoute) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Content component={ContentVariants.p}>{t('Loading HTTPRoute...')}</Content>
      </PageSection>
    );
  }

  return (
    <PageSection hasBodyWrapper={false}>
      {acceptedPaths.length === 0 ? (
        <EmptyState
          titleText={
            <Title headingLevel="h4" size="lg">
              {t('No accepted paths found')}
            </Title>
          }
          icon={SearchIcon}
        >
          <EmptyStateBody>
            {t('The target HTTPRoute does not define any routing rules.')}
          </EmptyStateBody>
        </EmptyState>
      ) : (
        <VirtualizedTable<AcceptedPath>
          data={acceptedPaths}
          unfilteredData={acceptedPaths}
          loaded={httprouteLoaded}
          loadError={null}
          columns={columns}
          Row={AcceptedPathRow}
        />
      )}
    </PageSection>
  );
};

export default APIProductAcceptedPathsTab;
