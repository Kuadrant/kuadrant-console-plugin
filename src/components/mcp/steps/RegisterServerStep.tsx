import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, Tab, TabTitleText } from '@patternfly/react-core';
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
  const [activeTab, setActiveTab] = React.useState<'form' | 'yaml'>('form');
  const [yamlKey, setYamlKey] = React.useState(0);

  React.useEffect(() => {
    if (routeName && formState.targetHTTPRouteName !== routeName) {
      onChange({ ...formState, targetHTTPRouteName: routeName });
    }
  }, [routeName]); // eslint-disable-line -- only resync when routeName changes; re-running on formState/onChange would fight typing in other fields

  // Rebuilt from form state on every change so the YAML view is always current.
  const serverResource = React.useMemo(
    () => buildMCPServerRegistration(formState, formState.namespace, null, routeName),
    [formState, routeName],
  );

  const handleChange = (field: keyof MCPServerFormState, value: string) => {
    onChange({ ...formState, [field]: value });
  };

  // Parse YAML edits back into form state live. Invalid intermediate YAML is
  // ignored so typing in the editor doesn't clobber the form.
  const handleYamlChange = (yamlInput: string) => {
    try {
      const parsed = yaml.load(yamlInput) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') return;

      const metadata = parsed.metadata as Record<string, string> | undefined;
      const spec = parsed.spec as Record<string, unknown> | undefined;
      const targetRef = spec?.targetRef as Record<string, string> | undefined;

      onChange({
        registrationName: metadata?.name || '',
        namespace: metadata?.namespace || '',
        // When the wizard configured a route, keep it aligned — a YAML edit must not
        // retarget the registration at a route the wizard did not set up.
        targetHTTPRouteName: routeName || targetRef?.name || '',
        toolPrefix: typeof spec?.prefix === 'string' ? spec.prefix : '',
      });
    } catch {
      // Invalid YAML — don't update form state
    }
  };

  return (
    <>
      <Tabs
        activeKey={activeTab}
        onSelect={(_e, key) => {
          const view = key as 'form' | 'yaml';
          if (view === 'yaml') setYamlKey((k) => k + 1);
          setActiveTab(view);
        }}
        style={{ marginBottom: '16px' }}
      >
        <Tab eventKey="form" title={<TabTitleText>{t('Form')}</TabTitleText>} />
        <Tab eventKey="yaml" title={<TabTitleText>{t('YAML')}</TabTitleText>} />
      </Tabs>

      {activeTab === 'form' ? (
        <MCPServerRegistrationFormFields
          formState={formState}
          onChange={handleChange}
          httpRouteNames={routeName ? [routeName] : []}
          onValidationChange={onValidationChange}
        />
      ) : (
        <div
          className="kuadrant-mcp-wizard__yaml-editor"
          style={{ minHeight: '400px' }}
          key={yamlKey}
        >
          <React.Suspense fallback={<div>{t('Loading YAML editor...')}</div>}>
            <ResourceYAMLEditor
              initialResource={serverResource}
              onChange={handleYamlChange}
              create={true}
            />
          </React.Suspense>
        </div>
      )}
    </>
  );
};

export default RegisterServerStep;
