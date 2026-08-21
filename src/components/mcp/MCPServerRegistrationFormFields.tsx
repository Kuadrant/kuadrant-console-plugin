import * as React from 'react';
import {
  Form,
  FormGroup,
  Grid,
  TextInput,
  FormSelect,
  FormSelectOption,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Popover,
} from '@patternfly/react-core';
import { HelpIcon } from '@patternfly/react-icons';
import { K8sResourceCommon, useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import { MCPServerFormState } from './types';

interface MCPServerRegistrationFormFieldsProps {
  formState: MCPServerFormState;
  onChange: (field: keyof MCPServerFormState, value: string) => void;
  // HTTPRoute names offered in the Target HTTPRoute dropdown. In the wizard this is
  // the single route carried over from the earlier steps; on the standalone page it
  // is the list of HTTPRoutes watched in the selected namespace. When empty, the
  // field falls back to a free-text input (mirroring MCPExtensionFormFields).
  httpRouteNames?: string[];
  // When true, the name and namespace inputs are disabled (edit mode — identity is immutable).
  disableIdentity?: boolean;
  // Whether to render the Namespace field. The wizard step keeps it (namespace isn't
  // otherwise selectable there); the standalone page hides it and uses the console's
  // namespace picker instead.
  showNamespaceField?: boolean;
}

// The MCPServerRegistration form body, shared between the server registration wizard
// step and the standalone create/edit page.
const MCPServerRegistrationFormFields: React.FC<MCPServerRegistrationFormFieldsProps> = ({
  formState,
  onChange,
  httpRouteNames = [],
  disableIdentity = false,
  showNamespaceField = true,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

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

  return (
    <Form>
      <Grid hasGutter md={6}>
        <FormGroup
          label={t('Registration name')}
          isRequired
          fieldId="registration-name"
          labelHelp={
            <Popover bodyContent={t('A unique lowercase name for the MCP server registration.')}>
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
            onChange={(_e, val) => onChange('registrationName', val)}
            isDisabled={disableIdentity}
            placeholder={t('my-mcp-server-name')}
            data-test="mcp-registration-name"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>
                {t('A unique lowercase name for the MCP server registration.')}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        {showNamespaceField && (
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
              onChange={(_e, val) => onChange('namespace', val)}
              isDisabled={disableIdentity}
              aria-label={t('Select namespace')}
              data-test="mcp-registration-namespace"
            >
              <FormSelectOption value="" label={t('None selected')} />
              {namespaceOptions.map((ns) => (
                <FormSelectOption key={ns} value={ns} label={ns} />
              ))}
            </FormSelect>
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  {t('The Kubernetes namespace where the gateway infrastructure will be deployed.')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
        )}
      </Grid>

      <Grid hasGutter md={6}>
        <FormGroup
          label={t('Target HTTPRoute name')}
          fieldId="target-httproute"
          labelHelp={
            <Popover bodyContent={t('The HTTPRoute that this MCP server registration targets.')}>
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
          {httpRouteNames.length > 0 ? (
            <FormSelect
              id="target-httproute"
              value={formState.targetHTTPRouteName}
              onChange={(_e, val) => onChange('targetHTTPRouteName', val)}
              aria-label={t('Select target HTTPRoute')}
              data-test="mcp-registration-httproute"
            >
              <FormSelectOption value="" label={t('Select...')} isPlaceholder />
              {httpRouteNames.map((name) => (
                <FormSelectOption key={name} value={name} label={name} />
              ))}
            </FormSelect>
          ) : (
            <TextInput
              id="target-httproute"
              value={formState.targetHTTPRouteName}
              onChange={(_e, val) => onChange('targetHTTPRouteName', val)}
              placeholder={t('Enter target HTTPRoute name')}
              data-test="mcp-registration-httproute-input"
            />
          )}
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
            <Popover bodyContent={t('A prefix applied to all tools exposed by this MCP server.')}>
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
            onChange={(_e, val) => onChange('toolPrefix', val)}
            placeholder={t('mcp')}
            data-test="mcp-registration-prefix"
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
  );
};

export default MCPServerRegistrationFormFields;
