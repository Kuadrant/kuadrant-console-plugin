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
} from '@patternfly/react-core';
import {
  NamespaceBar,
  useActiveNamespace,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { RESOURCES } from '../../utils/resources';
import { MCPGatewayExtension } from './types';
import {
  MCPClient,
  MCPSessionExpiredError,
  MCPUnauthorizedError,
  MCPTool,
  ToolsCallResult,
  MCPCallExchange,
} from '../../utils/mcp/client';
import MCPToolWorkspace from './MCPToolWorkspace';
import MCPInspectorOutput from './MCPInspectorOutput';
import './MCPInspectorPage.css';

const ALL_NS = '#ALL_NS#';

const isReady = (ext: MCPGatewayExtension): boolean =>
  (ext.status?.conditions ?? []).some((c) => c.type === 'Ready' && c.status === 'True');

const extKey = (ext: MCPGatewayExtension): string =>
  `${ext.metadata?.namespace}/${ext.metadata?.name}`;

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

  const [selectedKey, setSelectedKey] = React.useState('');
  const [bearerToken, setBearerToken] = React.useState('');
  const [authChallenge, setAuthChallenge] = React.useState<{
    proxyEndpoint: string;
    selectedKey: string;
    wwwAuthenticate: string | null;
  } | null>(null);

  // session id lives in react state and on the client instance only, never localStorage.
  const clientRef = React.useRef<MCPClient | null>(null);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [authMode, setAuthMode] = React.useState<'none' | 'bearer'>('none');
  const [activeSection, setActiveSection] = React.useState<string | number>(0);
  const [tools, setTools] = React.useState<MCPTool[]>([]);

  const [callExchange, setCallExchange] = React.useState<MCPCallExchange<ToolsCallResult> | null>(
    null,
  );
  const [stats, setStats] = React.useState({
    calls: 0,
    succeeded: 0,
    failed: 0,
    totalDurationMs: 0,
  });

  const [connecting, setConnecting] = React.useState(false);
  const [calling, setCalling] = React.useState(false);
  const [refreshingTools, setRefreshingTools] = React.useState(false);
  const [error, setError] = React.useState('');
  const [sessionExpired, setSessionExpired] = React.useState(false);

  const list = React.useMemo(() => extensions ?? [], [extensions]);
  const selected = React.useMemo(
    () => list.find((ext) => extKey(ext) === selectedKey),
    [list, selectedKey],
  );
  const endpoint = selected?.spec.publicHost ?? '';

  const runSession = async (inspectorEndpoint: string, bearer?: string) => {
    setError('');
    setSessionExpired(false);
    setTools([]);
    setCallExchange(null);
    const client = new MCPClient(inspectorEndpoint, { token: bearer || undefined });
    const { sessionId: id } = await client.initialize();
    await client.sendInitialized();
    const listed = await client.toolsList();
    clientRef.current = client;
    setSessionId(id);
    setConnected(true);
    setTools(listed.tools ?? []);
  };

  const handleConnect = async (
    inspectorEndpoint: string,
    selectedExtensionKey = selectedKey,
    bearer?: string,
  ) => {
    if (!inspectorEndpoint) {
      return;
    }
    setConnecting(true);
    try {
      await runSession(inspectorEndpoint, bearer);
      setAuthMode(bearer ? 'bearer' : 'none');
      setAuthChallenge(null);
    } catch (err) {
      clientRef.current = null;
      setSessionId(null);
      setConnected(false);
      if (err instanceof MCPUnauthorizedError && !bearer) {
        setError('');
        setAuthChallenge({
          proxyEndpoint: inspectorEndpoint,
          selectedKey: selectedExtensionKey,
          wwwAuthenticate: err.wwwAuthenticate,
        });
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleGatewayChange = (_event: React.FormEvent<HTMLSelectElement>, value: string) => {
    setSelectedKey(value);
    clientRef.current = null;
    setSessionId(null);
    setConnected(false);
    setAuthMode('none');
    setActiveSection(0);
    setTools([]);
    setCallExchange(null);
    setStats({ calls: 0, succeeded: 0, failed: 0, totalDurationMs: 0 });
    setError('');
    setSessionExpired(false);
    setAuthChallenge(null);
    setBearerToken('');
    if (!value) {
      return;
    }
    const extension = list.find((item) => extKey(item) === value);
    if (extension && isReady(extension)) {
      void handleConnect(proxyEndpoint(extension), value);
    }
  };

  const handleBearerConnect = () => {
    if (!authChallenge || !bearerToken.trim()) {
      return;
    }
    void handleConnect(authChallenge.proxyEndpoint, authChallenge.selectedKey, bearerToken.trim());
  };

  const handleCall = async (
    toolName: string,
    args: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ) => {
    const client = clientRef.current;
    if (!client) {
      return;
    }
    setError('');
    setSessionExpired(false);
    setCalling(true);
    setCallExchange(null);
    const startedAt = Date.now();
    try {
      const exchange = metadata
        ? await client.toolsCallWithDetails(toolName, args, metadata)
        : await client.toolsCallWithDetails(toolName, args);
      setCallExchange(exchange);
      setStats((current) => ({
        calls: current.calls + 1,
        succeeded: current.succeeded + (exchange.result.isError ? 0 : 1),
        failed: current.failed + (exchange.result.isError ? 1 : 0),
        totalDurationMs: current.totalDurationMs + exchange.durationMs,
      }));
    } catch (err) {
      setStats((current) => ({
        ...current,
        calls: current.calls + 1,
        failed: current.failed + 1,
        totalDurationMs: current.totalDurationMs + (Date.now() - startedAt),
      }));
      if (err instanceof MCPSessionExpiredError) {
        setSessionExpired(true);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setCalling(false);
    }
  };

  const handleRefreshTools = async () => {
    const client = clientRef.current;
    if (!client) {
      return;
    }
    setRefreshingTools(true);
    setError('');
    setSessionExpired(false);
    try {
      const listed = await client.toolsList();
      setTools(listed.tools ?? []);
    } catch (err) {
      if (err instanceof MCPSessionExpiredError) {
        setSessionExpired(true);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setRefreshingTools(false);
    }
  };

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
                      <span
                        className={`kuadrant-mcp-inspector-page__status-dot ${
                          connected ? 'is-connected' : ''
                        }`}
                      />
                      <span>
                        {connecting
                          ? t('Connecting...')
                          : connected
                          ? t('Connected')
                          : t('No connection')}
                      </span>
                      {connected && (
                        <span>
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
                      <span>
                        {stats.calls} {stats.calls === 1 ? t('request') : t('requests')}
                      </span>
                      <span>
                        {sessionExpired ? 1 : 0} {t('warnings')}
                      </span>
                      <span>
                        {stats.failed} {t('errors')}
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
                      className="kuadrant-mcp-inspector-page__tool-warning"
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
                <EmptyState headingLevel="h2" titleText={t('Prompts')}>
                  <EmptyStateBody>{t('Prompt inspection is not available yet.')}</EmptyStateBody>
                </EmptyState>
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
        onClose={() => setAuthChallenge(null)}
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
            <StackItem>
              <FormGroup label={t('Bearer token')} fieldId="mcp-inspector-bearer-token">
                <TextInput
                  id="mcp-inspector-bearer-token"
                  type="password"
                  value={bearerToken}
                  onChange={(_event, value) => setBearerToken(value)}
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
          <Button variant="link" onClick={() => setAuthChallenge(null)}>
            {t('Cancel')}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default MCPInspectorPage;
