import * as React from 'react';
import { useParams, useNavigate } from 'react-router-dom-v5-compat';
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
  Content,
  Flex,
  FlexItem,
} from '@patternfly/react-core';
import { ExternalLinkAltIcon, EllipsisVIcon, LockIcon, ListIcon } from '@patternfly/react-icons';
import {
  NamespaceBar,
  K8sResourceCommon,
  ResourceLink,
  TableData,
  useK8sWatchResource,
  GreenCheckCircleIcon,
  YellowExclamationTriangleIcon,
} from '@openshift-console/dynamic-plugin-sdk';
import { sortable } from '@patternfly/react-table';
import '../kuadrant.css';
import ResourceList from '../ResourceList';
import { useKuadrantNamespaceChange } from '../../hooks/useKuadrantNamespaceChange';
import { EXTERNAL_LINKS } from '../../constants/links';
import { RESOURCES, resourceGVKMapping } from '../../utils/resources';
import useAccessReviews from '../../utils/resourceRBAC';
import { getResourceNameFromKind } from '../../utils/getModelFromResource';
import { GatewayResource } from '../gateway/types';
import { MCPGatewayExtension, MCPServerRegistration } from './types';

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

export type MenuToggleElement = HTMLDivElement | HTMLButtonElement;

const mcpPolicies = ['AuthPolicy', 'RateLimitPolicy', 'TLSPolicy', 'DNSPolicy'];

const MCPOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const { ns } = useParams<{ ns: string }>();
  const { handleNamespaceChange, activeNamespace } = useKuadrantNamespaceChange('/mcp/overview');

  const [isPolicyCreateOpen, setIsPolicyCreateOpen] = React.useState(false);
  const [isGettingStartedMenuOpen, setIsGettingStartedMenuOpen] = React.useState(false);
  const [hideCard, setHideCard] = React.useState(
    sessionStorage.getItem('hideMCPGettingStarted') === 'true',
  );

  const watchNamespace = ns || activeNamespace;
  const resolvedNamespace = watchNamespace === '#ALL_NS#' ? undefined : watchNamespace;

  const [extensions] = useK8sWatchResource<MCPGatewayExtension[]>({
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

  const policyRBACNil = mcpPolicies.every((p) => !policyRBAC[p]?.list);

  const handleCreateResource = (resource: string) => {
    const createNamespace = watchNamespace === '#ALL_NS#' ? 'default' : watchNamespace;
    const gvk = resourceGVKMapping[resource];
    navigate(`/k8s/ns/${createNamespace}/${gvk.group}~${gvk.version}~${gvk.kind}/~new`);
  };

  const onPolicyCreateSelect = (
    _event: React.MouseEvent<Element, MouseEvent>,
    policyType: string,
  ) => {
    const createNamespace = watchNamespace === '#ALL_NS#' ? 'default' : watchNamespace;
    const gvk = resourceGVKMapping[policyType];
    navigate(`/k8s/ns/${createNamespace}/${gvk.group}~${gvk.version}~${gvk.kind}/~new`);
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
        transforms: [sortable],
      },
      {
        title: t('Gateway name'),
        id: 'gatewayName',
        sort: 'spec.targetRef.name',
        transforms: [sortable],
      },
      {
        title: t('Namespace'),
        id: 'namespace',
        sort: 'metadata.namespace',
        transforms: [sortable],
      },
      {
        title: t('Reference Grant'),
        id: 'referenceGrant',
        sort: 'metadata.name',
        transforms: [sortable],
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
      gatewayName: (column, obj: K8sResourceCommon, activeColumnIDs) => {
        const ext = obj as MCPGatewayExtension;
        const gwName = ext.spec?.targetRef?.name;
        const gwNamespace = ext.spec?.targetRef?.namespace || ext.metadata?.namespace;
        return (
          <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
            {gwName ? (
              <ResourceLink
                groupVersionKind={RESOURCES.Gateway.gvk}
                name={gwName}
                namespace={gwNamespace}
              />
            ) : (
              '-'
            )}
          </TableData>
        );
      },
      referenceGrant: (column, obj: K8sResourceCommon, activeColumnIDs) => {
        return (
          <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
            -
          </TableData>
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
        transforms: [sortable],
      },
      {
        title: t('Namespace'),
        id: 'namespace',
        sort: 'metadata.namespace',
        transforms: [sortable],
      },
      {
        title: t('Status'),
        id: 'Status',
        sort: 'status.conditions',
        transforms: [sortable],
      },
      {
        title: t('Details'),
        id: 'details',
      },
      {
        title: '',
        id: 'kebab',
        props: { className: 'pf-v6-c-table__action' },
      },
    ],
    [t],
  );

  const serverRenderers = React.useMemo(
    () => ({
      details: (column, obj: K8sResourceCommon, activeColumnIDs) => {
        return (
          <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
            -
          </TableData>
        );
      },
    }),
    [],
  );

  const referenceGrantColumns = React.useMemo(
    () => [
      {
        title: t('Grant name'),
        id: 'name',
        sort: 'metadata.name',
        transforms: [sortable],
      },
      {
        title: t('Namespace mapped to'),
        id: 'namespace',
        sort: 'metadata.namespace',
        transforms: [sortable],
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
        transforms: [sortable],
      },
      {
        title: t('Type'),
        id: 'type',
        sort: 'kind',
        transforms: [sortable],
      },
      {
        title: t('Namespace'),
        id: 'namespace',
        sort: 'metadata.namespace',
        transforms: [sortable],
      },
      {
        title: t('Status'),
        id: 'Status',
        sort: 'status.conditions',
        transforms: [sortable],
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
    return <div>{t('Loading Permissions...')}</div>;
  }

  return (
    <>
      <Helmet>
        <title>{t('MCP management overview')}</title>
      </Helmet>
      <NamespaceBar onNamespaceChange={handleNamespaceChange} />
      <PageSection className="kuadrant-mcp-overview-page">
        <Title headingLevel="h1" style={{ marginBottom: '1rem' }}>
          {t('MCP management overview')}
        </Title>
        <Divider style={{ marginTop: '0.5rem', marginBottom: '1rem' }} />
        <Grid hasGutter>
          {!hideCard && (
            <GridItem style={{ marginTop: '8px' }}>
              <Alert
                variant="info"
                isInline
                style={{ borderWidth: '1px' }}
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
                <Title headingLevel="h2" size="md" style={{ textAlign: 'center', marginBottom: '2rem' }}>{t('MCP Gateways')}</Title>
                <CardBody className="pf-u-p-10">
                  <Flex
                    justifyContent={{ default: 'justifyContentSpaceAround' }}
                    alignItems={{ default: 'alignItemsCenter' }}
                  >
                    <FlexItem>
                      <Flex
                        direction={{ default: 'column' }}
                        alignItems={{ default: 'alignItemsCenter' }}
                      >
                        <strong style={{ fontSize: '1.3rem' }}>{mcpGateways.length}</strong>
                        <span>{t('Total')}</span>
                      </Flex>
                    </FlexItem>
                    <FlexItem>
                      <Flex
                        direction={{ default: 'column' }}
                        alignItems={{ default: 'alignItemsCenter' }}
                      >
                        <strong style={{ fontSize: '1.3rem' }}>
                          <GreenCheckCircleIcon size="md" />{' '}
                          <span style={{ margin: '5px' }}>{mcpGatewayHealthyCount}</span>
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
                        <strong style={{ fontSize: '1.3rem' }}>
                          <YellowExclamationTriangleIcon size="md" />{' '}
                          <span style={{ margin: '5px' }}>{mcpGatewayUnhealthyCount}</span>
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
              </CardTitle>
            </Card>
          </GridItem>

          <GridItem lg={6}>
            <Card>
              <CardTitle>
                <Title headingLevel="h2" size="md" style={{ textAlign: 'center', marginBottom: '2rem' }}>{t('MCP Servers')}</Title>
                <CardBody className="pf-u-p-10">
                  <Flex
                    justifyContent={{ default: 'justifyContentSpaceAround' }}
                    alignItems={{ default: 'alignItemsCenter' }}
                  >
                    <FlexItem>
                      <Flex
                        direction={{ default: 'column' }}
                        alignItems={{ default: 'alignItemsCenter' }}
                      >
                        <strong style={{ fontSize: '1.3rem' }}>
                          <ListIcon size="md" />{' '}
                          <span style={{ margin: '5px' }}>{mcpServerTypesCount}</span>
                        </strong>
                        <span>{t('Types')}</span>
                      </Flex>
                    </FlexItem>
                    <FlexItem>
                      <Flex
                        direction={{ default: 'column' }}
                        alignItems={{ default: 'alignItemsCenter' }}
                      >
                        <strong style={{ fontSize: '1.3rem' }}>{servers?.length || 0}</strong>
                        <span>{t('Total')}</span>
                      </Flex>
                    </FlexItem>
                    <FlexItem>
                      <Flex
                        direction={{ default: 'column' }}
                        alignItems={{ default: 'alignItemsCenter' }}
                      >
                        <strong style={{ fontSize: '1.3rem' }}>
                          <GreenCheckCircleIcon size="md" />{' '}
                          <span style={{ margin: '5px' }}>{mcpServerOnlineCount}</span>
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
                        <strong style={{ fontSize: '1.3rem' }}>
                          <YellowExclamationTriangleIcon size="md" />{' '}
                          <span style={{ margin: '5px' }}>{mcpServerOfflineCount}</span>
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
              </CardTitle>
            </Card>
          </GridItem>

          {extensionRBAC.list ? (
            <GridItem>
              <Card>
                <CardTitle className="kuadrant-resource-create-container">
                  <Title headingLevel="h2">{t('MCP Gateway Extensions')}</Title>
                  {!extensionRBAC.create ? (
                    <Tooltip content={t('You do not have permission to create a {{policyType}}', { policyType: 'MCPGatewayExtension' })}>
                      <Button className="kuadrant-overview-create-button" isAriaDisabled>
                        {t('Create extension')}
                      </Button>
                    </Tooltip>
                  ) : (
                    <Button
                      onClick={() => handleCreateResource('MCPGatewayExtension')}
                      className="kuadrant-overview-create-button"
                    >
                      {t('Create extension')}
                    </Button>
                  )}
                </CardTitle>
                <CardBody className="pf-u-p-10">
                  <ResourceList
                    resources={[resourceGVKMapping['MCPGatewayExtension']]}
                    columns={extensionColumns}
                    renderers={extensionRenderers}
                    namespace={watchNamespace}
                    emptyResourceName={t('MCP Gateway Extensions')}
                  />
                </CardBody>
              </Card>
            </GridItem>
          ) : (
            <GridItem>
              <Card>
                <CardBody className="pf-u-p-10">
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
                  <Tooltip content={t('Register MCP Server is not available yet')}>
                    <Button className="kuadrant-overview-create-button" isAriaDisabled>
                      {t('Register MCP Server')}
                    </Button>
                  </Tooltip>
                </CardTitle>
                <CardBody className="pf-u-p-10">
                  <ResourceList
                    resources={[resourceGVKMapping['MCPServerRegistration']]}
                    columns={serverColumns}
                    renderers={serverRenderers}
                    namespace={watchNamespace}
                    emptyResourceName={t('MCP Servers')}
                  />
                </CardBody>
              </Card>
            </GridItem>
          ) : (
            <GridItem>
              <Card>
                <CardBody className="pf-u-p-10">
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
                  {!referenceGrantRBAC.create ? (
                    <Tooltip content={t('You do not have permission to create a {{policyType}}', { policyType: 'ReferenceGrant' })}>
                      <Button className="kuadrant-overview-create-button" isAriaDisabled>
                        {t('Create reference grant')}
                      </Button>
                    </Tooltip>
                  ) : (
                    <Button
                      onClick={() => handleCreateResource('ReferenceGrant')}
                      className="kuadrant-overview-create-button"
                    >
                      {t('Create reference grant')}
                    </Button>
                  )}
                </CardTitle>
                <CardBody className="pf-u-p-10">
                  <ResourceList
                    resources={[resourceGVKMapping['ReferenceGrant']]}
                    columns={referenceGrantColumns}
                    namespace={watchNamespace}
                    emptyResourceName={t('Reference grants')}
                  />
                </CardBody>
              </Card>
            </GridItem>
          ) : (
            <GridItem>
              <Card>
                <CardBody className="pf-u-p-10">
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

          {!policyRBACNil ? (
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
                        {t('Create policy')}
                      </MenuToggle>
                    )}
                  >
                    <DropdownList className="kuadrant-overview-create-list pf-u-p-0">
                      {mcpPolicies.map((policy) => {
                        const canCreate = policyRBAC[policy]?.create;
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
                      resourceGVKMapping['RateLimitPolicy'],
                      resourceGVKMapping['TLSPolicy'],
                      resourceGVKMapping['DNSPolicy'],
                    ]}
                    columns={policyColumns}
                    namespace={watchNamespace}
                    emptyResourceName={t('Policies')}
                  />
                </CardBody>
              </Card>
            </GridItem>
          ) : (
            <GridItem>
              <Card>
                <CardBody className="pf-u-p-10">
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
    </>
  );
};

export default React.memo(MCPOverviewPage);
