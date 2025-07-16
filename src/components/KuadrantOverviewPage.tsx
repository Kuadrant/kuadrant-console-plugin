import * as React from 'react';
import { useParams } from 'react-router-dom';
import Helmet from 'react-helmet';
import { useTranslation } from 'react-i18next';
import {
  PageSection,
  Title,
  Card,
  CardTitle,
  CardBody,
  CardExpandableContent,
  CardHeader,
  Flex,
  FlexItem,
  Content,
  ContentVariants,
  Stack,
  StackItem,
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
} from '@patternfly/react-core';
import {
  GlobeIcon,
  ReplicatorIcon,
  OptimizeIcon,
  ExternalLinkAltIcon,
  EllipsisVIcon,
  LockIcon,
} from '@patternfly/react-icons';
import {
  useActiveNamespace,
  usePrometheusPoll,
  PrometheusEndpoint,
  K8sResourceCommon,
  useK8sWatchResource,
  GreenCheckCircleIcon,
  YellowExclamationTriangleIcon,
  TableData,
} from '@openshift-console/dynamic-plugin-sdk';
import './kuadrant.css';
import ResourceList from './ResourceList';
import { sortable } from '@patternfly/react-table';
import { INTERNAL_LINKS, EXTERNAL_LINKS } from '../constants/links';
import resourceGVKMapping from '../utils/latest';
import { useHistory } from 'react-router-dom';
import useAccessReviews from '../utils/resourceRBAC';
import { getResourceNameFromKind } from '../utils/getModelFromResource';

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
  { name: 'TLSPolicies', gvk: resourceGVKMapping['TLSPolicy'] },
  { name: 'Gateways', gvk: resourceGVKMapping['Gateway'] },
  { name: 'HTTPRoutes', gvk: resourceGVKMapping['HTTPRoute'] },
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

const KuadrantOverviewPage: React.FC = () => {
  const history = useHistory();
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const { ns } = useParams<{ ns: string }>();
  const [activeNamespace, setActiveNamespace] = useActiveNamespace();
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [hideCard, setHideCard] = React.useState(
    sessionStorage.getItem('hideGettingStarted') === 'true',
  );
  const onToggleClick = () => {
    setIsCreateOpen(!isCreateOpen);
  };

  const resolvedNamespace = activeNamespace === '#ALL_NS#' ? 'default' : activeNamespace;
  const rbacResources = resources.map((res) => ({
    group: res.gvk.group,
    kind: getResourceNameFromKind(res.gvk.kind),
    namespace: resolvedNamespace,
  }));
  const { userRBAC, loading } = useAccessReviews(rbacResources);

  const policies = ['AuthPolicy', 'RateLimitPolicy', 'DNSPolicy', 'TLSPolicy'];

  const resourceRBAC = [
    'TLSPolicy',
    'DNSPolicy',
    'RateLimitPolicy',
    'AuthPolicy',
    'Gateway',
    'HTTPRoute',
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
    !resourceRBAC['DNSPolicy']['list'] &&
    !resourceRBAC['TLSPolicy']['list'];

  React.useEffect(() => {
    if (ns && ns !== activeNamespace) {
      setActiveNamespace(ns);
    }
  }, [ns, activeNamespace, setActiveNamespace]);

  const handleHideCard = () => {
    setHideCard(true);
    sessionStorage.setItem('hideGettingStarted', 'true');
  };

  const onSelect = () => {
    setIsOpen(!isOpen);
  };

  const dropdownItems = (
    <>
      <DropdownItem key="hideForSession" onClick={handleHideCard}>
        {t('Hide for session')}
      </DropdownItem>
    </>
  );

  const headerActions = (
    <>
      <Dropdown
        onSelect={onSelect}
        toggle={(toggleRef) => (
          <MenuToggle
            ref={toggleRef}
            isExpanded={isOpen}
            onClick={() => setIsOpen(!isOpen)}
            variant="plain"
            aria-label="Card actions"
          >
            <EllipsisVIcon aria-hidden="true" />
          </MenuToggle>
        )}
        isOpen={isOpen}
        onOpenChange={(isOpen: boolean) => setIsOpen(isOpen)}
      >
        <DropdownList>{dropdownItems}</DropdownList>
      </Dropdown>
    </>
  );

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
      props: { className: 'pf-v5-c-table__action' },
    },
  ];

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
      title: t('plugin__kuadrant-console-plugin~Status'),
      id: 'Status',
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
      props: { className: 'pf-v5-c-table__action' },
    },
  ];

  const handleCreateResource = (resource) => {
    const resolvedNamespace = activeNamespace === '#ALL_NS#' ? 'default' : activeNamespace;

    if (resource === 'Gateway') {
      const gateway = resourceGVKMapping['Gateway'];
      history.push(
        `/k8s/ns/${resolvedNamespace}/${gateway.group}~${gateway.version}~${gateway.kind}/~new`,
      );
    } else {
      const httpRoute = resourceGVKMapping['HTTPRoute'];
      history.push(
        `/k8s/ns/${resolvedNamespace}/${httpRoute.group}~${httpRoute.version}~${httpRoute.kind}/~new`,
      );
    }
  };

  const onMenuSelect = (_event: React.MouseEvent<Element, MouseEvent>, policyType: string) => {
    const resource = resourceGVKMapping[policyType];
    const resolvedNamespace = activeNamespace === '#ALL_NS#' ? 'default' : activeNamespace;
    const targetUrl = `/k8s/ns/${resolvedNamespace}/${resource.group}~${resource.version}~${resource.kind}/~new`;
    history.push(targetUrl);
    setIsOpen(false);
  };

  // Prometheus queries for gateway traffic
  const [totalRequestsRes, totalRequestsLoaded, totalRequestsError] = usePrometheusPoll({
    endpoint: PrometheusEndpoint.QUERY,
    query:
      'sum by (source_workload, source_workload_namespace) (increase(istio_requests_total[24h]))',
  });
  const [totalErrorsRes, totalErrorsLoaded, totalErrorsError] = usePrometheusPoll({
    endpoint: PrometheusEndpoint.QUERY,
    query:
      'sum by (source_workload, source_workload_namespace) (increase(istio_requests_total{response_code!~"2(.*)|3(.*)"}[24h]))',
  });
  const [totalErrorsByCodeRes, totalErrorsByCodeLoaded, totalErrorsByCodeError] = usePrometheusPoll(
    {
      endpoint: PrometheusEndpoint.QUERY,
      query:
        'sum by (response_code, source_workload, source_workload_namespace) (increase(istio_requests_total{response_code!~"2(.*)|3(.*)"}[24h]))',
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
    const key = `${obj.metadata.namespace}/${obj.metadata.name}-istio`;
    const total = totalRequestsByGateway[key]?.total;
    return Number.isFinite(total) ? Math.round(total) : 0;
  };
  const getSuccessfulRequests = (obj: {
    metadata: { namespace: string; name: string };
  }): number => {
    const key = `${obj.metadata.namespace}/${obj.metadata.name}-istio`;
    const success = totalRequestsByGateway[key]?.total - totalRequestsByGateway[key]?.errors;
    return Number.isFinite(success) ? Math.round(success) : 0;
  };
  const getErrorRate = (obj: { metadata: { namespace: string; name: string } }): string => {
    const key = `${obj.metadata.namespace}/${obj.metadata.name}-istio`;
    const rate = (totalRequestsByGateway[key]?.errors / totalRequestsByGateway[key]?.total) * 100;
    return Number.isFinite(rate) ? rate.toFixed(1) : '-';
  };
  const getErrorCodes = (obj: { metadata: { namespace: string; name: string } }): Set<string> => {
    const codes = new Set<string>();
    const key = `${obj.metadata.namespace}/${obj.metadata.name}-istio`;
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
  interface Distribution {
    total: number;
    percent: number;
  }
  const getErrorCodeDistribution = (
    obj: { metadata: { namespace: string; name: string } },
    prefix: string,
  ): Array<[string, Distribution]> => {
    const key = `${obj.metadata.namespace}/${obj.metadata.name}-istio`;
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
  const ErrorCodeLabel: React.FC<{
    obj: { metadata: { namespace: string; name: string } };
    codeGroup: string;
  }> = ({ obj, codeGroup }) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const distribution = getErrorCodeDistribution(obj, codeGroup[0]);
    let lastCode = '';
    return (
      <Popover
        className="custom-rounded-popover"
        headerContent={`Error Code`}
        bodyContent={
          <>
            <Content component={ContentVariants.p}>
              {t('Displays the distribution of error codes for request failures.')}
            </Content>
            <div className="popover-codes">
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
                            <strong>Code: {code}</strong>
                          </FlexItem>
                          <FlexItem align={{ default: 'alignRight' }}>
                            {dist.total.toFixed(0) === '1'
                              ? '1 request'
                              : `${dist.total.toFixed(0)} requests`}
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
              return <ErrorCodeLabel key={code} obj={obj} codeGroup={code} />;
            })
          )}
        </TableData>
      );
    },
  };

  const gvk = { group: 'gateway.networking.k8s.io', version: 'v1', kind: 'Gateway' };

  const [gateways] = useK8sWatchResource<Gateway[]>({
    groupVersionKind: gvk,
    isList: true,
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
        <PageSection>
          <Title headingLevel="h1" className="pf-u-mb-lg">
            {t('Kuadrant')} Overview
          </Title>
          <Grid hasGutter>
            {!hideCard && (
              <GridItem>
                <Card id="expandable-card" isExpanded={isExpanded}>
                  <CardHeader
                    actions={{ actions: headerActions }}
                    onExpand={() => setIsExpanded(!isExpanded)}
                    toggleButtonProps={{
                      'aria-label': isExpanded
                        ? t('Collapse Getting Started')
                        : t('Expand Getting Started'),
                    }}
                  >
                    <CardTitle>{t('Getting started resources')}</CardTitle>
                  </CardHeader>
                  <CardExpandableContent>
                    <CardBody>
                      <Flex className="kuadrant-overview-getting-started">
                        <FlexItem flex={{ default: 'flex_1' }}>
                          <Title headingLevel="h4" className="kuadrant-dashboard-learning">
                            <GlobeIcon /> {t('Learning Resources')}
                          </Title>
                          <Content component={ContentVariants.small}>
                            {t(
                              'Learn how to create, import and use Kuadrant policies on OpenShift with step-by-step instructions and tasks.',
                            )}
                          </Content>
                          <Stack hasGutter className="pf-u-mt-sm">
                            <StackItem>
                              <Content
                                component="a"
                                href={EXTERNAL_LINKS.documentation}
                                className="kuadrant-dashboard-resource-link"
                                target="_blank"
                              >
                                {t('View Documentation')} <ExternalLinkAltIcon />
                              </Content>
                            </StackItem>
                            <StackItem>
                              <Content
                                component="a"
                                href={EXTERNAL_LINKS.secureConnectProtect}
                                className="kuadrant-dashboard-resource-link"
                                target="_blank"
                              >
                                {t('Configuring and deploying Gateway policies with Kuadrant')}{' '}
                                <ExternalLinkAltIcon />
                              </Content>
                            </StackItem>
                          </Stack>
                        </FlexItem>
                        <Divider orientation={{ default: 'vertical' }} />
                        <FlexItem flex={{ default: 'flex_1' }}>
                          <Title
                            headingLevel="h4"
                            className="kuadrant-dashboard-feature-highlights"
                          >
                            <OptimizeIcon /> {t('Feature Highlights')}
                          </Title>
                          <Content component={ContentVariants.small}>
                            {t(
                              'Read about the latest information and key features in the Kuadrant highlights.',
                            )}
                          </Content>
                          <Stack hasGutter className="pf-u-mt-md">
                            <StackItem>
                              <Content
                                target="_blank"
                                component="a"
                                href={EXTERNAL_LINKS.releaseNotes}
                                className="kuadrant-dashboard-resource-link"
                              >
                                {t('Kuadrant')} {t('Release Notes')} <ExternalLinkAltIcon />
                              </Content>
                            </StackItem>
                          </Stack>
                        </FlexItem>
                        <Divider orientation={{ default: 'vertical' }} />
                        <FlexItem flex={{ default: 'flex_1' }}>
                          <Title headingLevel="h4" className="kuadrant-dashboard-enhance">
                            <ReplicatorIcon /> {t('Enhance Your Work')}
                          </Title>
                          <Content component={ContentVariants.small}>
                            {t(
                              'Ease operational complexity with API management and App Connectivity by using additional Operators and tools.',
                            )}
                          </Content>
                          <Stack hasGutter className="pf-u-mt-md">
                            <StackItem>
                              <Content
                                component="a"
                                href={INTERNAL_LINKS.observabilitySetup}
                                className="kuadrant-dashboard-resource-link"
                                target="_blank"
                              >
                                Observability for {t('Kuadrant')} <ExternalLinkAltIcon />
                              </Content>
                            </StackItem>
                            <StackItem>
                              <Content
                                component="a"
                                href={INTERNAL_LINKS.certManagerOperator(activeNamespace)}
                                className="kuadrant-dashboard-resource-link"
                              >
                                {t('cert-manager Operator')} <ExternalLinkAltIcon />
                              </Content>
                            </StackItem>
                          </Stack>
                        </FlexItem>
                      </Flex>
                    </CardBody>
                  </CardExpandableContent>
                </Card>
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
                          <span>Total Gateways</span>
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
                            <span>Healthy Gateways</span>
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
                            <span>Unhealthy Gateways</span>
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
                    {resourceRBAC['Gateway']?.create ? (
                      <Button
                        onClick={() => handleCreateResource('Gateway')}
                        className="kuadrant-overview-create-button"
                      >
                        {t(`Create Gateway`)}
                      </Button>
                    ) : (
                      <Tooltip content="You do not have permission to create a Gateway">
                        <Button className="kuadrant-overview-create-button" isAriaDisabled>
                          {t(`Create Gateway`)}
                        </Button>
                      </Tooltip>
                    )}
                  </CardTitle>
                  <CardBody className="pf-u-p-10">
                    <ResourceList
                      resources={[resourceGVKMapping['Gateway']]}
                      columns={gatewayTrafficColumns}
                      renderers={gatewayTrafficRenders}
                      namespace="#ALL_NS#"
                      emtpyResourceName="Gateways"
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
              <GridItem>
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
              <GridItem>
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
                              content={t(`You do not have permission to create a ${policy}`)}
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
                        resourceGVKMapping['TLSPolicy'],
                      ]}
                      columns={columns}
                      namespace="#ALL_NS#"
                      paginationLimit={5}
                    />
                  </CardBody>
                </Card>
              </GridItem>
            )}

            {resourceRBAC['HTTPRoute']?.list ? (
              <GridItem>
                <Card>
                  <CardTitle className="kuadrant-resource-create-container">
                    <Title headingLevel="h2">{t('HTTPRoutes')}</Title>
                    {resourceRBAC['HTTPRoute']?.create ? (
                      <Button
                        onClick={() => handleCreateResource('HTTPRoute')}
                        className="kuadrant-overview-create-button"
                      >
                        {t(`Create HTTPRoute`)}
                      </Button>
                    ) : (
                      <Tooltip content="You do not have permission to create a HTTPRoute">
                        <Button className="kuadrant-overview-create-button" isAriaDisabled>
                          {t(`Create HTTPRoute`)}
                        </Button>
                      </Tooltip>
                    )}
                  </CardTitle>
                  <CardBody className="pf-u-p-10">
                    <ResourceList
                      resources={[resourceGVKMapping['HTTPRoute']]}
                      columns={columns}
                      namespace="#ALL_NS#"
                      emtpyResourceName="HTTPRoutes"
                    />
                  </CardBody>
                </Card>
              </GridItem>
            ) : (
              <GridItem>
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
          </Grid>
        </PageSection>
      </>
    );
};

export default KuadrantOverviewPage;
