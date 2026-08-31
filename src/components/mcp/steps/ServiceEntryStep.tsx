import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, Tab, TabTitleText } from '@patternfly/react-core';
import { ResourceYAMLEditor } from '@openshift-console/dynamic-plugin-sdk';
import * as yaml from 'js-yaml';
import { ServiceEntryFormState } from '../types';
import ServiceEntryFormFields from '../ServiceEntryFormFields';
import { buildServiceEntry } from '../mcpResourceUtils';

interface ServiceEntryStepProps {
  formState: ServiceEntryFormState;
  onChange: (state: ServiceEntryFormState) => void;
  onValidationChange?: (isValid: boolean) => void;
}

const ServiceEntryStep: React.FC<ServiceEntryStepProps> = ({
  formState,
  onChange,
  onValidationChange,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeTab, setActiveTab] = React.useState<'form' | 'yaml'>('form');
  const [yamlKey, setYamlKey] = React.useState(0);

  // Rebuilt from form state on every change so the YAML view is always current.
  const serviceEntryResource = React.useMemo(
    () => buildServiceEntry(formState, formState.namespace),
    [formState],
  );

  const handleChange = (field: keyof ServiceEntryFormState, value: string) => {
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
      const ports = spec?.ports as Array<{ number: number; protocol: string }> | undefined;
      const hosts = spec?.hosts as string[] | undefined;

      onChange({
        serviceName: metadata?.name || '',
        namespace: metadata?.namespace || '',
        hosts: hosts?.length ? hosts.join(', ') : '',
        port: ports?.length ? String(ports[0].number) : '',
        protocol: ports?.length ? ports[0].protocol : 'HTTPS',
        location: typeof spec?.location === 'string' ? spec.location : 'MESH_EXTERNAL',
        resolution: typeof spec?.resolution === 'string' ? spec.resolution : 'DNS',
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
        <ServiceEntryFormFields
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
              initialResource={serviceEntryResource}
              onChange={handleYamlChange}
              create={true}
            />
          </React.Suspense>
        </div>
      )}
    </>
  );
};

export default ServiceEntryStep;
