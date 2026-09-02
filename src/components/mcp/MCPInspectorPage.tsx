import * as React from 'react';
import Helmet from 'react-helmet';
import { useTranslation } from 'react-i18next';
import {
  PageSection,
  Title,
  Content,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Button,
  Alert,
  Stack,
  StackItem,
  EmptyState,
  EmptyStateBody,
  Tab,
  Tabs,
  TabTitleText,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  TextInput,
  Card,
  CardBody,
  Grid,
  GridItem,
  Icon,
} from '@patternfly/react-core';
import {
  CircleIcon,
  ExchangeAltIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  LockOpenIcon,
  ShieldAltIcon,
} from '@patternfly/react-icons';
import {
  NamespaceBar,
  useActiveNamespace,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { RESOURCES } from '../../utils/resources';
import { MCPGatewayExtension, MCPServerRegistration } from './types';
import {
  MCPClient,
  MCPPrompt,
  MCPRpcError,
  MCPSessionExpiredError,
  MCPUnauthorizedError,
  MCPTool,
  PromptsGetResult,
  ToolsCallResult,
  MCPCallExchange,
} from '../../utils/mcp/client';
import MCPToolWorkspace from './MCPToolWorkspace';
import MCPInspectorOutput from './MCPInspectorOutput';
import MCPPromptWorkspace from './MCPPromptWorkspace';
import MCPPromptOutput from './MCPPromptOutput';
import { toolServerNameResolver } from '../../utils/mcp/serverNames';
import './MCPInspectorPage.css';

const ALL_NS = '#ALL_NS#';

const isReady = (ext: MCPGatewayExtension): boolean =>
  (ext.status?.conditions ?? []).some((c) => c.type === 'Ready' && c.status === 'True');

const extKey = (ext: MCPGatewayExtension): string =>
  `${ext.metadata?.namespace}/${ext.metadata?.name}`;

type PromptSupport = 'ok' | 'unsupported' | 'failed';

// a gateway without prompt support answers prompts/list with a json-rpc
// method-not-found. neither that nor a transport failure should block a
// tools-only session, so the outcome is reported instead of thrown.
const listPrompts = async (
  client: MCPClient,
): Promise<{ prompts: MCPPrompt[]; support: PromptSupport; error: string }> => {
  try {
    const listed = await client.promptsList();
    return { prompts: listed.prompts ?? [], support: 'ok', error: '' };
  } catch (err) {
    if (err instanceof MCPRpcError && err.code === -32601) {
      return { prompts: [], support: 'unsupported', error: '' };
    }
    return {
      prompts: [],
      support: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

const proxyEndpoint = (ext: MCPGatewayExtension): string =>
  `/api/proxy/plugin/kuadrant-console-plugin/backend/api/mcp/v1/mcpgatewayextensions/${encodeURIComponent(
    ext.metadata?.namespace ?? '',
  )}/${encodeURIComponent(ext.metadata?.name ?? '')}`;

const MCPInspectorPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();
  const resolvedNamespace = activeNamespace === ALL_NS ? undefined : activeNamespace;

  const [extensions, extensionsLoaded] = useK8sWatchResource<MCPGatewayExtension[]>({
    groupVersionKind: RESOURCES.MCPGatewayExtension.gvk,
    isList: true,
    namespace: resolvedNamespace,
  });
  // cluster-wide on purpose: a gateway aggregates registrations from any
  // namespace, and the registration prefix is what names the server for a tool.
  const [registrations] = useK8sWatchResource<MCPServerRegistration[]>({
    groupVersionKind: RESOURCES.MCPServerRegistration.gvk,
    isList: true,
  });
  const serverNameFor = React.useMemo(() => toolServerNameResolver(registrations), [registrations]);

  const [selectedKey, setSelectedKey] = React.useState('');
  const [bearerToken, setBearerToken] = React.useState('');
  const [authChallenge, setAuthChallenge] = React.useState<string | null>(null);
  const [authRejected, setAuthRejected] = React.useState(false);

  // session id lives in react state and on the client instance only, never localStorage.
  const clientRef = React.useRef<MCPClient | null>(null);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [authMode, setAuthMode] = React.useState<'none' | 'bearer'>('none');
  const [activeSection, setActiveSection] = React.useState<string | number>(0);
  const [tools, setTools] = React.useState<MCPTool[]>([]);
  const [prompts, setPrompts] = React.useState<MCPPrompt[]>([]);
  const [promptSupport, setPromptSupport] = React.useState<PromptSupport>('ok');
  const [promptError, setPromptError] = React.useState('');

  const [callExchange, setCallExchange] = React.useState<MCPCallExchange<ToolsCallResult> | null>(
    null,
  );
  const [promptExchange, setPromptExchange] =
    React.useState<MCPCallExchange<PromptsGetResult> | null>(null);
  const [stats, setStats] = React.useState({ requests: 0, warnings: 0, errors: 0 });

  const [connecting, setConnecting] = React.useState(false);
  const [calling, setCalling] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [refreshingTools, setRefreshingTools] = React.useState(false);
  const [refreshingPrompts, setRefreshingPrompts] = React.useState(false);
  const [error, setError] = React.useState('');
  const [sessionExpired, setSessionExpired] = React.useState(false);

  const list = React.useMemo(() => extensions ?? [], [extensions]);
  const selected = React.useMemo(
    () => list.find((ext) => extKey(ext) === selectedKey),
    [list, selectedKey],
  );
  const endpoint = selected?.spec.publicHost ?? '';

  // a gateway change or a newer connect invalidates any attempt still in
  // flight, so a slow gateway cannot land its session under the one now selected
  const connectAttempt = React.useRef(0);

  const openSession = async (inspectorEndpoint: string, bearer?: string) => {
    const client = new MCPClient(inspectorEndpoint, { token: bearer || undefined });
    const id = await client.initialize();
    await client.sendInitialized();
    const listed = await client.toolsList();
    const promptState = await listPrompts(client);
    return { client, id, tools: listed.tools ?? [], promptState };
  };

  const handleConnect = async (inspectorEndpoint: string, bearer?: string) => {
    if (!inspectorEndpoint) {
      return;
    }
    const attempt = ++connectAttempt.current;
    const isCurrent = () => attempt === connectAttempt.current;
    setError('');
    setSessionExpired(false);
    setTools([]);
    setPrompts([]);
    setCallExchange(null);
    setPromptExchange(null);
    setConnecting(true);
    try {
      const session = await openSession(inspectorEndpoint, bearer);
      if (!isCurrent()) {
        return;
      }
      clientRef.current = session.client;
      setSessionId(session.id);
      setConnected(true);
      setTools(session.tools);
      setPrompts(session.promptState.prompts);
      setPromptSupport(session.promptState.support);
      setPromptError(session.promptState.error);
      setAuthMode(bearer ? 'bearer' : 'none');
      setAuthChallenge(null);
      setAuthRejected(false);
    } catch (err) {
      if (!isCurrent()) {
        return;
      }
      clientRef.current = null;
      setSessionId(null);
      setConnected(false);
      if (err instanceof MCPUnauthorizedError) {
        setError('');
        if (bearer) {
          setAuthRejected(true);
        } else {
          setAuthChallenge(inspectorEndpoint);
          setAuthRejected(false);
        }
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (isCurrent()) {
        setConnecting(false);
      }
    }
  };

  const handleGatewayChange = (_event: React.FormEvent<HTMLSelectElement>, value: string) => {
    setSelectedKey(value);
    connectAttempt.current += 1;
    setConnecting(false);
    setCalling(false);
    setGenerating(false);
    setRefreshingTools(false);
    setRefreshingPrompts(false);
    clientRef.current = null;
    setSessionId(null);
    setConnected(false);
    setAuthMode('none');
    setActiveSection(0);
    setTools([]);
    setPrompts([]);
    setPromptSupport('ok');
    setPromptError('');
    setCallExchange(null);
    setPromptExchange(null);
    setStats({ requests: 0, warnings: 0, errors: 0 });
    setError('');
    setSessionExpired(false);
    setAuthChallenge(null);
    setBearerToken('');
    setAuthRejected(false);
    if (!value) {
      return;
    }
    const extension = list.find((item) => extKey(item) === value);
    if (extension && isReady(extension)) {
      void handleConnect(proxyEndpoint(extension));
    }
  };

  const handleBearerConnect = () => {
    if (!authChallenge || !bearerToken.trim()) {
      return;
    }
    setAuthRejected(false);
    void handleConnect(authChallenge, bearerToken.trim());
  };

  // session expiry is recoverable, anything else the client throws is an error
  const recordFailure = (err: unknown) => {
    const expired = err instanceof MCPSessionExpiredError;
    setStats((current) => ({
      requests: current.requests + 1,
      warnings: current.warnings + (expired ? 1 : 0),
      errors: current.errors + (expired ? 0 : 1),
    }));
  };

  // an operation belongs to the session it started on. once the gateway
  // changes, its result, failure and busy flag must not reach the new session.
  const runOnSession = async <T,>(
    setBusy: (busy: boolean) => void,
    operation: (client: MCPClient) => Promise<T>,
    onResult: (result: T) => void,
    onStart?: () => void,
  ) => {
    const client = clientRef.current;
    if (!client) {
      return;
    }
    const attempt = connectAttempt.current;
    const isCurrent = () => attempt === connectAttempt.current;
    setError('');
    setSessionExpired(false);
    setBusy(true);
    onStart?.();
    try {
      const result = await operation(client);
      if (isCurrent()) {
        onResult(result);
      }
    } catch (err) {
      if (!isCurrent()) {
        return;
      }
      recordFailure(err);
      if (err instanceof MCPSessionExpiredError) {
        setSessionExpired(true);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (isCurrent()) {
        setBusy(false);
      }
    }
  };

  const handleCall = (
    toolName: string,
    args: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ) =>
    runOnSession(
      setCalling,
      (client) =>
        metadata
          ? client.toolsCallWithDetails(toolName, args, metadata)
          : client.toolsCallWithDetails(toolName, args),
      (exchange) => {
        setCallExchange(exchange);
        // isError is the tool reporting a failed run, not a transport failure
        setStats((current) => ({
          ...current,
          requests: current.requests + 1,
          warnings: current.warnings + (exchange.result.isError ? 1 : 0),
        }));
      },
      () => setCallExchange(null),
    );

  const handleGenerate = (promptName: string, args: Record<string, string>) =>
    runOnSession(
      setGenerating,
      (client) => client.promptsGetWithDetails(promptName, args),
      (exchange) => {
        setPromptExchange(exchange);
        setStats((current) => ({ ...current, requests: current.requests + 1 }));
      },
      () => setPromptExchange(null),
    );

  const handleRefreshPrompts = () =>
    runOnSession(
      setRefreshingPrompts,
      (client) => client.promptsList(),
      (listed) => {
        setPrompts(listed.prompts ?? []);
        setPromptSupport('ok');
        setPromptError('');
        setStats((current) => ({ ...current, requests: current.requests + 1 }));
      },
    );

  const handleRefreshTools = () =>
    runOnSession(
      setRefreshingTools,
      (client) => client.toolsList(),
      (listed) => {
        setTools(listed.tools ?? []);
        setStats((current) => ({ ...current, requests: current.requests + 1 }));
      },
    );

  return (
    <>
      <Helmet>
        <title>{t('MCP Inspector')}</title>
      </Helmet>
      <NamespaceBar />
      <PageSection className="kuadrant-mcp-inspector-page">
        <Stack hasGutter>
          <StackItem>
            <Title headingLevel="h1">{t('MCP Inspector')}</Title>
          </StackItem>

          <StackItem>
            <Card className="kuadrant-mcp-inspector-page__connection-card">
              <CardBody>
                <Grid>
                  <GridItem md={4} className="kuadrant-mcp-inspector-page__connection-segment">
                    <Form>
                      <FormGroup label={t('Gateway')} fieldId="mcp-inspector-extension">
                        <FormSelect
                          id="mcp-inspector-extension"
                          value={selectedKey}
                          onChange={handleGatewayChange}
                          aria-label={t('Select an MCP gateway extension')}
                          isDisabled={!extensionsLoaded}
                        >
                          <FormSelectOption
                            value=""
                            label={
                              !extensionsLoaded
                                ? t('Loading extensions...')
                                : t('Select an extension...')
                            }
                            isPlaceholder
                          />
                          {list.map((ext) => {
                            const reachable = isReady(ext);
                            const name = `${ext.metadata?.name} (${ext.metadata?.namespace})`;
                            return (
                              <FormSelectOption
                                key={extKey(ext)}
                                value={extKey(ext)}
                                label={reachable ? name : `${name} — ${t('not reachable')}`}
                                isDisabled={!reachable}
                              />
                            );
                          })}
                        </FormSelect>
                      </FormGroup>
                    </Form>
                    {endpoint && (
                      <Content component="small" className="kuadrant-mcp-inspector-page__endpoint">
                        {endpoint}
                      </Content>
                    )}
                  </GridItem>
                  <GridItem md={4} className="kuadrant-mcp-inspector-page__connection-segment">
                    <Content component="p" className="kuadrant-mcp-inspector-page__segment-title">
                      {t('Connection')}
                    </Content>
                    <div className="kuadrant-mcp-inspector-page__connection-status">
                      <span className="kuadrant-mcp-inspector-page__stat">
                        <Icon
                          isInline
                          isInProgress={connecting}
                          status={connected ? 'success' : 'danger'}
                        >
                          <CircleIcon aria-hidden="true" />
                        </Icon>
                        {connecting
                          ? t('Connecting...')
                          : connected
                          ? t('Connected')
                          : t('No connection')}
                      </span>
                      {connected && (
                        <span className="kuadrant-mcp-inspector-page__stat">
                          <Icon isInline status={authMode === 'bearer' ? 'success' : undefined}>
                            {authMode === 'bearer' ? (
                              <ShieldAltIcon aria-hidden="true" />
                            ) : (
                              <LockOpenIcon aria-hidden="true" />
                            )}
                          </Icon>
                          {authMode === 'none' ? t('No authentication') : t('Authenticated')}
                        </span>
                      )}
                    </div>
                    {sessionId && (
                      <Content
                        component="small"
                        className="kuadrant-mcp-inspector-page__session-id"
                      >
                        {t('Session ID')}: <code>{sessionId}</code>
                      </Content>
                    )}
                  </GridItem>
                  <GridItem md={4} className="kuadrant-mcp-inspector-page__connection-segment">
                    <Content component="p" className="kuadrant-mcp-inspector-page__segment-title">
                      {t('Status')}
                    </Content>
                    <div className="kuadrant-mcp-inspector-page__session-status">
                      <span className="kuadrant-mcp-inspector-page__stat">
                        <Icon isInline>
                          <ExchangeAltIcon aria-hidden="true" />
                        </Icon>
                        {stats.requests} {stats.requests === 1 ? t('request') : t('requests')}
                      </span>
                      <span className="kuadrant-mcp-inspector-page__stat">
                        <Icon isInline status="warning">
                          <ExclamationTriangleIcon aria-hidden="true" />
                        </Icon>
                        {stats.warnings} {stats.warnings === 1 ? t('warning') : t('warnings')}
                      </span>
                      <span className="kuadrant-mcp-inspector-page__stat">
                        <Icon isInline status="danger">
                          <ExclamationCircleIcon aria-hidden="true" />
                        </Icon>
                        {stats.errors} {stats.errors === 1 ? t('error') : t('errors')}
                      </span>
                    </div>
                  </GridItem>
                </Grid>
              </CardBody>
            </Card>
          </StackItem>

          {!selectedKey && extensionsLoaded && (
            <StackItem>
              <EmptyState headingLevel="h2" titleText={t('No connection')}>
                <EmptyStateBody>
                  {t('Connect to a Gateway to view the MCP server tools available.')}
                </EmptyStateBody>
              </EmptyState>
            </StackItem>
          )}

          {error && (
            <StackItem>
              <Alert variant="danger" isInline title={t('Request failed')}>
                {error}
              </Alert>
            </StackItem>
          )}

          {sessionExpired && (
            <StackItem>
              <Alert variant="warning" isInline title={t('Session expired, reconnect')}>
                {t('The MCP session is no longer valid. Connect again to start a new session.')}
              </Alert>
            </StackItem>
          )}

          {connected && (
            <StackItem>
              <Tabs
                activeKey={activeSection}
                onSelect={(_event, key) => setActiveSection(key)}
                aria-label={t('MCP inspector sections')}
              >
                <Tab eventKey={0} title={<TabTitleText>{t('Tools')}</TabTitleText>} />
                <Tab eventKey={1} title={<TabTitleText>{t('Prompts')}</TabTitleText>} />
                <Tab eventKey={2} title={<TabTitleText>{t('Logs')}</TabTitleText>} />
              </Tabs>
              {activeSection === 0 && (
                <Stack hasGutter className="kuadrant-mcp-inspector-page__section">
                  <StackItem>
                    <Alert
                      variant="warning"
                      isInline
                      isPlain
                      title={t(
                        'Running tools executes live server-side code and can change your infrastructure.',
                      )}
                      className="kuadrant-mcp-inspector-page__section-alert"
                    />
                  </StackItem>
                  <StackItem>
                    <Grid hasGutter>
                      <GridItem md={6}>
                        <MCPToolWorkspace
                          tools={tools}
                          isRunning={calling}
                          isRefreshing={refreshingTools}
                          onRefresh={handleRefreshTools}
                          onRun={handleCall}
                          serverNameFor={serverNameFor}
                        />
                      </GridItem>
                      <GridItem md={6}>
                        <MCPInspectorOutput exchange={callExchange} />
                      </GridItem>
                    </Grid>
                  </StackItem>
                </Stack>
              )}
              {activeSection === 1 && (
                <Stack hasGutter className="kuadrant-mcp-inspector-page__section">
                  <StackItem>
                    <Alert
                      variant="info"
                      isInline
                      isPlain
                      title={t(
                        'Generating prompts creates text templates only and does not execute commands.',
                      )}
                      className="kuadrant-mcp-inspector-page__section-alert"
                    />
                  </StackItem>
                  {promptSupport === 'failed' && (
                    <StackItem>
                      <Alert variant="danger" isInline title={t('Prompts unavailable')}>
                        {promptError}
                      </Alert>
                    </StackItem>
                  )}
                  <StackItem>
                    {promptSupport === 'unsupported' ? (
                      <EmptyState headingLevel="h2" titleText={t('No prompts')}>
                        <EmptyStateBody>
                          {t('This gateway does not expose prompts.')}
                        </EmptyStateBody>
                      </EmptyState>
                    ) : (
                      <Grid hasGutter>
                        <GridItem md={6}>
                          <MCPPromptWorkspace
                            prompts={prompts}
                            isGenerating={generating}
                            isRefreshing={refreshingPrompts}
                            onRefresh={handleRefreshPrompts}
                            onGenerate={handleGenerate}
                            serverNameFor={serverNameFor}
                          />
                        </GridItem>
                        <GridItem md={6}>
                          <MCPPromptOutput exchange={promptExchange} />
                        </GridItem>
                      </Grid>
                    )}
                  </StackItem>
                </Stack>
              )}
              {activeSection === 2 && (
                <EmptyState headingLevel="h2" titleText={t('Logs')}>
                  <EmptyStateBody>{t('Session logs are not available yet.')}</EmptyStateBody>
                </EmptyState>
              )}
            </StackItem>
          )}
        </Stack>
      </PageSection>
      <Modal
        isOpen={!!authChallenge}
        onClose={() => {
          setAuthChallenge(null);
          setAuthRejected(false);
        }}
        variant={ModalVariant.small}
        aria-labelledby="mcp-inspector-auth-title"
      >
        <ModalHeader title={t('Authentication required')} labelId="mcp-inspector-auth-title" />
        <ModalBody>
          <Stack hasGutter>
            <StackItem>
              <Content component="p">
                {t(
                  'This MCP gateway requires authentication. Provide a bearer token for the MCP gateway.',
                )}
              </Content>
            </StackItem>
            {authRejected && (
              <StackItem>
                <Alert variant="danger" isInline isPlain title={t('Invalid bearer token')}>
                  {t('The gateway rejected this token. Check it and try again.')}
                </Alert>
              </StackItem>
            )}
            <StackItem>
              <FormGroup label={t('Bearer token')} fieldId="mcp-inspector-bearer-token">
                <TextInput
                  id="mcp-inspector-bearer-token"
                  type="password"
                  value={bearerToken}
                  onChange={(_event, value) => {
                    setBearerToken(value);
                    setAuthRejected(false);
                  }}
                  aria-label={t('Bearer token')}
                  placeholder={t('Held in memory only')}
                />
              </FormGroup>
            </StackItem>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={handleBearerConnect}
            isDisabled={!bearerToken.trim() || connecting}
            isLoading={connecting}
          >
            {t('Connect with bearer token')}
          </Button>
          <Button
            variant="link"
            onClick={() => {
              setAuthChallenge(null);
              setAuthRejected(false);
            }}
          >
            {t('Cancel')}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default MCPInspectorPage;
