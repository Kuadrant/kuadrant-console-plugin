import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, Tab, TabTitleText } from '@patternfly/react-core';
import { ResourceYAMLEditor } from '@openshift-console/dynamic-plugin-sdk';
import * as yaml from 'js-yaml';
import { DestinationRuleFormState } from '../types';
import DestinationRuleFormFields from '../DestinationRuleFormFields';
import { buildDestinationRule, isDestinationRuleValid } from '../mcpResourceUtils';

interface DestinationRuleStepProps {
  formState: DestinationRuleFormState;
  onChange: (state: DestinationRuleFormState) => void;
  onValidationChange?: (isValid: boolean) => void;
}

const DestinationRuleStep: React.FC<DestinationRuleStepProps> = ({
  formState,
  onChange,
  onValidationChange,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeTab, setActiveTab] = React.useState<'form' | 'yaml'>('form');
  const [yamlKey, setYamlKey] = React.useState(0);

  // Rebuilt from form state on every change so the YAML view is always current.
  const destinationRuleResource = React.useMemo(
    () => buildDestinationRule(formState, formState.namespace),
    [formState],
  );

  const handleChange = (field: keyof DestinationRuleFormState, value: string) => {
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
      const trafficPolicy = spec?.trafficPolicy as Record<string, unknown> | undefined;
      const tls = trafficPolicy?.tls as Record<string, string> | undefined;

      const nextState = {
        destinationName: metadata?.name || '',
        namespace: metadata?.namespace || '',
        host: typeof spec?.host === 'string' ? spec.host : '',
        tlsMode: tls?.mode || 'SIMPLE',
        tlsSni: tls?.sni || '',
      };
      onChange(nextState);
      onValidationChange?.(isDestinationRuleValid(nextState));
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
        <DestinationRuleFormFields
          formState={formState}
          onChange={handleChange}
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
              initialResource={destinationRuleResource}
              onChange={handleYamlChange}
              create={true}
            />
          </React.Suspense>
        </div>
      )}
    </>
  );
};

export default DestinationRuleStep;
