import * as React from 'react';
import {
  Title,
  Content,
  Form,
  FormGroup,
  TextInput,
  FormSelect,
  FormSelectOption,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Tabs,
  Tab,
  TabTitleText,
  ExpandableSection,
  Switch,
} from '@patternfly/react-core';
import { ResourceYAMLEditor } from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import * as yaml from 'js-yaml';
import { MCPWizardFormState, MCPGatewayExtension } from './types';
import '../css/gateway-api-plugin.css';
import { GatewayResource } from '../gateway/types';

interface MCPExtensionStepProps {
  formState: MCPWizardFormState;
  updateFormState: (updates: Partial<MCPWizardFormState>) => void;
  selectedGateway?: GatewayResource;
  selectedNamespace: string;
}

const MCPExtensionStep: React.FC<MCPExtensionStepProps> = ({
  formState,
  updateFormState,
  selectedGateway,
  selectedNamespace,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');
  const [yamlKey, setYamlKey] = React.useState(0);

  // Build YAML resource from form state for the YAML editor
  const extensionResource = React.useMemo<MCPGatewayExtension>(() => {
    const resource: MCPGatewayExtension = {
      apiVersion: 'mcp.kuadrant.io/v1alpha1',
      kind: 'MCPGatewayExtension',
      metadata: {
        name: formState.extensionName || '',
        namespace: formState.extensionNamespace || selectedNamespace,
      },
      spec: {
        targetRef: {
          group: 'gateway.networking.k8s.io',
          kind: 'Gateway',
          name: formState.targetGateway || '',
          namespace: formState.selectedGatewayNamespace || selectedNamespace,
          sectionName: formState.sectionName || '',
        },
      },
    };
    if (formState.overrideHostnames && resource.spec) {
      if (formState.publicHost) resource.spec.publicHost = formState.publicHost;
      if (formState.privateHost) resource.spec.privateHost = formState.privateHost;
    }
    if (formState.sessionStorageEnabled && formState.sessionStoreSecretName && resource.spec) {
      resource.spec.sessionStore = { secretName: formState.sessionStoreSecretName };
    }
    if (formState.oauthEnabled && formState.oauthAuthorizationServers && resource.spec) {
      resource.spec.oauthProtectedResource = {
        authorizationServers: formState.oauthAuthorizationServers
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        ...(formState.oauthResourceName ? { resourceName: formState.oauthResourceName } : {}),
      };
    }
    return resource;
  }, [formState, selectedNamespace]);

  // Handle YAML changes and sync back to form
  const handleYamlChange = (yamlInput: string) => {
    try {
      const parsed = yaml.load(yamlInput) as MCPGatewayExtension;
      if (parsed && typeof parsed === 'object') {
        const hasPublicHost = !!parsed.spec?.publicHost;
        const hasPrivateHost = !!parsed.spec?.privateHost;
        const hasSessionStore = !!parsed.spec?.sessionStore?.secretName;
        const hasOauth = !!parsed.spec?.oauthProtectedResource?.authorizationServers?.length;

        updateFormState({
          extensionName: parsed.metadata?.name || '',
          extensionNamespace: parsed.metadata?.namespace || selectedNamespace,
          targetGateway: parsed.spec?.targetRef?.name || '',
          sectionName: parsed.spec?.targetRef?.sectionName || '',
          overrideHostnames: hasPublicHost || hasPrivateHost,
          publicHost: parsed.spec?.publicHost || '',
          privateHost: parsed.spec?.privateHost || '',
          sessionStorageEnabled: hasSessionStore,
          sessionStoreSecretName: parsed.spec?.sessionStore?.secretName || '',
          oauthEnabled: hasOauth,
          oauthAuthorizationServers:
            parsed.spec?.oauthProtectedResource?.authorizationServers?.join(', ') || '',
          oauthResourceName: parsed.spec?.oauthProtectedResource?.resourceName || '',
        });
      }
    } catch {
      // Invalid YAML — don't update form state
    }
  };

  // Get listener names from the selected gateway
  const listenerNames = React.useMemo(() => {
    if (!selectedGateway?.spec?.listeners) return [];
    return selectedGateway.spec.listeners.map((l) => l.name);
  }, [selectedGateway]);

  return (
    <>
      <Title headingLevel="h2" style={{ marginBottom: '16px' }}>
        {t('Configure MCP Extension')}
      </Title>
      <Content component="p" style={{ marginBottom: '16px' }}>
        {t('Define the MCP gateway extension that connects your gateway to MCP servers.')}
      </Content>

      <Tabs
        activeKey={createView}
        onSelect={(_event, tabIndex) => {
          const view = tabIndex as 'form' | 'yaml';
          if (view === 'yaml') setYamlKey((k) => k + 1);
          setCreateView(view);
        }}
        style={{ marginBottom: '16px' }}
      >
        <Tab eventKey="form" title={<TabTitleText>{t('Form')}</TabTitleText>} />
        <Tab eventKey="yaml" title={<TabTitleText>{t('YAML')}</TabTitleText>} />
      </Tabs>

      {createView === 'form' ? (
        <Form>
          <FormGroup label={t('Name')} isRequired fieldId="extension-name">
            <TextInput
              type="text"
              id="extension-name"
              value={formState.extensionName}
              onChange={(_event, value) => updateFormState({ extensionName: value })}
              isRequired
              placeholder={t('Enter extension name')}
              data-test="mcp-extension-name"
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  {t('A unique name for the MCP gateway extension resource.')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label={t('Namespace')} fieldId="extension-namespace">
            <TextInput
              type="text"
              id="extension-namespace"
              value={formState.extensionNamespace}
              onChange={(_event, value) => updateFormState({ extensionNamespace: value })}
              placeholder={selectedNamespace}
              data-test="mcp-extension-namespace"
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  {t(
                    'The namespace for the extension. If different from the gateway namespace, a ReferenceGrant will be created.',
                  )}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label={t('Target Gateway')} isRequired fieldId="target-gateway">
            <TextInput
              type="text"
              id="target-gateway"
              value={formState.targetGateway}
              onChange={(_event, value) => updateFormState({ targetGateway: value })}
              isRequired
              placeholder={t('Enter target gateway name')}
              data-test="mcp-target-gateway"
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  {t('The name of the gateway this extension targets.')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label={t('Listener name')} isRequired fieldId="section-name">
            {listenerNames.length > 0 ? (
              <FormSelect
                id="section-name"
                value={formState.sectionName}
                onChange={(_event, value) => updateFormState({ sectionName: value })}
                aria-label={t('Select a listener')}
                data-test="mcp-section-name"
              >
                <FormSelectOption value="" label={t('Select a listener...')} isPlaceholder />
                {listenerNames.map((name) => (
                  <FormSelectOption key={name} value={name} label={name} />
                ))}
              </FormSelect>
            ) : (
              <TextInput
                type="text"
                id="section-name"
                value={formState.sectionName}
                onChange={(_event, value) => updateFormState({ sectionName: value })}
                isRequired
                placeholder={t('Enter listener name')}
                data-test="mcp-section-name-input"
              />
            )}
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  {t('The name of the gateway listener to use for MCP traffic.')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <ExpandableSection toggleText={t('Advanced broker settings')}>
            <FormGroup fieldId="override-hostnames">
              <Switch
                id="override-hostnames"
                label={t('Override hostnames')}
                isChecked={formState.overrideHostnames}
                onChange={(_event, checked) => updateFormState({ overrideHostnames: checked })}
                data-test="mcp-override-hostnames"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {t(
                      'Override the public and private hostnames derived from the gateway listener.',
                    )}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            {formState.overrideHostnames && (
              <>
                <FormGroup label={t('Public host')} fieldId="public-host">
                  <TextInput
                    type="text"
                    id="public-host"
                    value={formState.publicHost}
                    onChange={(_event, value) => updateFormState({ publicHost: value })}
                    placeholder={t('e.g. mcp.example.com')}
                    data-test="mcp-public-host"
                  />
                </FormGroup>
                <FormGroup label={t('Private host')} fieldId="private-host">
                  <TextInput
                    type="text"
                    id="private-host"
                    value={formState.privateHost}
                    onChange={(_event, value) => updateFormState({ privateHost: value })}
                    placeholder={t('e.g. mcp-internal.svc.cluster.local')}
                    data-test="mcp-private-host"
                  />
                </FormGroup>
              </>
            )}

            <FormGroup fieldId="session-storage">
              <Switch
                id="session-storage"
                label={t('Session storage')}
                isChecked={formState.sessionStorageEnabled}
                onChange={(_event, checked) => updateFormState({ sessionStorageEnabled: checked })}
                data-test="mcp-session-storage"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {t(
                      'Use Redis-based session storage instead of in-memory. The secret must contain a CACHE_CONNECTION_STRING key.',
                    )}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            {formState.sessionStorageEnabled && (
              <FormGroup label={t('Secret name')} fieldId="session-store-secret" isRequired>
                <TextInput
                  type="text"
                  id="session-store-secret"
                  value={formState.sessionStoreSecretName}
                  onChange={(_event, value) => updateFormState({ sessionStoreSecretName: value })}
                  isRequired
                  placeholder={t('e.g. redis-session-secret')}
                  data-test="mcp-session-store-secret"
                />
              </FormGroup>
            )}

            <FormGroup fieldId="oauth-metadata">
              <Switch
                id="oauth-metadata"
                label={t('OAuth protected resource')}
                isChecked={formState.oauthEnabled}
                onChange={(_event, checked) => updateFormState({ oauthEnabled: checked })}
                data-test="mcp-oauth-enabled"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {t(
                      'Serve OAuth protected resource metadata at /.well-known/oauth-protected-resource.',
                    )}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            {formState.oauthEnabled && (
              <>
                <FormGroup
                  label={t('Authorization servers')}
                  fieldId="oauth-auth-servers"
                  isRequired
                >
                  <TextInput
                    type="text"
                    id="oauth-auth-servers"
                    value={formState.oauthAuthorizationServers}
                    onChange={(_event, value) =>
                      updateFormState({ oauthAuthorizationServers: value })
                    }
                    isRequired
                    placeholder={t('e.g. https://auth.example.com')}
                    data-test="mcp-oauth-auth-servers"
                  />
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>
                        {t('Comma-separated list of OAuth authorization server URLs.')}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
                <FormGroup label={t('Resource name')} fieldId="oauth-resource-name">
                  <TextInput
                    type="text"
                    id="oauth-resource-name"
                    value={formState.oauthResourceName}
                    onChange={(_event, value) => updateFormState({ oauthResourceName: value })}
                    placeholder={t('e.g. MCP Server')}
                    data-test="mcp-oauth-resource-name"
                  />
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>
                        {t('Human-readable name for this protected resource.')}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
              </>
            )}
          </ExpandableSection>
        </Form>
      ) : (
        <div className="kuadrant-mcp-yaml-editor" style={{ minHeight: '400px' }} key={yamlKey}>
          <React.Suspense fallback={<div>{t('Loading YAML editor...')}</div>}>
            <ResourceYAMLEditor initialResource={extensionResource} onChange={handleYamlChange} />
          </React.Suspense>
        </div>
      )}
    </>
  );
};

export default MCPExtensionStep;
