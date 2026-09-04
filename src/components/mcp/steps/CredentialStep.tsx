import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, Tab, TabTitleText } from '@patternfly/react-core';
import { ResourceYAMLEditor } from '@openshift-console/dynamic-plugin-sdk';
import * as yaml from 'js-yaml';
import { CredentialFormState } from '../types';
import CredentialFormFields from '../CredentialFormFields';
import {
  buildCredentialSecret,
  CREDENTIAL_SECRET_KEY,
  isCredentialValid,
} from '../mcpResourceUtils';

interface CredentialStepProps {
  formState: CredentialFormState;
  onChange: (state: CredentialFormState) => void;
  onValidationChange?: (isValid: boolean) => void;
}

const CredentialStep: React.FC<CredentialStepProps> = ({
  formState,
  onChange,
  onValidationChange,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeTab, setActiveTab] = React.useState<'form' | 'yaml'>('form');
  const [yamlKey, setYamlKey] = React.useState(0);

  // Rebuilt from form state on every change so the YAML view is always current.
  const credentialResource = React.useMemo(
    () => buildCredentialSecret(formState, formState.namespace),
    [formState],
  );

  const handleChange = (field: keyof CredentialFormState, value: string) => {
    onChange({ ...formState, [field]: value });
  };

  // Parse YAML edits back into form state live. Invalid intermediate YAML is
  // ignored so typing in the editor doesn't clobber the form.
  const handleYamlChange = (yamlInput: string) => {
    try {
      const parsed = yaml.load(yamlInput) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') return;

      const metadata = parsed.metadata as Record<string, string> | undefined;
      const stringData = parsed.stringData as Record<string, string> | undefined;

      const nextState = {
        credentialName: metadata?.name || '',
        namespace: metadata?.namespace || '',
        type: (parsed.type as string) || 'Opaque',
        tokenString: stringData?.[CREDENTIAL_SECRET_KEY] || '',
      };
      onChange(nextState);
      onValidationChange?.(isCredentialValid(nextState));
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
        <CredentialFormFields
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
              initialResource={credentialResource}
              onChange={handleYamlChange}
              create={true}
            />
          </React.Suspense>
        </div>
      )}
    </>
  );
};

export default CredentialStep;
