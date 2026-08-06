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

  // Build YAML resource from form state for the YAML editor
  const extensionResource = React.useMemo<MCPGatewayExtension>(() => {
    return {
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
  }, [formState, selectedNamespace]);

  // Handle YAML changes and sync back to form
  const handleYamlChange = (yamlInput: string) => {
    try {
      const parsed = yaml.load(yamlInput) as MCPGatewayExtension;
      if (parsed && typeof parsed === 'object') {
        updateFormState({
          extensionName: parsed.metadata?.name || '',
          extensionNamespace: parsed.metadata?.namespace || selectedNamespace,
          targetGateway: parsed.spec?.targetRef?.name || '',
          sectionName: parsed.spec?.targetRef?.sectionName || '',
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
        {t(
          'Define the MCP gateway extension that connects your gateway to MCP servers.',
        )}
      </Content>

      <Tabs
        activeKey={createView}
        onSelect={(_event, tabIndex) => setCreateView(tabIndex as 'form' | 'yaml')}
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
        </Form>
      ) : (
        <div className="kuadrant-mcp-yaml-editor" style={{ minHeight: '400px' }} key={JSON.stringify(extensionResource)}>
          <React.Suspense fallback={<div>{t('Loading YAML editor...')}</div>}>
            <ResourceYAMLEditor
              initialResource={extensionResource}
              onChange={handleYamlChange}
            />
          </React.Suspense>
        </div>
      )}
    </>
  );
};

export default MCPExtensionStep;
