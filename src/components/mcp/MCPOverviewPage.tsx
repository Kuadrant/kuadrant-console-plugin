import * as React from 'react';
import { useParams, useNavigate } from 'react-router';
import Helmet from 'react-helmet';
import { useTranslation } from 'react-i18next';
import {
  PageSection,
  Title,
  Grid,
  GridItem,
  Alert,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  Card,
  CardTitle,
  CardBody,
  Button,
  Tooltip,
  Bullseye,
  EmptyState,
  EmptyStateBody,
  EmptyStateActions,
  EmptyStateFooter,
  Content,
  Flex,
  FlexItem,
  MenuToggleElement,
} from '@patternfly/react-core';
import {
  ExternalLinkAltIcon,
  EllipsisVIcon,
  LockIcon,
  ListIcon,
  RocketIcon,
} from '@patternfly/react-icons';
import {
  NamespaceBar,
  K8sResourceCommon,
  ResourceLink,
  useK8sWatchResource,
  GreenCheckCircleIcon,
  YellowExclamationTriangleIcon,
} from '@openshift-console/dynamic-plugin-sdk';
import '../kuadrant.css';
import ResourceList from '../ResourceList';
import { useKuadrantNamespaceChange } from '../../hooks/useKuadrantNamespaceChange';
import { EXTERNAL_LINKS } from '../../constants/links';
import { RESOURCES, resourceGVKMapping } from '../../utils/resources';
import useAccessReviews from '../../utils/resourceRBAC';
import { getResourceNameFromKind } from '../../utils/getModelFromResource';
import { GatewayResource } from '../gateway/types';
import { MCPGatewayExtension, MCPServerRegistration } from './types';
import MCPRegistrationWizard from './MCPRegistrationWizard';

const mcpResources = [
  {
    group: RESOURCES.MCPGatewayExtension.gvk.group,
    kind: getResourceNameFromKind('MCPGatewayExtension'),
    namespace: undefined as string | undefined,
  },
  {
    group: RESOURCES.MCPServerRegistration.gvk.group,
    kind: getResourceNameFromKind('MCPServerRegistration'),
    namespace: undefined as string | undefined,
  },
  {
    group: RESOURCES.ReferenceGrant.gvk.group,
    kind: getResourceNameFromKind('ReferenceGrant'),
    namespace: undefined as string | undefined,
  },
  {
    group: RESOURCES.AuthPolicy.gvk.group,
    kind: getResourceNameFromKind('AuthPolicy'),
    namespace: undefined as string | undefined,
  },
  {
    group: RESOURCES.RateLimitPolicy.gvk.group,
    kind: getResourceNameFromKind('RateLimitPolicy'),
    namespace: undefined as string | undefined,
  },
  {
    group: RESOURCES.TLSPolicy.gvk.group,
    kind: getResourceNameFromKind('TLSPolicy'),
    namespace: undefined as string | undefined,
  },
  {
    group: RESOURCES.DNSPolicy.gvk.group,
    kind: getResourceNameFromKind('DNSPolicy'),
    namespace: undefined as string | undefined,
  },
];

const mcpPolicies = ['AuthPolicy', 'RateLimitPolicy', 'TLSPolicy', 'DNSPolicy'];

const MCPOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const { ns } = useParams<{ ns: string }>();
  const { handleNamespaceChange, activeNamespace } = useKuadrantNamespaceChange('/mcp/overview');

  const [isRegisterServerOpen, setIsRegisterServerOpen] = React.useState(false);
  const [isWizardOpen, setIsWizardOpen] = React.useState(false);
  const [isPolicyCreateOpen, setIsPolicyCreateOpen] = React.useState(false);
  const [isGettingStartedMenuOpen, setIsGettingStartedMenuOpen] = React.useState(false);
  const [hideCard, setHideCard] = React.useState(
    sessionStorage.getItem('hideMCPGettingStarted') === 'true',
  );

  const watchNamespace = ns || activeNamespace;
  const resolvedNamespace = watchNamespace === '#ALL_NS#' ? undefined : watchNamespace;

  const [extensions, extensionsLoaded] = useK8sWatchResource<MCPGatewayExtension[]>({
    groupVersionKind: RESOURCES.MCPGatewayExtension.gvk,
    isList: true,
    namespace: resolvedNamespace,
  });

  const [gateways] = useK8sWatchResource<GatewayResource[]>({
    groupVersionKind: RESOURCES.Gateway.gvk,
    isList: true,
    namespace: resolvedNamespace,
  });

  const [servers] = useK8sWatchResource<MCPServerRegistration[]>({
    groupVersionKind: RESOURCES.MCPServerRegistration.gvk,
    isList: true,
    namespace: resolvedNamespace,
  });

  const mcpGateways = React.useMemo(() => {
    if (!extensions || !gateways) return [];
    const targetRefs = new Set(
      extensions.map((ext) => {
        const ns = ext.spec?.targetRef?.namespace || ext.metadata?.namespace;
        return `${ns}/${ext.spec?.targetRef?.name}`;
      }),
    );
    return gateways.filter((gw) =>
      targetRefs.has(`${gw.metadata?.namespace}/${gw.metadata?.name}`),
    );
  }, [extensions, gateways]);

  const gatewayNameOptions = React.useMemo(() => {
    if (!extensions) return [];
    const names = new Set(extensions.map((ext) => ext.spec?.targetRef?.name).filter(Boolean));
    return Array.from(names);
  }, [extensions]);

  const mcpGatewayHealthyCount = React.useMemo(() => {
    return mcpGateways.filter((gw) => {
      const conditions = gw.status?.conditions ?? [];
      const accepted = conditions.some((c) => c.type === 'Accepted' && c.status === 'True');
      const programmed = conditions.some((c) => c.type === 'Programmed' && c.status === 'True');
      return accepted && programmed;
    }).length;
  }, [mcpGateways]);

  const mcpGatewayUnhealthyCount = mcpGateways.length - mcpGatewayHealthyCount;

  const mcpServerOnlineCount = React.useMemo(() => {
    if (!servers) return 0;
    return servers.filter((srv) => {
      const conditions = srv.status?.conditions ?? [];
      return conditions.some((c) => c.type === 'Ready' && c.status === 'True');
    }).length;
  }, [servers]);

  const mcpServerOfflineCount = (servers?.length || 0) - mcpServerOnlineCount;

  const mcpServerTypesCount = React.useMemo(() => {
    if (!servers) return 0;
    const categories = new Set<string>();
    servers.forEach((srv) => {
      (srv.spec?.category || []).forEach((cat) => categories.add(cat));
    });
    return categories.size;
  }, [servers]);

  const mcpTargetKeys = React.useMemo(() => {
    const keys = new Set<string>();
    mcpGateways.forEach((gw) => {
      keys.add(`Gateway/${gw.metadata?.namespace}/${gw.metadata?.name}`);
    });
    (servers || []).forEach((srv) => {
      const ref = srv.spec?.targetRef;
      if (ref?.name) {
        const kind = ref.kind || 'HTTPRoute';
        const ns = ref.namespace || srv.metadata?.namespace;
        keys.add(`${kind}/${ns}/${ref.name}`);
      }
    });
    return keys;
  }, [mcpGateways, servers]);

  const policyDataFilter = React.useCallback(
    (item: K8sResourceCommon) => {
      const targetRef = (
        item as K8sResourceCommon & {
          spec?: { targetRef?: { kind: string; name: string; namespace?: string } };
        }
      ).spec?.targetRef;
      if (!targetRef) return false;
      const ns = targetRef.namespace || item.metadata?.namespace;
      return mcpTargetKeys.has(`${targetRef.kind}/${ns}/${targetRef.name}`);
    },
    [mcpTargetKeys],
  );

  const rbacResources = React.useMemo(
    () =>
      mcpResources.map((r) => ({
        ...r,
        namespace: resolvedNamespace,
      })),
    [resolvedNamespace],
  );
  const { userRBAC, loading: rbacLoading } = useAccessReviews(rbacResources);

  const extensionRBAC = {
    list: userRBAC[`${getResourceNameFromKind('MCPGatewayExtension')}-list`],
    create: userRBAC[`${getResourceNameFromKind('MCPGatewayExtension')}-create`],
  };

  const serverRBAC = {
    list: userRBAC[`${getResourceNameFromKind('MCPServerRegistration')}-list`],
    create: userRBAC[`${getResourceNameFromKind('MCPServerRegistration')}-create`],
  };

  const referenceGrantRBAC = {
    list: userRBAC[`${getResourceNameFromKind('ReferenceGrant')}-list`],
    create: userRBAC[`${getResourceNameFromKind('ReferenceGrant')}-create`],
  };

  const policyRBAC = mcpPolicies.reduce(
    (acc, policy) => ({
      ...acc,
      [policy]: {
        list: userRBAC[`${getResourceNameFromKind(policy)}-list`],
        create: userRBAC[`${getResourceNameFromKind(policy)}-create`],
      },
    }),
    {} as Record<string, { list: boolean; create: boolean }>,
  );

  const cannotListAnyPolicy = mcpPolicies.every((p) => !policyRBAC[p]?.list);

  const isAllNamespaces = watchNamespace === '#ALL_NS#';

  const handleCreateResource = (resource: string) => {
    if (isAllNamespaces) return;
    const gvk = resourceGVKMapping[resource];
    navigate(`/k8s/ns/${watchNamespace}/${gvk.group}~${gvk.version}~${gvk.kind}/~new`);
  };

  const onPolicyCreateSelect = (
    _event: React.MouseEvent<Element, MouseEvent>,
    policyType: string,
  ) => {
    if (isAllNamespaces) return;
    const gvk = resourceGVKMapping[policyType];
    navigate(`/k8s/ns/${watchNamespace}/${gvk.group}~${gvk.version}~${gvk.kind}/~new`);
    setIsPolicyCreateOpen(false);
  };

  React.useEffect(() => {
    if (ns && ns !== activeNamespace) {
      handleNamespaceChange(ns);
    }
  }, [ns, handleNamespaceChange, activeNamespace]);

  const handleHideCard = () => {
    setHideCard(true);
    sessionStorage.setItem('hideMCPGettingStarted', 'true');
    setIsGettingStartedMenuOpen(false);
  };

  const extensionColumns = React.useMemo(
    () => [
      {
        title: t('Extension name'),
        id: 'name',
        sort: 'metadata.name',
      },
      {
        title: t('Gateway name'),
        id: 'gatewayName',
        sort: 'spec.targetRef.name',
      },
      {
        title: t('Namespace'),
        id: 'namespace',
        sort: 'metadata.namespace',
      },
      {
        title: '',
        id: 'kebab',
        props: { className: 'pf-v6-c-table__action' },
      },
    ],
    [t],
  );

  const extensionRenderers = React.useMemo(
    () => ({
      gatewayName: (_column, obj: K8sResourceCommon) => {
        const ext = obj as MCPGatewayExtension;
        const gwName = ext.spec?.targetRef?.name;
        const gwNamespace = ext.spec?.targetRef?.namespace || ext.metadata?.namespace;
        return gwName ? (
          <ResourceLink
            groupVersionKind={RESOURCES.Gateway.gvk}
            name={gwName}
            namespace={gwNamespace}
          />
        ) : (
          '-'
        );
      },
    }),
    [],
  );

  const serverColumns = React.useMemo(
    () => [
      {
        title: t('Server name'),
        id: 'name',
        sort: 'metadata.name',
      },
      {
        title: t('Namespace'),
        id: 'namespace',
        sort: 'metadata.namespace',
      },
      {
        title: t('Status'),
        id: 'Status',
        sort: 'status.conditions',
      },
      {
        title: '',
        id: 'kebab',
        props: { className: 'pf-v6-c-table__action' },
      },
    ],
    [t],
  );

  const referenceGrantColumns = React.useMemo(
    () => [
      {
        title: t('Grant name'),
        id: 'name',
        sort: 'metadata.name',
      },
      {
        title: t('Namespace mapped to'),
        id: 'namespace',
        sort: 'metadata.namespace',
      },
      {
        title: '',
        id: 'kebab',
        props: { className: 'pf-v6-c-table__action' },
      },
    ],
    [t],
  );

  const policyColumns = React.useMemo(
    () => [
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
        title: t('Namespace'),
        id: 'namespace',
        sort: 'metadata.namespace',
      },
      {
        title: t('Status'),
        id: 'Status',
        sort: 'status.conditions',
      },
      {
        title: '',
        id: 'kebab',
        props: { className: 'pf-v6-c-table__action' },
      },
    ],
    [t],
  );

  if (rbacLoading) {
    return <div>{t('Loading permissions...')}</div>;
  }

  const hasNoExtensions = extensionsLoaded && (!extensions || extensions.length === 0);

  if (hasNoExtensions) {
    return (
      <>
        <Helmet>
          <title data-test="mcp-overview-page-title">{t('MCP management')}</title>
        </Helmet>
        <NamespaceBar onNamespaceChange={handleNamespaceChange} />
        <PageSection hasBodyWrapper={false}>
          <Title headingLevel="h1">{t('MCP management')}</Title>
        </PageSection>
        <PageSection hasBodyWrapper={false}>
          <EmptyState headingLevel="h2" titleText={t('Get started')} icon={RocketIcon}>
            <EmptyStateBody>
              <Content component="p">
                {t(
                  'Set up your MCP infrastructure by creating a gateway, route, and MCP extension. Use the setup wizard to get started quickly.',
                )}
              </Content>
            </EmptyStateBody>
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button
                  variant="primary"
                  onClick={() => navigate('/kuadrant/mcp/setup-wizard')}
                  data-test="mcp-setup-wizard-button"
                >
                  {t('MCP gateway setup wizard')}
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          </EmptyState>
        </PageSection>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>{t('MCP management overview')}</title>
      </Helmet>
      <NamespaceBar onNamespaceChange={handleNamespaceChange} />
      <PageSection className="kuadrant-mcp-overview-page">
        <Title headingLevel="h1" className="kuadrant-mcp-page-title">
          {t('MCP management overview')}
        </Title>
        <Divider className="kuadrant-mcp-divider" />
        <Grid hasGutter>
          {!hideCard && (
            <GridItem className="kuadrant-mcp-getting-started">
              <Alert
                variant="info"
                isInline
                className="kuadrant-mcp-getting-started-alert"
                title={
                  <span className="kuadrant-mcp-getting-started-title">
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
                        aria-label={t('Getting started actions')}
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

          <GridItem lg={6}>
            <Card>
              <CardTitle>
                <Title headingLevel="h2" size="md" className="kuadrant-mcp-card-heading">
                  {t('MCP Gateways')}
                </Title>
              </CardTitle>
              <CardBody>
                <Flex
                  justifyContent={{ default: 'justifyContentSpaceAround' }}
                  alignItems={{ default: 'alignItemsCenter' }}
                >
                  <FlexItem>
                    <Flex
                      direction={{ default: 'column' }}
                      alignItems={{ default: 'alignItemsCenter' }}
                    >
                      <strong className="kuadrant-mcp-stat-value">{mcpGateways.length}</strong>
                      <span>{t('Total')}</span>
                    </Flex>
                  </FlexItem>
                  <FlexItem>
                    <Flex
                      direction={{ default: 'column' }}
                      alignItems={{ default: 'alignItemsCenter' }}
                    >
                      <strong className="kuadrant-mcp-stat-value">
                        <GreenCheckCircleIcon size="md" />{' '}
                        <span className="kuadrant-mcp-stat-icon-gap">{mcpGatewayHealthyCount}</span>
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
                        <span>{t('Healthy')}</span>
                      </Tooltip>
                    </Flex>
                  </FlexItem>
                  <FlexItem>
                    <Flex
                      direction={{ default: 'column' }}
                      alignItems={{ default: 'alignItemsCenter' }}
                    >
                      <strong className="kuadrant-mcp-stat-value">
                        <YellowExclamationTriangleIcon size="md" />{' '}
                        <span className="kuadrant-mcp-stat-icon-gap">
                          {mcpGatewayUnhealthyCount}
                        </span>
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
                        <span>{t('Unhealthy')}</span>
                      </Tooltip>
                    </Flex>
                  </FlexItem>
                </Flex>
              </CardBody>
            </Card>
          </GridItem>

          <GridItem lg={6}>
            <Card>
              <CardTitle>
                <Title headingLevel="h2" size="md" className="kuadrant-mcp-card-heading">
                  {t('MCP Servers')}
                </Title>
              </CardTitle>
              <CardBody>
                <Flex
                  justifyContent={{ default: 'justifyContentSpaceAround' }}
                  alignItems={{ default: 'alignItemsCenter' }}
                >
                  <FlexItem>
                    <Flex
                      direction={{ default: 'column' }}
                      alignItems={{ default: 'alignItemsCenter' }}
                    >
                      <strong className="kuadrant-mcp-stat-value">
                        <ListIcon />{' '}
                        <span className="kuadrant-mcp-stat-icon-gap">{mcpServerTypesCount}</span>
                      </strong>
                      <span>{t('Types')}</span>
                    </Flex>
                  </FlexItem>
                  <FlexItem>
                    <Flex
                      direction={{ default: 'column' }}
                      alignItems={{ default: 'alignItemsCenter' }}
                    >
                      <strong className="kuadrant-mcp-stat-value">{servers?.length || 0}</strong>
                      <span>{t('Total')}</span>
                    </Flex>
                  </FlexItem>
                  <FlexItem>
                    <Flex
                      direction={{ default: 'column' }}
                      alignItems={{ default: 'alignItemsCenter' }}
                    >
                      <strong className="kuadrant-mcp-stat-value">
                        <GreenCheckCircleIcon size="md" />{' '}
                        <span className="kuadrant-mcp-stat-icon-gap">{mcpServerOnlineCount}</span>
                      </strong>
                      <Tooltip
                        content={
                          <div>
                            {t('An online server has a `true` status for the `Ready` condition.')}
                          </div>
                        }
                      >
                        <span>{t('Online')}</span>
                      </Tooltip>
                    </Flex>
                  </FlexItem>
                  <FlexItem>
                    <Flex
                      direction={{ default: 'column' }}
                      alignItems={{ default: 'alignItemsCenter' }}
                    >
                      <strong className="kuadrant-mcp-stat-value">
                        <YellowExclamationTriangleIcon size="md" />{' '}
                        <span className="kuadrant-mcp-stat-icon-gap">{mcpServerOfflineCount}</span>
                      </strong>
                      <Tooltip
                        content={
                          <div>
                            {t(
                              'An offline server does not have a `true` status for the `Ready` condition.',
                            )}
                          </div>
                        }
                      >
                        <span>{t('Offline')}</span>
                      </Tooltip>
                    </Flex>
                  </FlexItem>
                </Flex>
              </CardBody>
            </Card>
          </GridItem>

          {extensionRBAC.list ? (
            <GridItem>
              <Card>
                <CardTitle className="kuadrant-resource-create-container">
                  <Title headingLevel="h2">{t('MCP Gateway Extensions')}</Title>
                  {!extensionRBAC.create || isAllNamespaces ? (
                    <Tooltip
                      content={
                        isAllNamespaces
                          ? t('Select a namespace to create a resource')
                          : t('You do not have permission to create a {{policyType}}', {
                              policyType: 'MCPGatewayExtension',
                            })
                      }
                    >
                      <Button className="kuadrant-overview-create-button" isAriaDisabled>
                        {t('Create MCPGatewayExtension')}
                      </Button>
                    </Tooltip>
                  ) : (
                    <Button
                      onClick={() => handleCreateResource('MCPGatewayExtension')}
                      className="kuadrant-overview-create-button"
                    >
                      {t('Create MCPGatewayExtension')}
                    </Button>
                  )}
                </CardTitle>
                <CardBody className="pf-v6-u-p-lg">
                  <ResourceList
                    resources={[resourceGVKMapping['MCPGatewayExtension']]}
                    columns={extensionColumns}
                    renderers={extensionRenderers}
                    namespace={watchNamespace}
                    emptyResourceName={t('MCP Gateway Extensions')}
                    hideTypeFilter
                    additionalFilters={[
                      {
                        label: t('Gateway name'),
                        allLabel: t('All Gateways'),
                        options: gatewayNameOptions,
                        filterFn: (item, value) =>
                          (item as MCPGatewayExtension).spec?.targetRef?.name === value,
                      },
                    ]}
                  />
                </CardBody>
              </Card>
            </GridItem>
          ) : (
            <GridItem>
              <Card>
                <CardBody className="pf-v6-u-p-lg">
                  <CardTitle>
                    <Title headingLevel="h2">{t('MCP Gateway Extensions')}</Title>
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
                          {t('You do not have permission to view MCP Gateway Extensions')}
                        </Content>
                      </EmptyStateBody>
                    </EmptyState>
                  </Bullseye>
                </CardBody>
              </Card>
            </GridItem>
          )}

          {serverRBAC.list ? (
            <GridItem>
              <Card>
                <CardTitle className="kuadrant-resource-create-container">
                  <Title headingLevel="h2">{t('MCP Servers')}</Title>
                  <Dropdown
                    isOpen={isRegisterServerOpen}
                    onSelect={() => setIsRegisterServerOpen(false)}
                    onOpenChange={setIsRegisterServerOpen}
                    toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                      <MenuToggle
                        ref={toggleRef}
                        onClick={() => setIsRegisterServerOpen(!isRegisterServerOpen)}
                        isExpanded={isRegisterServerOpen}
                        variant="primary"
                        className="kuadrant-overview-create-button"
                      >
                        {t('Register MCP Server')}
                      </MenuToggle>
                    )}
                  >
                    <DropdownList>
                      {!serverRBAC.create || isAllNamespaces ? (
                        <Tooltip
                          content={
                            isAllNamespaces
                              ? t('Select a namespace to create a resource')
                              : t('You do not have permission to create a {{policyType}}', {
                                  policyType: 'MCPServerRegistration',
                                })
                          }
                        >
                          <DropdownItem key="internal" isAriaDisabled>
                            {t('Internal')}
                          </DropdownItem>
                        </Tooltip>
                      ) : (
                        <DropdownItem
                          key="internal"
                          onClick={() => {
                            setIsRegisterServerOpen(false);
                            setIsWizardOpen(true);
                          }}
                        >
                          {t('Internal')}
                        </DropdownItem>
                      )}
                      <Tooltip content={t('External registration is not available yet')}>
                        <DropdownItem key="external" isAriaDisabled>
                          {t('External')}
                        </DropdownItem>
                      </Tooltip>
                    </DropdownList>
                  </Dropdown>
                </CardTitle>
                <CardBody className="pf-v6-u-p-lg">
                  <ResourceList
                    resources={[resourceGVKMapping['MCPServerRegistration']]}
                    columns={serverColumns}
                    namespace={watchNamespace}
                    emptyResourceName={t('MCP Servers')}
                    hideTypeFilter
                    additionalFilters={[
                      {
                        label: t('Status'),
                        allLabel: t('All statuses'),
                        options: [t('Online'), t('Offline')],
                        filterFn: (item, value) => {
                          const conditions =
                            (item as MCPServerRegistration).status?.conditions ?? [];
                          const isOnline = conditions.some(
                            (c) => c.type === 'Ready' && c.status === 'True',
                          );
                          return value === t('Online') ? isOnline : !isOnline;
                        },
                      },
                    ]}
                  />
                </CardBody>
              </Card>
            </GridItem>
          ) : (
            <GridItem>
              <Card>
                <CardBody className="pf-v6-u-p-lg">
                  <CardTitle>
                    <Title headingLevel="h2">{t('MCP Servers')}</Title>
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
                          {t('You do not have permission to view MCP Servers')}
                        </Content>
                      </EmptyStateBody>
                    </EmptyState>
                  </Bullseye>
                </CardBody>
              </Card>
            </GridItem>
          )}

          {referenceGrantRBAC.list ? (
            <GridItem>
              <Card>
                <CardTitle className="kuadrant-resource-create-container">
                  <Title headingLevel="h2">{t('Reference grants')}</Title>
                  {!referenceGrantRBAC.create || isAllNamespaces ? (
                    <Tooltip
                      content={
                        isAllNamespaces
                          ? t('Select a namespace to create a resource')
                          : t('You do not have permission to create a {{policyType}}', {
                              policyType: 'ReferenceGrant',
                            })
                      }
                    >
                      <Button className="kuadrant-overview-create-button" isAriaDisabled>
                        {t('Create ReferenceGrant')}
                      </Button>
                    </Tooltip>
                  ) : (
                    <Button
                      onClick={() => handleCreateResource('ReferenceGrant')}
                      className="kuadrant-overview-create-button"
                    >
                      {t('Create ReferenceGrant')}
                    </Button>
                  )}
                </CardTitle>
                <CardBody className="pf-v6-u-p-lg">
                  <ResourceList
                    resources={[resourceGVKMapping['ReferenceGrant']]}
                    columns={referenceGrantColumns}
                    namespace={watchNamespace}
                    emptyResourceName={t('Reference grants')}
                    hideTypeFilter
                  />
                </CardBody>
              </Card>
            </GridItem>
          ) : (
            <GridItem>
              <Card>
                <CardBody className="pf-v6-u-p-lg">
                  <CardTitle>
                    <Title headingLevel="h2">{t('Reference grants')}</Title>
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
                          {t('You do not have permission to view Reference grants')}
                        </Content>
                      </EmptyStateBody>
                    </EmptyState>
                  </Bullseye>
                </CardBody>
              </Card>
            </GridItem>
          )}

          {!cannotListAnyPolicy ? (
            <GridItem>
              <Card>
                <CardTitle className="kuadrant-resource-create-container">
                  <Title headingLevel="h2">
                    {t('Policies attached to MCP gateways or servers')}
                  </Title>
                  <Dropdown
                    isOpen={isPolicyCreateOpen}
                    onSelect={onPolicyCreateSelect}
                    onOpenChange={setIsPolicyCreateOpen}
                    toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                      <MenuToggle
                        ref={toggleRef}
                        onClick={() => setIsPolicyCreateOpen(!isPolicyCreateOpen)}
                        isExpanded={isPolicyCreateOpen}
                        variant="primary"
                        className="kuadrant-overview-create-button"
                      >
                        {t('Create Policy')}
                      </MenuToggle>
                    )}
                  >
                    <DropdownList className="kuadrant-overview-create-list pf-v6-u-p-0">
                      {mcpPolicies.map((policy) => {
                        const canCreate = policyRBAC[policy]?.create && !isAllNamespaces;
                        return canCreate ? (
                          <DropdownItem value={policy} key={policy}>
                            {t(policy)}
                          </DropdownItem>
                        ) : (
                          <Tooltip
                            key={policy}
                            content={
                              isAllNamespaces
                                ? t('Select a namespace to create a resource')
                                : t('You do not have permission to create a {{policyType}}', {
                                    policyType: policy,
                                  })
                            }
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
                <CardBody className="pf-v6-u-p-lg">
                  <ResourceList
                    resources={mcpPolicies
                      .filter((p) => policyRBAC[p]?.list)
                      .map((p) => resourceGVKMapping[p])}
                    columns={policyColumns}
                    namespace={watchNamespace}
                    emptyResourceName={t('Policies')}
                    dataFilter={policyDataFilter}
                  />
                </CardBody>
              </Card>
            </GridItem>
          ) : (
            <GridItem>
              <Card>
                <CardBody className="pf-v6-u-p-lg">
                  <CardTitle>
                    <Title headingLevel="h2">
                      {t('Policies attached to MCP gateways or servers')}
                    </Title>
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
          )}
        </Grid>
      </PageSection>
      <MCPRegistrationWizard isOpen={isWizardOpen} onClose={() => setIsWizardOpen(false)} />
    </>
  );
};

export default React.memo(MCPOverviewPage);
