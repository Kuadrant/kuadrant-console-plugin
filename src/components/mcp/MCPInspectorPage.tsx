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
  TextInput,
  TextArea,
  Button,
  Alert,
  Stack,
  StackItem,
  Divider,
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
  MCPTool,
  InitializeResult,
  ToolsListResult,
  ToolsCallResult,
} from '../../utils/mcp/client';

const ALL_NS = '#ALL_NS#';

const preStyle: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflow: 'auto',
  maxHeight: '20rem',
  padding: 'var(--pf-t--global--spacer--md, 1rem)',
  background: 'var(--pf-t--global--background--color--secondary--default, #f5f5f5)',
  borderRadius: 'var(--pf-t--global--border--radius--small, 4px)',
};

const isReady = (ext: MCPGatewayExtension): boolean =>
  (ext.status?.conditions ?? []).some((c) => c.type === 'Ready' && c.status === 'True');

const extKey = (ext: MCPGatewayExtension): string =>
  `${ext.metadata?.namespace}/${ext.metadata?.name}`;

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
  const [token, setToken] = React.useState('');

  // session id lives in react state and on the client instance only, never localStorage.
  const clientRef = React.useRef<MCPClient | null>(null);
  const [sessionId, setSessionId] = React.useState<string | null>(null);

  const [initResult, setInitResult] = React.useState<InitializeResult | null>(null);
  const [toolsResult, setToolsResult] = React.useState<ToolsListResult | null>(null);
  const [tools, setTools] = React.useState<MCPTool[]>([]);

  const [selectedTool, setSelectedTool] = React.useState('');
  const [argsText, setArgsText] = React.useState('{}');
  const [callResult, setCallResult] = React.useState<ToolsCallResult | null>(null);

  const [connecting, setConnecting] = React.useState(false);
  const [calling, setCalling] = React.useState(false);
  const [error, setError] = React.useState('');
  const [sessionExpired, setSessionExpired] = React.useState(false);

  const list = React.useMemo(() => extensions ?? [], [extensions]);
  const selected = React.useMemo(
    () => list.find((ext) => extKey(ext) === selectedKey),
    [list, selectedKey],
  );
  const endpoint = selected?.status?.mcpEndpoint ?? '';
  const origin = window.location.origin;

  const handleConnect = async () => {
    if (!endpoint) {
      return;
    }
    setError('');
    setSessionExpired(false);
    setConnecting(true);
    setInitResult(null);
    setToolsResult(null);
    setTools([]);
    setSelectedTool('');
    setCallResult(null);
    try {
      const client = new MCPClient(endpoint, { token: token || undefined });
      const { result, sessionId: id } = await client.initialize();
      await client.sendInitialized();
      const listed = await client.toolsList();
      clientRef.current = client;
      setSessionId(id);
      setInitResult(result);
      setToolsResult(listed);
      setTools(listed.tools ?? []);
    } catch (err) {
      clientRef.current = null;
      setSessionId(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  };

  const handleCall = async () => {
    const client = clientRef.current;
    if (!client || !selectedTool) {
      return;
    }
    let parsedArgs: Record<string, unknown>;
    try {
      parsedArgs = argsText.trim() === '' ? {} : JSON.parse(argsText);
    } catch {
      setError(t('Arguments must be valid JSON'));
      return;
    }
    setError('');
    setSessionExpired(false);
    setCalling(true);
    setCallResult(null);
    try {
      const result = await client.toolsCall(selectedTool, parsedArgs);
      setCallResult(result);
    } catch (err) {
      if (err instanceof MCPSessionExpiredError) {
        setSessionExpired(true);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setCalling(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{t('MCP Inspector')}</title>
      </Helmet>
      <NamespaceBar />
      <PageSection>
        <Stack hasGutter>
          <StackItem>
            <Title headingLevel="h1">{t('MCP Inspector')}</Title>
            <Content component="p">
              {t(
                'Throwaway proof-of-concept: the browser speaks MCP Streamable HTTP directly to a gateway endpoint. Calls are cross-origin.',
              )}
            </Content>
            <Content component="small">
              {t('Browser origin')}: <code>{origin}</code>
            </Content>
          </StackItem>

          <StackItem>
            <Form>
              <FormGroup label={t('MCP gateway extension')} fieldId="mcp-inspector-extension">
                <FormSelect
                  id="mcp-inspector-extension"
                  value={selectedKey}
                  onChange={(_event, value) => setSelectedKey(value)}
                  aria-label={t('Select an MCP gateway extension')}
                  isDisabled={!extensionsLoaded}
                >
                  <FormSelectOption
                    value=""
                    label={
                      !extensionsLoaded ? t('Loading extensions...') : t('Select an extension...')
                    }
                    isPlaceholder
                  />
                  {list.map((ext) => {
                    const reachable = !!ext.status?.mcpEndpoint && isReady(ext);
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

              <FormGroup label={t('Resolved endpoint')} fieldId="mcp-inspector-endpoint">
                <Content component="small">
                  <code>{endpoint || t('none')}</code>
                </Content>
              </FormGroup>

              <FormGroup label={t('Bearer token (optional)')} fieldId="mcp-inspector-token">
                <TextInput
                  id="mcp-inspector-token"
                  type="password"
                  value={token}
                  onChange={(_event, value) => setToken(value)}
                  placeholder={t('Held in memory only')}
                />
              </FormGroup>

              <StackItem>
                <Button
                  variant="primary"
                  onClick={handleConnect}
                  isDisabled={!endpoint || connecting}
                  isLoading={connecting}
                >
                  {t('Connect + list tools')}
                </Button>
              </StackItem>
            </Form>
          </StackItem>

          {sessionId && (
            <StackItem>
              <Content component="small">
                {t('Session ID')}: <code>{sessionId}</code>
              </Content>
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

          {initResult && (
            <StackItem>
              <Title headingLevel="h2">{t('initialize')}</Title>
              <pre style={preStyle}>{JSON.stringify(initResult, null, 2)}</pre>
            </StackItem>
          )}

          {toolsResult && (
            <StackItem>
              <Title headingLevel="h2">{t('tools/list')}</Title>
              <pre style={preStyle}>{JSON.stringify(toolsResult, null, 2)}</pre>
            </StackItem>
          )}

          {tools.length > 0 && (
            <>
              <StackItem>
                <Divider />
              </StackItem>
              <StackItem>
                <Title headingLevel="h2">{t('Call a tool')}</Title>
                <Form>
                  <FormGroup label={t('Tool')} fieldId="mcp-inspector-tool">
                    <FormSelect
                      id="mcp-inspector-tool"
                      value={selectedTool}
                      onChange={(_event, value) => setSelectedTool(value)}
                      aria-label={t('Select a tool')}
                    >
                      <FormSelectOption value="" label={t('Select a tool...')} isPlaceholder />
                      {tools.map((tool) => (
                        <FormSelectOption key={tool.name} value={tool.name} label={tool.name} />
                      ))}
                    </FormSelect>
                  </FormGroup>
                  <FormGroup label={t('Arguments (JSON)')} fieldId="mcp-inspector-args">
                    <TextArea
                      id="mcp-inspector-args"
                      value={argsText}
                      onChange={(_event, value) => setArgsText(value)}
                      rows={6}
                      aria-label={t('Tool call arguments as JSON')}
                    />
                  </FormGroup>
                  <StackItem>
                    <Button
                      variant="secondary"
                      onClick={handleCall}
                      isDisabled={!selectedTool || calling}
                      isLoading={calling}
                    >
                      {t('Call')}
                    </Button>
                  </StackItem>
                </Form>
              </StackItem>
            </>
          )}

          {callResult && (
            <StackItem>
              <Title headingLevel="h2">{t('tools/call result')}</Title>
              <pre style={preStyle}>{JSON.stringify(callResult, null, 2)}</pre>
            </StackItem>
          )}
        </Stack>
      </PageSection>
    </>
  );
};

export default MCPInspectorPage;
