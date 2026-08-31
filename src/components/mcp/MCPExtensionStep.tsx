import * as React from 'react';
import { Title, Content, Tabs, Tab, TabTitleText } from '@patternfly/react-core';
import { ResourceYAMLEditor } from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import * as yaml from 'js-yaml';
import { MCPWizardFormState, MCPGatewayExtension } from './types';
import {
  buildMCPGatewayExtension,
  getMCPGatewayExtensionValidationError,
} from './mcpResourceUtils';
import MCPExtensionFormFields from './MCPExtensionFormFields';
import '../css/gateway-api-plugin.css';
import { GatewayResource } from '../gateway/types';

interface MCPExtensionStepProps {
  formState: MCPWizardFormState;
  updateFormState: (updates: Partial<MCPWizardFormState>) => void;
  selectedGateway?: GatewayResource;
  selectedNamespace: string;
  onValidationChange?: (isValid: boolean) => void;
}

const MCPExtensionStep: React.FC<MCPExtensionStepProps> = ({
  formState,
  updateFormState,
  selectedGateway,
  selectedNamespace,
  onValidationChange,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');
  const [yamlKey, setYamlKey] = React.useState(0);

  // Build YAML resource from form state for the YAML editor
  const extensionResource = React.useMemo<MCPGatewayExtension>(
    () => buildMCPGatewayExtension(formState, selectedNamespace),
    [formState, selectedNamespace],
  );
  const validationError = getMCPGatewayExtensionValidationError(formState, selectedGateway);

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
          httpRouteManagementEnabled: parsed.spec?.httpRouteManagement !== 'Disabled',
        });
      }
    } catch {
      // Invalid YAML — don't update form state
    }
  };

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
        <>
          <MCPExtensionFormFields
            formState={formState}
            updateFormState={updateFormState}
            selectedGateway={selectedGateway}
            selectedNamespace={selectedNamespace}
            validationError={validationError}
            onValidationChange={onValidationChange}
          />
        </>
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
