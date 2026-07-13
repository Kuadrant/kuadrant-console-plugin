import * as React from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom-v5-compat';
import Helmet from 'react-helmet';
import { useTranslation } from 'react-i18next';
import {
  PageSection,
  Title,
  Card,
  CardTitle,
  CardBody,
  Flex,
  FlexItem,
  Content,
  ContentVariants,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  Button,
  Bullseye,
  EmptyState,
  EmptyStateBody,
  Label,
  Popover,
  Progress,
  ProgressMeasureLocation,
  Tooltip,
  Grid,
  GridItem,
  Alert,
} from '@patternfly/react-core';
import {
  ExternalLinkAltIcon,
  EllipsisVIcon,
  LockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  BuildIcon,
  UploadIcon,
  QuestionCircleIcon,
} from '@patternfly/react-icons';
import {
  usePrometheusPoll,
  PrometheusEndpoint,
  K8sResourceCommon,
  useK8sWatchResource,
  GreenCheckCircleIcon,
  YellowExclamationTriangleIcon,
  TableData,
  NamespaceBar,
  checkAccess,
} from '@openshift-console/dynamic-plugin-sdk';
import './kuadrant.css';
import ResourceList from './ResourceList';
import { sortable } from '@patternfly/react-table';
import { EXTERNAL_LINKS } from '../constants/links';
import { RESOURCES, resourceGVKMapping } from '../utils/resources';
import useAccessReviews from '../utils/resourceRBAC';
import { getResourceNameFromKind } from '../utils/getModelFromResource';
import { KuadrantStatusAlert } from './KuadrantStatusAlert';
import { useKuadrantNamespaceChange } from '../hooks/useKuadrantNamespaceChange';
import {
  buildTotalRequestsQuery,
  buildErrorRequestQuery,
  buildErrorsByCodeQuery,
  buildGatewayKey,
} from '../utils/metricsQueries';
import { fetchConfig, KuadrantConfig } from '../utils/configLoader';

export type MenuToggleElement = HTMLDivElement | HTMLButtonElement;

interface Resource {
  name: string;
  gvk: {
    group: string;
    version: string;
    kind: string;
  };
}
export const resources: Resource[] = [
  { name: 'AuthPolicies', gvk: resourceGVKMapping['AuthPolicy'] },
  { name: 'DNSPolicies', gvk: resourceGVKMapping['DNSPolicy'] },
  { name: 'RateLimitPolicies', gvk: resourceGVKMapping['RateLimitPolicy'] },
  { name: 'TokenRateLimitPolicies', gvk: resourceGVKMapping['TokenRateLimitPolicy'] },
  { name: 'OIDCPolicies', gvk: resourceGVKMapping['OIDCPolicy'] },
  { name: 'PlanPolicies', gvk: resourceGVKMapping['PlanPolicy'] },
  { name: 'TLSPolicies', gvk: resourceGVKMapping['TLSPolicy'] },
  { name: 'Gateways', gvk: resourceGVKMapping['Gateway'] },
  { name: 'HTTPRoutes', gvk: resourceGVKMapping['HTTPRoute'] },
  { name: 'GRPCRoutes', gvk: resourceGVKMapping['GRPCRoute'] },
];

interface TotalRequestsByGateway {
  [gatewayName: string]: {
    total?: number;
    errors?: number;
    codes?: {
      [responseCode: string]: number;
    };
  };
}
interface Gateway extends K8sResourceCommon {
  status?: {
    conditions?: {
      type: string;
      status: string;
    }[];
  };
}

// module scope: components defined inside a render function get a new identity
// on every re-render, remounting and flickering open popovers (#631)
export const StatusLegend: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  return (
    <Popover
      headerContent={t('Status')}
      bodyContent={
        <>
          <Content component={ContentVariants.p}>
            {t(
              'It indicates the current operational state of the Gateway and reflects whether its configuration is applied and functioning correctly.',
            )}
          </Content>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              columnGap: 8,
              rowGap: 8,
              alignItems: 'center',
              justifyItems: 'start',
            }}
          >
            <Label isCompact color="green" icon={<CheckCircleIcon />}>
              {' '}
              {t('Enforced')}{' '}
            </Label>
            <span style={{ fontSize: 12 }}>
              {t('Resource is accepted, configured, and all policies are enforced.')}
            </span>

            <Label isCompact color="purple" icon={<UploadIcon />}>
              {' '}
              {t('Accepted ')}{' '}
            </Label>
            <span style={{ fontSize: 12 }}>
              {t('Resource is accepted, but not all policies are enforced.')}
            </span>

            <Label isCompact color="blue" icon={<BuildIcon />}>
              {' '}
              {t('Programmed')}{' '}
            </Label>
            <span style={{ fontSize: 12 }}>
              {t('Resource is being configured but not yet enforced.')}
            </span>

            <Label isCompact color="red" icon={<ExclamationCircleIcon />}>
              {' '}
              {t('Conflicted')}{' '}
            </Label>
            <span style={{ fontSize: 12 }}>
              {t('Resource has conflicts, possibly due to policies or configuration issues.')}
            </span>

            <Label isCompact color="red" icon={<ExclamationCircleIcon />}>
              {' '}
              {t('Resolved')}{' '}
            </Label>
            <span style={{ fontSize: 12 }}>
              {t('All dependencies for the policy are successfully resolved.')}
            </span>
          </div>
        </>
      }
      triggerAction="hover"
      position="top"
    >
      <QuestionCircleIcon style={{ marginLeft: 6, cursor: 'help' }} aria-label="Status help" />
    </Popover>
  );
};

export interface Distribution {
  total: number;
  percent: number;
}

export const ErrorCodeLabel: React.FC<{
  codeGroup: string;
  distribution: Array<[string, Distribution]>;
}> = ({ codeGroup, distribution }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [isOpen, setIsOpen] = React.useState(false);
  let lastCode = '';
  return (
    <Popover
      className="kuadrant-custom-rounded-popover"
      headerContent={t('Error Code')}
      bodyContent={
        <>
          <Content component={ContentVariants.p}>
            {t('Displays the distribution of error codes for request failures.')}
          </Content>
          <div className="kuadrant-popover-codes">
            {distribution.map(([code, dist]) => {
              lastCode = code;
              return (
                <div key={code} style={{ marginBottom: '8px' }}>
                  <Progress
                    value={dist.percent}
                    title={
                      <Flex
                        justifyContent={{ default: 'justifyContentSpaceBetween' }}
                        alignItems={{ default: 'alignItemsCenter' }}
                      >
                        <FlexItem>
                          <strong>{t('Code: {{code}}', { code })}</strong>
                        </FlexItem>
                        <FlexItem align={{ default: 'alignRight' }}>
                          {dist.total.toFixed(0) === '1'
                            ? t('1 request')
                            : t('{{value}} requests', { value: dist.total.toFixed(0) })}
                        </FlexItem>
                      </Flex>
                    }
                    measureLocation={ProgressMeasureLocation.outside}
                  />
                  <Divider style={{ margin: '12px 0' }} />
                </div>
              );
            })}
          </div>
        </>
      }
      footerContent={
        <>
          <span>{t('Last 24h overview')}</span>
        </>
      }
      isVisible={isOpen}
      shouldClose={() => setIsOpen(false)}
      position="top"
    >
      <Label
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          marginRight: '0.5em',
          textDecoration: 'underline',
          textDecorationStyle: 'dotted',
        }}
      >
        &nbsp;{distribution.length === 1 ? lastCode : codeGroup}&nbsp;
      </Label>
    </Popover>
  );
};

const KuadrantOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const { ns } = useParams<{ ns: string }>();
  const { handleNamespaceChange, activeNamespace } = useKuadrantNamespaceChange('/overview');
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [isGettingStartedMenuOpen, setIsGettingStartedMenuOpen] = React.useState(false);
  const [hideCard, setHideCard] = React.useState(
    sessionStorage.getItem('hideGettingStarted') === 'true',
  );

  // Load metrics configuration
  const [config, setConfig] = React.useState<KuadrantConfig | null>(null);

  React.useEffect(() => {
    fetchConfig().then(setConfig).catch(console.error);
  }, []);

  const metricsWorkloadSuffix: string = config?.METRICS_WORKLOAD_SUFFIX || '-openshift-default';

  const onToggleClick = () => {
    setIsCreateOpen(!isCreateOpen);
  };

  // Determine namespace from URL path or activeNamespace
  const watchNamespace = ns || activeNamespace;

  // Smart default redirect: check cluster-wide permissions and redirect namespace-scoped users
  React.useEffect(() => {
    const performRedirect = async () => {
      if (location.pathname === '/kuadrant/overview/all-namespaces') {
        try {
          const result = await checkAccess({
            group: 'gateway.networking.k8s.io',
            resource: 'gateways',
            verb: 'list',
          });

          // If user doesn't have cluster-wide access, redirect to namespace-scoped view
          if (!result.status?.allowed) {
            const targetNamespace =
              activeNamespace && activeNamespace !== '#ALL_NS#' ? activeNamespace : 'default';
            navigate(`/kuadrant/overview/ns/${targetNamespace}`, { replace: true });
          }
          // Otherwise, stay on current path (cluster-wide view)
        } catch (error) {
          // On error, redirect to namespace-scoped view
          const targetNamespace =
            activeNamespace && activeNamespace !== '#ALL_NS#' ? activeNamespace : 'default';
          navigate(`/kuadrant/overview/ns/${targetNamespace}`, { replace: true });
        }
      }
    };

    performRedirect();
  }, [location.pathname, activeNamespace, navigate]);

  const resolvedNamespace = watchNamespace === '#ALL_NS#' ? undefined : watchNamespace;
  const rbacResources = resources.map((res) => ({
    group: res.gvk.group,
    kind: getResourceNameFromKind(res.gvk.kind),
    namespace: resolvedNamespace,
  }));
  const { userRBAC, loading } = useAccessReviews(rbacResources);

  const policies = [
    t('AuthPolicy'),
    t('RateLimitPolicy'),
    t('TokenRateLimitPolicy'),
    t('OIDCPolicy'),
    t('PlanPolicy'),
    t('DNSPolicy'),
    t('TLSPolicy'),
  ];

  const resourceRBAC = [
    'TLSPolicy',
    'DNSPolicy',
    'RateLimitPolicy',
    'TokenRateLimitPolicy',
    'OIDCPolicy',
    'PlanPolicy',
    'AuthPolicy',
    'Gateway',
    'HTTPRoute',
    'GRPCRoute',
  ].reduce(
    (acc, resource) => ({
      ...acc,
      [resource]: {
        list: userRBAC[`${getResourceNameFromKind(resource)}-list`],
        create: userRBAC[`${getResourceNameFromKind(resource)}-create`],
      },
    }),
    {} as Record<string, { list: boolean; create: boolean }>,
  );

  const policyRBACNill =
    !resourceRBAC['AuthPolicy']['list'] &&
    !resourceRBAC['RateLimitPolicy']['list'] &&
    !resourceRBAC['TokenRateLimitPolicy']['list'] &&
    !resourceRBAC['OIDCPolicy']['list'] &&
    !resourceRBAC['PlanPolicy']['list'] &&
    !resourceRBAC['DNSPolicy']['list'] &&
    !resourceRBAC['TLSPolicy']['list'];

  React.useEffect(() => {
    if (ns && ns !== activeNamespace) {
      handleNamespaceChange(ns);
    }
  }, [ns, handleNamespaceChange]);

  const handleHideCard = () => {
    setHideCard(true);
    sessionStorage.setItem('hideGettingStarted', 'true');
    setIsGettingStartedMenuOpen(false);
  };

  const columns = [
    {
      title: t('plugin__kuadrant-console-plugin~Name'),
      id: 'name',
      sort: 'metadata.name',
      transforms: [sortable],
    },
    {
      title: t('plugin__kuadrant-console-plugin~Namespace'),
      id: 'namespace',
      sort: 'metadata.namespace',
      transforms: [sortable],
    },
    {
      title: t('plugin__kuadrant-console-plugin~Status'),
      id: 'Status',
    },
    {
      title: '',
      id: 'kebab',
      props: { className: 'pf-v6-c-table__action' },
    },
  ];

  const getGatewayStatusRank = (gw: Gateway): number => {
    const conditions = gw.status?.conditions ?? [];
    const isAccepted = conditions.some((c) => c.type === 'Accepted' && c.status === 'True');
    const isProgrammed = conditions.some((c) => c.type === 'Programmed' && c.status === 'True');
    const isConflicted = conditions.some((c) => c.type === 'Conflicted' && c.status === 'True');
    const isResolvedRefs = conditions.some((c) => c.type === 'ResolvedRefs' && c.status === 'True');

    if (isAccepted && isProgrammed) return 5;
    if (isProgrammed) return 3;
    if (isConflicted) return 2;
    if (isResolvedRefs) return 1;
    return 0;
  };

  const sortGatewaysByStatus = (
    data: K8sResourceCommon[],
    sortDirection: 'asc' | 'desc',
  ): K8sResourceCommon[] => {
    const sorted = [...data].sort(
      (a, b) => getGatewayStatusRank(a as Gateway) - getGatewayStatusRank(b as Gateway),
    );
    return sortDirection === 'desc' ? sorted.reverse() : sorted;
  };

  const gatewayTrafficColumns = [
    {
      title: t('plugin__kuadrant-console-plugin~Name'),
      id: 'name',
      sort: 'metadata.name',
      transforms: [sortable],
    },
    {
      title: t('plugin__kuadrant-console-plugin~Namespace'),
      id: 'namespace',
      sort: 'metadata.namespace',
      transforms: [sortable],
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {t('plugin__kuadrant-console-plugin~Status')}
          <span style={{ display: 'inline-flex' }}>
            <StatusLegend />
          </span>
        </span>
      ) as unknown as string,
      id: 'Status',
      sort: sortGatewaysByStatus,
      transforms: [sortable],
    },
    {
      title: t('Total Requests'),
      id: 'totalRequests',
      sort: 'totalRequests',
      transforms: [sortable],
    },
    {
      title: t('Successful Requests'),
      id: 'successfulRequests',
      sort: 'successfulRequests',
      transforms: [sortable],
    },
    {
      title: t('Error Rate'),
      id: 'errorRate',
      sort: 'errorRate',
      transforms: [sortable],
    },
    {
      title: t('Error Codes'),
      id: 'errorCodes',
      sort: 'errorCodes',
      transforms: [sortable],
    },
    {
      title: '',
      id: 'kebab',
      props: { className: 'pf-v6-c-table__action' },
    },
  ];

  const handleCreateResource = (resource) => {
    const resolvedNamespace = watchNamespace === '#ALL_NS#' ? 'default' : watchNamespace;
    const gvk = resourceGVKMapping[resource];
    navigate(`/k8s/ns/${resolvedNamespace}/${gvk.group}~${gvk.version}~${gvk.kind}/~new`);
  };

  const onMenuSelect = (_event: React.MouseEvent<Element, MouseEvent>, policyType: string) => {
    const resolvedNamespace = watchNamespace === '#ALL_NS#' ? 'default' : watchNamespace;
    const resource = resourceGVKMapping[policyType];
    const targetUrl = `/k8s/ns/${resolvedNamespace}/${resource.group}~${resource.version}~${resource.kind}/~new`;
    navigate(targetUrl);
    setIsCreateOpen(false);
  };

  // Prometheus queries for gateway traffic
  // Determine namespace for metrics filtering (undefined for cluster-wide)
  const metricsNamespace = watchNamespace === '#ALL_NS#' ? undefined : watchNamespace;

  // Build queries as memoized values to ensure proper re-fetching when namespace changes
  const totalRequestsQuery = React.useMemo(
    () => buildTotalRequestsQuery(metricsNamespace),
    [metricsNamespace],
  );

  const totalErrorsQuery = React.useMemo(
    () => buildErrorRequestQuery(metricsNamespace),
    [metricsNamespace],
  );

  const totalErrorsByCodeQuery = React.useMemo(
    () => buildErrorsByCodeQuery(metricsNamespace),
    [metricsNamespace],
  );

  const [totalRequestsRes, totalRequestsLoaded, totalRequestsError] = usePrometheusPoll({
    endpoint: PrometheusEndpoint.QUERY,
    query: totalRequestsQuery,
  });
  const [totalErrorsRes, totalErrorsLoaded, totalErrorsError] = usePrometheusPoll({
    endpoint: PrometheusEndpoint.QUERY,
    query: totalErrorsQuery,
  });
  const [totalErrorsByCodeRes, totalErrorsByCodeLoaded, totalErrorsByCodeError] = usePrometheusPoll(
    {
      endpoint: PrometheusEndpoint.QUERY,
      query: totalErrorsByCodeQuery,
    },
  );

  // Map out query reponses to more easily accessible objects based on gateway name
  const totalRequestsByGateway: TotalRequestsByGateway = {};
  const getGateway = (name: string) => {
    if (!totalRequestsByGateway[name]) {
      totalRequestsByGateway[name] = {};
    }
    return totalRequestsByGateway[name];
  };
  if (!totalRequestsError && totalRequestsLoaded) {
    totalRequestsRes.data.result.forEach((item) => {
      const gatewayName = `${item.metric.source_workload_namespace}/${item.metric.source_workload}`;
      getGateway(gatewayName).total = parseFloat(item.value[1]);
    });
  }
  if (!totalErrorsError && totalErrorsLoaded) {
    totalErrorsRes.data.result.forEach((item) => {
      const gatewayName = `${item.metric.source_workload_namespace}/${item.metric.source_workload}`;
      getGateway(gatewayName).errors = parseFloat(item.value[1]);
    });
  }
  if (!totalErrorsByCodeError && totalErrorsByCodeLoaded) {
    totalErrorsByCodeRes.data.result.forEach((item) => {
      const gatewayName = `${item.metric.source_workload_namespace}/${item.metric.source_workload}`;
      const gateway = getGateway(gatewayName);
      if (!gateway.codes) gateway.codes = {};
      gateway.codes[item.metric.response_code] = parseFloat(item.value[1]);
    });
  }

  // Helper functions to pull out metric values in correct format, given a gateway object
  const getTotalRequests = (obj: { metadata: { namespace: string; name: string } }): number => {
    const key = buildGatewayKey(obj.metadata.namespace, obj.metadata.name, metricsWorkloadSuffix);
    const total = totalRequestsByGateway[key]?.total;
    return Number.isFinite(total) ? Math.round(total) : 0;
  };
  const getSuccessfulRequests = (obj: {
    metadata: { namespace: string; name: string };
  }): number => {
    const key = buildGatewayKey(obj.metadata.namespace, obj.metadata.name, metricsWorkloadSuffix);
    const success = totalRequestsByGateway[key]?.total - totalRequestsByGateway[key]?.errors;
    return Number.isFinite(success) ? Math.round(success) : 0;
  };
  const getErrorRate = (obj: { metadata: { namespace: string; name: string } }): string => {
    const key = buildGatewayKey(obj.metadata.namespace, obj.metadata.name, metricsWorkloadSuffix);
    const rate = (totalRequestsByGateway[key]?.errors / totalRequestsByGateway[key]?.total) * 100;
    return Number.isFinite(rate) ? rate.toFixed(1) : '-';
  };
  const getErrorCodes = (obj: { metadata: { namespace: string; name: string } }): Set<string> => {
    const codes = new Set<string>();
    const key = buildGatewayKey(obj.metadata.namespace, obj.metadata.name, metricsWorkloadSuffix);
    if (totalRequestsByGateway[key]?.codes) {
      Object.entries(totalRequestsByGateway[key].codes).forEach(([key, value]) => {
        if (key.startsWith('4') && value > 0) {
          codes.add('4xx');
        } else if (key.startsWith('5') && value > 0) {
          codes.add('5xx');
        } // Omit all other http & non http error codes to avoid confusion.
      });
    }
    return codes;
  };

  // Metrics columns rendering
  const getErrorCodeDistribution = (
    obj: { metadata: { namespace: string; name: string } },
    prefix: string,
  ): Array<[string, Distribution]> => {
    const key = buildGatewayKey(obj.metadata.namespace, obj.metadata.name, metricsWorkloadSuffix);
    const codes = totalRequestsByGateway[key]?.codes ?? {};
    const filteredCodes = Object.entries(codes).filter(([code]) => code.startsWith(prefix));

    const total = filteredCodes.reduce((sum, [, count]) => sum + count, 0);

    const distribution: Array<[string, Distribution]> = [];
    filteredCodes.forEach(([code, count]) => {
      if (count < 1) return;
      distribution.push([
        code,
        {
          total: count,
          percent: total > 0 ? (count / total) * 100 : 0,
        },
      ]);
    });

    // Sort codes by total after calculating percent
    const sortedDistribution = distribution.sort(
      ([, a], [, b]) => Number(b.total) - Number(a.total),
    );

    return sortedDistribution;
  };
  const gatewayTrafficRenders = {
    totalRequests: (column, obj, activeColumnIDs) => {
      return (
        <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
          {getTotalRequests(obj) || '-'}
        </TableData>
      );
    },
    successfulRequests: (column, obj, activeColumnIDs) => {
      return (
        <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
          {getSuccessfulRequests(obj) || '-'}
        </TableData>
      );
    },
    errorRate: (column, obj, activeColumnIDs) => {
      return (
        <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
          {getErrorRate(obj) || '-'}%
        </TableData>
      );
    },
    errorCodes: (column, obj, activeColumnIDs) => {
      const errorCodes = [...getErrorCodes(obj)];
      return (
        <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
          {errorCodes.length === 0 ? (
            <Label variant="outline" color="green">
              {t('None')}
            </Label>
          ) : (
            errorCodes.map((code) => {
              return (
                <ErrorCodeLabel
                  key={code}
                  codeGroup={code}
                  distribution={getErrorCodeDistribution(obj, code[0])}
                />
              );
            })
          )}
        </TableData>
      );
    },
  };

  const gvk = RESOURCES.Gateway.gvk;

  const [gateways] = useK8sWatchResource<Gateway[]>({
    groupVersionKind: gvk,
    isList: true,
    namespace: watchNamespace === '#ALL_NS#' ? undefined : watchNamespace,
  });

  const healthyCount = React.useMemo(() => {
    return gateways.filter((gw) => {
      const conditions = gw.status?.conditions ?? [];
      const accepted = conditions.some((c) => c.type === 'Accepted' && c.status === 'True');
      const programmed = conditions.some((c) => c.type === 'Programmed' && c.status === 'True');
      return accepted && programmed;
    }).length;
  }, [gateways]);

  const unhealthyCount = gateways.length - healthyCount;

  if (loading) {
    return <div>{t('Loading Permissions...')}</div>;
  } else
    return (
      <>
        <Helmet>
          <title data-test="example-page-title">{t('Kuadrant')}</title>
        </Helmet>
        <NamespaceBar onNamespaceChange={handleNamespaceChange} />
        <PageSection className="kuadrant-overview-page">
          <Title headingLevel="h1" className="pf-u-mb-lg">
            {t('Kuadrant')} Overview
          </Title>
          <Grid hasGutter>
            {/* Kuadrant CR Status Alert */}
            <GridItem style={{ marginTop: '8px' }}>
              <KuadrantStatusAlert />
            </GridItem>

            {!hideCard && (
              <GridItem>
                <Alert
                  variant="info"
                  isInline
                  style={{
                    borderWidth: '1px',
                  }}
                  title={
                    <span style={{ fontWeight: 'normal' }}>
                      {t('Getting started with Kuadrant')}:{' '}
                      <a
                        href={EXTERNAL_LINKS.documentation}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t('View Documentation')} <ExternalLinkAltIcon />
                      </a>
                    </span>
                  }
                  actionClose={
                    <Dropdown
                      onSelect={() => setIsGettingStartedMenuOpen(false)}
                      popperProps={{ position: 'right' }}
                      toggle={(toggleRef) => (
                        <MenuToggle
                          ref={toggleRef}
                          isExpanded={isGettingStartedMenuOpen}
                          onClick={() => setIsGettingStartedMenuOpen(!isGettingStartedMenuOpen)}
                          variant="plain"
                          aria-label="Getting started actions"
                        >
                          <EllipsisVIcon aria-hidden="true" />
                        </MenuToggle>
                      )}
                      isOpen={isGettingStartedMenuOpen}
                      onOpenChange={(isOpen: boolean) => setIsGettingStartedMenuOpen(isOpen)}
                    >
                      <DropdownList>
                        <DropdownItem key="hideForSession" onClick={handleHideCard}>
                          {t('Hide for session')}
                        </DropdownItem>
                      </DropdownList>
                    </Dropdown>
                  }
                />
              </GridItem>
            )}

            <GridItem>
              <Card>
                {/* TODO: Loading placeholder */}
                <CardTitle>
                  <Title headingLevel="h2">{t('Gateways')}</Title>
                  <CardBody className="pf-u-p-10">
                    <Flex
                      justifyContent={{ default: 'justifyContentSpaceAround' }}
                      alignItems={{ default: 'alignItemsCenter' }}
                    >
                      {/* Total Gateways */}
                      <FlexItem>
                        <Flex
                          direction={{ default: 'column' }}
                          alignItems={{ default: 'alignItemsCenter' }}
                        >
                          <strong style={{ fontSize: '1.3rem' }}>{gateways.length}</strong>
                          <span>{t('Total Gateways')}</span>
                        </Flex>
                      </FlexItem>

                      {/* Healthy Gateways */}
                      <FlexItem>
                        <Flex
                          direction={{ default: 'column' }}
                          alignItems={{ default: 'alignItemsCenter' }}
                        >
                          <strong style={{ fontSize: '1.3rem' }}>
                            <GreenCheckCircleIcon size="md" />{' '}
                            <span style={{ margin: '5px' }}>{healthyCount}</span>
                          </strong>
                          <Tooltip
                            content={
                              <div>
                                {t(
                                  'A healthy gateway has a `true` status for the `Accepted` and `Programmed` conditions.',
                                )}
                              </div>
                            }
                          >
                            <span>{t('Healthy Gateways')}</span>
                          </Tooltip>
                        </Flex>
                      </FlexItem>

                      {/* Unhealthy Gateways */}
                      <FlexItem>
                        <Flex
                          direction={{ default: 'column' }}
                          alignItems={{ default: 'alignItemsCenter' }}
                        >
                          <strong style={{ fontSize: '1.3rem' }}>
                            <YellowExclamationTriangleIcon size="md" />{' '}
                            <span style={{ margin: '5px' }}>{unhealthyCount}</span>
                          </strong>
                          <Tooltip
                            content={
                              <div>
                                {t(
                                  'An unhealthy gateway has a `false` status for the `Accepted` and/or `Programmed` conditions.',
                                )}
                              </div>
                            }
                          >
                            <span>{t('Unhealthy Gateways')}</span>
                          </Tooltip>
                        </Flex>
                      </FlexItem>
                    </Flex>
                  </CardBody>
                </CardTitle>
              </Card>
            </GridItem>

            {resourceRBAC['Gateway']?.list ? (
              <GridItem>
                <Card>
                  <CardTitle className="kuadrant-resource-create-container">
                    <Title headingLevel="h2">{t('Gateways - Traffic Analysis')}</Title>
                    {!resourceRBAC['Gateway']?.create ? (
                      <Tooltip content={t('You do not have permission to create a Gateway')}>
                        <Button className="kuadrant-overview-create-button" isAriaDisabled>
                          {t(`Create Gateway`)}
                        </Button>
                      </Tooltip>
                    ) : (
                      <Button
                        onClick={() => handleCreateResource('Gateway')}
                        className="kuadrant-overview-create-button"
                      >
                        {t(`Create Gateway`)}
                      </Button>
                    )}
                  </CardTitle>
                  <CardBody className="pf-u-p-10">
                    <ResourceList
                      resources={[resourceGVKMapping['Gateway']]}
                      columns={gatewayTrafficColumns}
                      renderers={gatewayTrafficRenders}
                      namespace={watchNamespace}
                      emptyResourceName={t('Gateways')}
                    />
                  </CardBody>
                </Card>
              </GridItem>
            ) : (
              <GridItem>
                <Card>
                  <CardBody className="pf-u-p-10">
                    <CardTitle>
                      <Title headingLevel="h2">{t('Gateways')}</Title>
                    </CardTitle>
                    <Bullseye>
                      <EmptyState
                        titleText={
                          <Title headingLevel="h4" size="lg">
                            {t('Access Denied')}
                          </Title>
                        }
                        icon={LockIcon}
                      >
                        <EmptyStateBody>
                          <Content component="p">
                            {t('You do not have permission to view Gateways')}
                          </Content>
                        </EmptyStateBody>
                      </EmptyState>
                    </Bullseye>
                  </CardBody>
                </Card>
              </GridItem>
            )}

            {policyRBACNill ? (
              <GridItem lg={6}>
                <Card>
                  <CardBody className="pf-u-p-10">
                    <CardTitle>
                      <Title headingLevel="h2">{t('Policies')}</Title>
                    </CardTitle>
                    <Bullseye>
                      <EmptyState
                        titleText={
                          <Title headingLevel="h4" size="lg">
                            {t('Access Denied')}
                          </Title>
                        }
                        icon={LockIcon}
                      >
                        <EmptyStateBody>
                          <Content component="p">
                            {t('You do not have permission to view Policies')}
                          </Content>
                        </EmptyStateBody>
                      </EmptyState>
                    </Bullseye>
                  </CardBody>
                </Card>
              </GridItem>
            ) : (
              <GridItem lg={6}>
                <Card>
                  <CardTitle className="kuadrant-resource-create-container">
                    <Title headingLevel="h2">{t('Policies')}</Title>
                    <Dropdown
                      isOpen={isCreateOpen}
                      onSelect={onMenuSelect}
                      onOpenChange={setIsCreateOpen}
                      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                        <MenuToggle
                          ref={toggleRef}
                          onClick={onToggleClick}
                          isExpanded={isCreateOpen}
                          variant="primary"
                          className="kuadrant-overview-create-button"
                        >
                          {t('Create Policy')}
                        </MenuToggle>
                      )}
                    >
                      <DropdownList className="kuadrant-overview-create-list pf-u-p-0">
                        {policies.map((policy) => {
                          const canCreate = resourceRBAC[policy]?.create;
                          return canCreate ? (
                            <DropdownItem value={policy} key={policy}>
                              {t(policy)}
                            </DropdownItem>
                          ) : (
                            <Tooltip
                              key={policy}
                              content={t('You do not have permission to create a {{policyType}}', {
                                policyType: policy,
                              })}
                            >
                              <DropdownItem value={policy} isAriaDisabled>
                                {t(policy)}
                              </DropdownItem>
                            </Tooltip>
                          );
                        })}
                      </DropdownList>
                    </Dropdown>
                  </CardTitle>
                  <CardBody className="pf-u-p-10">
                    <ResourceList
                      resources={[
                        resourceGVKMapping['AuthPolicy'],
                        resourceGVKMapping['DNSPolicy'],
                        resourceGVKMapping['RateLimitPolicy'],
                        resourceGVKMapping['TokenRateLimitPolicy'],
                        resourceGVKMapping['OIDCPolicy'],
                        resourceGVKMapping['PlanPolicy'],
                        resourceGVKMapping['TLSPolicy'],
                      ]}
                      columns={columns}
                      namespace={watchNamespace}
                      paginationLimit={5}
                    />
                  </CardBody>
                </Card>
              </GridItem>
            )}

            {resourceRBAC['HTTPRoute']?.list ? (
              <GridItem lg={6}>
                <Card>
                  <CardTitle className="kuadrant-resource-create-container">
                    <Title headingLevel="h2">{t('HTTPRoutes')}</Title>
                    {!resourceRBAC['HTTPRoute']?.create ? (
                      <Tooltip content={t('You do not have permission to create a HTTPRoute')}>
                        <Button className="kuadrant-overview-create-button" isAriaDisabled>
                          {t(`Create HTTPRoute`)}
                        </Button>
                      </Tooltip>
                    ) : (
                      <Button
                        onClick={() => handleCreateResource('HTTPRoute')}
                        className="kuadrant-overview-create-button"
                      >
                        {t(`Create HTTPRoute`)}
                      </Button>
                    )}
                  </CardTitle>
                  <CardBody className="pf-u-p-10">
                    <ResourceList
                      resources={[resourceGVKMapping['HTTPRoute']]}
                      columns={columns}
                      namespace={watchNamespace}
                      emptyResourceName={t('HTTPRoutes')}
                    />
                  </CardBody>
                </Card>
              </GridItem>
            ) : (
              <GridItem lg={6}>
                <Card>
                  <CardBody className="pf-u-p-10">
                    <CardTitle>
                      <Title headingLevel="h2">{t('HTTPRoutes')}</Title>
                    </CardTitle>
                    <Bullseye>
                      <EmptyState
                        titleText={
                          <Title headingLevel="h4" size="lg">
                            {t('Access Denied')}
                          </Title>
                        }
                        icon={LockIcon}
                      >
                        <EmptyStateBody>
                          <Content component="p">
                            {t('You do not have permission to view HTTPRoutes')}
                          </Content>
                        </EmptyStateBody>
                      </EmptyState>
                    </Bullseye>
                  </CardBody>
                </Card>
              </GridItem>
            )}

            {resourceRBAC['GRPCRoute']?.list ? (
              <GridItem lg={6}>
                <Card>
                  <CardTitle className="kuadrant-resource-create-container">
                    <Title headingLevel="h2">{t('GRPCRoutes')}</Title>
                    {!resourceRBAC['GRPCRoute']?.create ? (
                      <Tooltip content={t('You do not have permission to create a GRPCRoute')}>
                        <Button className="kuadrant-overview-create-button" isAriaDisabled>
                          {t('Create GRPCRoute')}
                        </Button>
                      </Tooltip>
                    ) : (
                      <Button
                        onClick={() => handleCreateResource('GRPCRoute')}
                        className="kuadrant-overview-create-button"
                      >
                        {t('Create GRPCRoute')}
                      </Button>
                    )}
                  </CardTitle>
                  <CardBody className="pf-u-p-10">
                    <ResourceList
                      resources={[resourceGVKMapping['GRPCRoute']]}
                      columns={columns}
                      namespace={watchNamespace}
                      emptyResourceName={t('GRPCRoutes')}
                    />
                  </CardBody>
                </Card>
              </GridItem>
            ) : (
              <GridItem lg={6}>
                <Card>
                  <CardBody className="pf-u-p-10">
                    <CardTitle>
                      <Title headingLevel="h2">{t('GRPCRoutes')}</Title>
                    </CardTitle>
                    <Bullseye>
                      <EmptyState
                        titleText={
                          <Title headingLevel="h4" size="lg">
                            {t('Access Denied')}
                          </Title>
                        }
                        icon={LockIcon}
                      >
                        <EmptyStateBody>
                          <Content component="p">
                            {t('You do not have permission to view GRPCRoutes')}
                          </Content>
                        </EmptyStateBody>
                      </EmptyState>
                    </Bullseye>
                  </CardBody>
                </Card>
              </GridItem>
            )}
          </Grid>
        </PageSection>
      </>
    );
};

export default React.memo(KuadrantOverviewPage);
