import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Tabs, Tab, TabTitleText } from '@patternfly/react-core';
import { ResourceYAMLEditor } from '@openshift-console/dynamic-plugin-sdk';
import * as yaml from 'js-yaml';
import { MCPServerFormState } from '../types';
import MCPServerRegistrationFormFields from '../MCPServerRegistrationFormFields';
import { buildMCPServerRegistration } from '../mcpResourceUtils';

interface RegisterServerStepProps {
  formState: MCPServerFormState;
  onChange: (state: MCPServerFormState) => void;
  routeName?: string;
  onValidationChange?: (isValid: boolean) => void;
}

const RegisterServerStep: React.FC<RegisterServerStepProps> = ({
  formState,
  onChange,
  routeName,
  onValidationChange,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeTab, setActiveTab] = React.useState<string>('form');
  const [yamlContent, setYamlContent] = React.useState<unknown>(null);
  const [yamlError, setYamlError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (routeName && formState.targetHTTPRouteName !== routeName) {
      onChange({ ...formState, targetHTTPRouteName: routeName });
    }
  }, [routeName]); // eslint-disable-line -- only resync when routeName changes; re-running on formState/onChange would fight typing in other fields

  const handleChange = (field: keyof MCPServerFormState, value: string) => {
    onChange({ ...formState, [field]: value });
  };

  const populateFormFromYAML = (parsed: Record<string, unknown>) => {
    const metadata = parsed.metadata as Record<string, string> | undefined;
    const spec = parsed.spec as Record<string, unknown> | undefined;

    const newState: MCPServerFormState = {
      registrationName: metadata?.name || '',
      namespace: metadata?.namespace || '',
      targetHTTPRouteName: '',
      toolPrefix: '',
    };

    if (spec) {
      const targetRef = spec.targetRef as Record<string, string> | undefined;
      if (targetRef?.name) {
        newState.targetHTTPRouteName = targetRef.name;
      }
      if (typeof spec.prefix === 'string') {
        newState.toolPrefix = spec.prefix;
      }
    }

    if (JSON.stringify(newState) !== JSON.stringify(formState)) {
      onChange(newState);
    }
  };

  const parseYAMLToForm = (yamlInput: string) => {
    setYamlError(null);
    try {
      const parsed = yaml.load(yamlInput) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        populateFormFromYAML(parsed);
      }
    } catch (error: unknown) {
      const err = error as Error;
      setYamlError(err?.message || t('Invalid YAML'));
    }
  };

  const handleYAMLChange = (yamlInput: string) => {
    setYamlContent(yamlInput);
  };

  return (
    <Tabs
      activeKey={activeTab}
      onSelect={(_e, key) => {
        if (key === 'form' && activeTab === 'yaml') {
          if (yamlContent) {
            parseYAMLToForm(
              typeof yamlContent === 'string' ? yamlContent : JSON.stringify(yamlContent),
            );
          }
        } else if (key === 'yaml' && activeTab === 'form') {
          setYamlContent(
            buildMCPServerRegistration(formState, formState.namespace, null, routeName),
          );
          setYamlError(null);
        }
        setActiveTab(key as string);
      }}
    >
      <Tab eventKey="form" title={<TabTitleText>{t('Form')}</TabTitleText>}>
        <br />
        <MCPServerRegistrationFormFields
          formState={formState}
          onChange={handleChange}
          httpRouteNames={routeName ? [routeName] : []}
          onValidationChange={onValidationChange}
        />
      </Tab>

      <Tab eventKey="yaml" title={<TabTitleText>{t('YAML')}</TabTitleText>}>
        {yamlError && (
          <Alert variant="warning" isInline title={t('Invalid YAML')} className="pf-v6-u-mt-md">
            {yamlError}
          </Alert>
        )}
        <div className="kuadrant-mcp-wizard__yaml-editor">
          <React.Suspense fallback={<div />}>
            <ResourceYAMLEditor
              initialResource={yamlContent}
              onChange={handleYAMLChange}
              create={true}
            />
          </React.Suspense>
        </div>
      </Tab>
    </Tabs>
  );
};

export default RegisterServerStep;
