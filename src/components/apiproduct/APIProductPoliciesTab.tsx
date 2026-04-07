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
} from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import {
  useK8sWatchResource,
  useK8sWatchResources,
  useActiveNamespace,
  ResourceLink,
  K8sResourceCommon,
  VirtualizedTable,
  TableData,
  RowProps,
  TableColumn,
  WatchK8sResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { APIProduct } from './types';
import { RESOURCES } from '../../utils/resources';
import { getStatusLabel } from '../../utils/statusLabel';
import extractResourceNameFromURL from '../../utils/nameFromPath';
import '../kuadrant.css';

type PolicyKind = 'PlanPolicy' | 'AuthPolicy' | 'RateLimitPolicy' | 'OIDCPolicy';

const policyKinds: PolicyKind[] = ['PlanPolicy', 'AuthPolicy', 'RateLimitPolicy', 'OIDCPolicy'];

interface PolicyResource extends K8sResourceCommon {
  spec?: {
    targetRef?: {
      group?: string;
      kind?: string;
      name?: string;
      namespace?: string;
    };
  };
}

const APIProductPoliciesTab: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();
  const location = useLocation();
  const productName = extractResourceNameFromURL(location.pathname);

  // Fetch the APIProduct
  const [apiProduct, productLoaded, productLoadError] = useK8sWatchResource<APIProduct>({
    groupVersionKind: RESOURCES.APIProduct.gvk,
    namespace: activeNamespace,
    name: productName,
    isList: false,
  });

  // Extract target HTTPRoute reference
  const targetRef = apiProduct?.spec?.targetRef;

  // Cache the targetRef to handle watch reconnections where spec might temporarily be missing
  const [cachedTargetRef, setCachedTargetRef] = React.useState<
    | {
        group?: string;
        kind?: string;
        name?: string;
        namespace?: string;
      }
    | undefined
  >(undefined);

  React.useEffect(() => {
    if (targetRef) {
      setCachedTargetRef(targetRef);
    }
  }, [targetRef]);

  const targetRefToUse = targetRef || cachedTargetRef;

  const httprouteNamespace = targetRefToUse?.namespace || activeNamespace;
  const httprouteName = targetRefToUse?.name;

  // Fetch the target HTTPRoute
  const [httpRoute, httprouteLoaded, httprouteLoadError] = useK8sWatchResource<K8sResourceCommon>(
    targetRefToUse && targetRefToUse.kind === 'HTTPRoute'
      ? {
          groupVersionKind: RESOURCES.HTTPRoute.gvk,
          namespace: httprouteNamespace,
          name: httprouteName,
          isList: false,
        }
      : null,
  );

  // Fetch all policy types
  const policyResources: { [key: string]: WatchK8sResource } = React.useMemo(() => {
    if (!httpRoute) return {};

    return Object.fromEntries(
      policyKinds.map((kind) => [
        kind,
        {
          groupVersionKind: RESOURCES[kind].gvk,
          isList: true,
          namespace: httprouteNamespace,
        },
      ]),
    );
  }, [httpRoute, httprouteNamespace]);

  const watchedPolicies = useK8sWatchResources<{ [key: string]: PolicyResource[] }>(
    policyResources,
  );

  // Filter policies that target the HTTPRoute
  const discoveredPolicies = React.useMemo(() => {
    if (!httpRoute) return [];

    const policies: PolicyResource[] = [];

    Object.entries(watchedPolicies).forEach(([, res]) => {
      if (res.loaded && !res.loadError && res.data) {
        const matchingItems = (res.data as PolicyResource[]).filter((item) => {
          const policyTargetRef = item.spec?.targetRef;
          if (!policyTargetRef) return false;
          return (
            policyTargetRef.kind === 'HTTPRoute' &&
            policyTargetRef.name === httprouteName &&
            (policyTargetRef.namespace ?? item.metadata.namespace) === httprouteNamespace
          );
        });
        policies.push(...matchingItems);
      }
    });

    return policies;
  }, [watchedPolicies, httpRoute, httprouteName, httprouteNamespace]);

  const allPoliciesLoaded = Object.values(watchedPolicies).every((res) => res.loaded);

  // Aggregate watch errors
  const policyWatchErrors = React.useMemo(() => {
    const errors: { kind: string; error: Error }[] = [];
    Object.entries(watchedPolicies).forEach(([kind, res]) => {
      if (res.loadError) {
        errors.push({ kind, error: res.loadError });
      }
    });
    return errors;
  }, [watchedPolicies]);

  // Table columns
  const columns: TableColumn<PolicyResource>[] = [
    {
      title: t('Name'),
      id: 'name',
      sort: 'metadata.name',
    },
    {
      title: t('Type'),
      id: 'type',
      sort: 'kind',
    },
    {
      title: t('Status'),
      id: 'status',
    },
  ];

  // Table row component
  const PolicyRow: React.FC<RowProps<PolicyResource>> = ({ obj, activeColumnIDs }) => {
    const [group, version] = obj.apiVersion.includes('/')
      ? obj.apiVersion.split('/')
      : ['', obj.apiVersion];

    return (
      <>
        <TableData id="name" activeColumnIDs={activeColumnIDs}>
          <ResourceLink
            groupVersionKind={{ group, version, kind: obj.kind }}
            name={obj.metadata.name}
            namespace={obj.metadata.namespace}
          />
        </TableData>
        <TableData id="type" activeColumnIDs={activeColumnIDs}>
          {obj.kind}
        </TableData>
        <TableData id="status" activeColumnIDs={activeColumnIDs}>
          {getStatusLabel(obj)}
        </TableData>
      </>
    );
  };

  // Error states
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

  // Only show empty state if we've never had a targetRef (initial load with no data)
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

  // Main render
  return (
    <PageSection hasBodyWrapper={false} className="apiproduct-policies-page">
      {policyWatchErrors.length > 0 && (
        <>
          {policyWatchErrors.map(({ kind, error }) => (
            <Alert
              key={kind}
              variant="warning"
              isInline
              title={t('Error loading {{kind}}', { kind })}
              style={{ marginBottom: 'var(--pf-v6-global--spacer--md)' }}
            >
              {error.message}
            </Alert>
          ))}
        </>
      )}
      {discoveredPolicies.length === 0 && allPoliciesLoaded ? (
        <EmptyState
          titleText={
            <Title headingLevel="h4" size="lg">
              {t('No policies found')}
            </Title>
          }
          icon={SearchIcon}
        >
          <EmptyStateBody>
            {policyWatchErrors.length > 0
              ? t('Some policy types could not be loaded. Check the errors above for details.')
              : t('No policies are attached to the target HTTPRoute.')}
          </EmptyStateBody>
        </EmptyState>
      ) : (
        <VirtualizedTable<PolicyResource>
          data={discoveredPolicies}
          unfilteredData={discoveredPolicies}
          loaded={allPoliciesLoaded}
          loadError={null}
          columns={columns}
          Row={PolicyRow}
        />
      )}
    </PageSection>
  );
};

export default APIProductPoliciesTab;
