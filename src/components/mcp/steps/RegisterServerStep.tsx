import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Form,
  FormGroup,
  Grid,
  TextInput,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Popover,
  FormSelect,
  FormSelectOption,
  Tabs,
  Tab,
  TabTitleText,
} from '@patternfly/react-core';
import { HelpIcon } from '@patternfly/react-icons';
import {
  K8sResourceCommon,
  ResourceYAMLEditor,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import * as yaml from 'js-yaml';
import { MCPServerFormState } from '../types';
import { RESOURCES } from '../../../utils/resources';

interface RegisterServerStepProps {
  formState: MCPServerFormState;
  onChange: (state: MCPServerFormState) => void;
  routeName?: string;
}

export const buildMCPServerYAML = (
  state: MCPServerFormState,
  routeName?: string,
): K8sResourceCommon => {
  return {
    apiVersion: `${RESOURCES.MCPServerRegistration.gvk.group}/${RESOURCES.MCPServerRegistration.gvk.version}`,
    kind: RESOURCES.MCPServerRegistration.gvk.kind,
    metadata: {
      name: state.registrationName || '',
      namespace: state.namespace || '',
    },
    spec: {
      targetRef: {
        group: 'gateway.networking.k8s.io',
        kind: 'HTTPRoute',
        name: state.targetHTTPRouteName || routeName || '',
      },
      prefix: state.toolPrefix || '',
    },
  } as K8sResourceCommon;
};

const RegisterServerStep: React.FC<RegisterServerStepProps> = ({
  formState,
  onChange,
  routeName,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeTab, setActiveTab] = React.useState<string>('form');
  const [yamlContent, setYamlContent] = React.useState<unknown>(null);
  const [yamlError, setYamlError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!formState.targetHTTPRouteName && routeName) {
      onChange({ ...formState, targetHTTPRouteName: routeName });
    }
  }, [routeName]); // eslint-disable-line -- only sync on initial population; re-running on formState/onChange would overwrite user edits

  const [namespaces] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: { group: '', version: 'v1', kind: 'Namespace' },
    isList: true,
  });

  const namespaceOptions = React.useMemo(() => {
    if (!namespaces) return [];
    return namespaces
      .map((ns) => ns.metadata?.name || '')
      .filter(Boolean)
      .sort();
  }, [namespaces]);

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
          setYamlContent(buildMCPServerYAML(formState, routeName));
          setYamlError(null);
        }
        setActiveTab(key as string);
      }}
    >
      <Tab eventKey="form" title={<TabTitleText>{t('Form')}</TabTitleText>}>
        <br />
        <Form>
          <Grid hasGutter md={6}>
            <FormGroup
              label={t('Registration name')}
              isRequired
              fieldId="registration-name"
              labelHelp={
                <Popover
                  bodyContent={t('A unique lowercase name for the MCP server registration.')}
                >
                  <button
                    type="button"
                    aria-label={t('More info for registration name')}
                    className="pf-v6-c-form__group-label-help"
                  >
                    <HelpIcon />
                  </button>
                </Popover>
              }
            >
              <TextInput
                id="registration-name"
                value={formState.registrationName}
                onChange={(_e, val) => handleChange('registrationName', val)}
                placeholder={t('my-mcp-server-name')}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {t('A unique lowercase name for the MCP server registration.')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>

            <FormGroup
              label={t('Namespace')}
              isRequired
              fieldId="server-namespace"
              labelHelp={
                <Popover
                  bodyContent={t(
                    'The Kubernetes namespace where the gateway infrastructure will be deployed.',
                  )}
                >
                  <button
                    type="button"
                    aria-label={t('More info for namespace')}
                    className="pf-v6-c-form__group-label-help"
                  >
                    <HelpIcon />
                  </button>
                </Popover>
              }
            >
              <FormSelect
                id="server-namespace"
                value={formState.namespace}
                onChange={(_e, val) => handleChange('namespace', val)}
                aria-label={t('Select namespace')}
              >
                <FormSelectOption value="" label={t('None selected')} />
                {namespaceOptions.map((ns) => (
                  <FormSelectOption key={ns} value={ns} label={ns} />
                ))}
              </FormSelect>
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {t(
                      'The Kubernetes namespace where the gateway infrastructure will be deployed.',
                    )}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          </Grid>

          <Grid hasGutter md={6}>
            <FormGroup
              label={t('Target HTTPRoute name')}
              fieldId="target-httproute"
              labelHelp={
                <Popover
                  bodyContent={t('The HTTPRoute that this MCP server registration targets.')}
                >
                  <button
                    type="button"
                    aria-label={t('More info for target HTTPRoute')}
                    className="pf-v6-c-form__group-label-help"
                  >
                    <HelpIcon />
                  </button>
                </Popover>
              }
            >
              <FormSelect
                id="target-httproute"
                value={formState.targetHTTPRouteName}
                onChange={(_e, val) => handleChange('targetHTTPRouteName', val)}
                aria-label={t('Select target HTTPRoute')}
              >
                <FormSelectOption value="" label={t('Select...')} />
                {routeName && <FormSelectOption value={routeName} label={routeName} />}
              </FormSelect>
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {t('The HTTPRoute that this MCP server registration targets.')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>

            <FormGroup
              label={t('Tool prefix')}
              isRequired
              fieldId="tool-prefix"
              labelHelp={
                <Popover
                  bodyContent={t('A prefix applied to all tools exposed by this MCP server.')}
                >
                  <button
                    type="button"
                    aria-label={t('More info for tool prefix')}
                    className="pf-v6-c-form__group-label-help"
                  >
                    <HelpIcon />
                  </button>
                </Popover>
              }
            >
              <TextInput
                id="tool-prefix"
                value={formState.toolPrefix}
                onChange={(_e, val) => handleChange('toolPrefix', val)}
                placeholder={t('mcp')}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {t('A prefix applied to all tools exposed by this MCP server.')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          </Grid>
        </Form>
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
