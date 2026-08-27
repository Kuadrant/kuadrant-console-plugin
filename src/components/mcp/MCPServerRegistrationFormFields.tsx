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
  ValidatedOptions,
} from '@patternfly/react-core';
import { HelpIcon } from '@patternfly/react-icons';
import { K8sResourceCommon, useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import { MCPServerFormState } from './types';
import { validateRequired, validateK8sName, validateNamespace } from '../../utils/validation';

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
  // Callback fired when validation state changes
  onValidationChange?: (isValid: boolean) => void;
}

// The MCPServerRegistration form body, shared between the server registration wizard
// step and the standalone create/edit page.
const MCPServerRegistrationFormFields: React.FC<MCPServerRegistrationFormFieldsProps> = ({
  formState,
  onChange,
  httpRouteNames = [],
  disableIdentity = false,
  showNamespaceField = true,
  onValidationChange,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  // Validation state
  const [errors, setErrors] = React.useState<{
    registrationName?: string;
    namespace?: string;
    targetHTTPRouteName?: string;
    toolPrefix?: string;
  }>({});

  const [touched, setTouched] = React.useState<{
    registrationName?: boolean;
    namespace?: boolean;
    targetHTTPRouteName?: boolean;
    toolPrefix?: boolean;
  }>({});

  const [namespaces] = useK8sWatchResource<K8sResourceCommon[]>(
    showNamespaceField
      ? {
          groupVersionKind: { group: '', version: 'v1', kind: 'Namespace' },
          isList: true,
        }
      : null,
  );

  const namespaceOptions = React.useMemo(() => {
    if (!namespaces) return [];
    return namespaces
      .map((ns) => ns.metadata?.name || '')
      .filter(Boolean)
      .sort();
  }, [namespaces]);

  // Validation functions
  const validateRegistrationName = React.useCallback(
    (value: string) => {
      const requiredError = validateRequired(value);
      if (requiredError) return t(requiredError);
      const formatError = validateK8sName(value);
      if (formatError) return t(formatError);
      return null;
    },
    [t],
  );

  const validateRegistrationNamespace = React.useCallback(
    (value: string) => {
      const requiredError = validateRequired(value);
      if (requiredError) return t(requiredError);
      const formatError = validateNamespace(value);
      if (formatError) return t(formatError);
      return null;
    },
    [t],
  );

  const validateTargetHTTPRouteName = React.useCallback(
    (value: string) => {
      if (!value) return null; // Optional field
      const formatError = validateK8sName(value);
      if (formatError) return t(formatError);
      return null;
    },
    [t],
  );

  const validateToolPrefix = React.useCallback(
    (value: string) => {
      const requiredError = validateRequired(value);
      if (requiredError) return t(requiredError);
      const formatError = validateK8sName(value);
      if (formatError) return t(formatError);
      return null;
    },
    [t],
  );

  // Notify parent when validation state changes. This effect must NOT call
  // setErrors — the error state shown to the user is driven by the blur
  // handlers. Setting state here would re-run the effect whenever the memoised
  // validators change identity (they depend on `t`, which is a fresh reference
  // on every render under some i18n setups), causing an infinite render loop.
  React.useEffect(() => {
    const isValid =
      validateRegistrationName(formState.registrationName) === null &&
      validateRegistrationNamespace(formState.namespace) === null &&
      validateTargetHTTPRouteName(formState.targetHTTPRouteName) === null &&
      validateToolPrefix(formState.toolPrefix) === null;
    onValidationChange?.(isValid);
  }, [
    formState.registrationName,
    formState.namespace,
    formState.targetHTTPRouteName,
    formState.toolPrefix,
    validateRegistrationName,
    validateRegistrationNamespace,
    validateTargetHTTPRouteName,
    validateToolPrefix,
    onValidationChange,
  ]);

  // Blur handlers
  const handleRegistrationNameBlur = () => {
    setTouched((prev) => ({ ...prev, registrationName: true }));
    setErrors((prev) => ({
      ...prev,
      registrationName: validateRegistrationName(formState.registrationName),
    }));
  };

  const handleTargetHTTPRouteNameBlur = () => {
    setTouched((prev) => ({ ...prev, targetHTTPRouteName: true }));
    setErrors((prev) => ({
      ...prev,
      targetHTTPRouteName: validateTargetHTTPRouteName(formState.targetHTTPRouteName),
    }));
  };

  const handleToolPrefixBlur = () => {
    setTouched((prev) => ({ ...prev, toolPrefix: true }));
    setErrors((prev) => ({
      ...prev,
      toolPrefix: validateToolPrefix(formState.toolPrefix),
    }));
  };

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
            onBlur={handleRegistrationNameBlur}
            validated={
              touched.registrationName && errors.registrationName
                ? ValidatedOptions.error
                : ValidatedOptions.default
            }
            isDisabled={disableIdentity}
            placeholder={t('my-mcp-server-name')}
            data-test="mcp-registration-name"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem
                variant={touched.registrationName && errors.registrationName ? 'error' : 'default'}
              >
                {touched.registrationName && errors.registrationName
                  ? errors.registrationName
                  : t('A unique lowercase name for the MCP server registration.')}
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
              onChange={(_e, val) => {
                onChange('namespace', val);
                setTouched((prev) => ({ ...prev, namespace: true }));
                setErrors((prev) => ({
                  ...prev,
                  namespace: validateRegistrationNamespace(val),
                }));
              }}
              isDisabled={disableIdentity}
              aria-label={t('Select namespace')}
              data-test="mcp-registration-namespace"
              validated={
                touched.namespace && errors.namespace
                  ? ValidatedOptions.error
                  : ValidatedOptions.default
              }
            >
              <FormSelectOption value="" label={t('None selected')} />
              {namespaceOptions.map((ns) => (
                <FormSelectOption key={ns} value={ns} label={ns} />
              ))}
            </FormSelect>
            <FormHelperText>
              <HelperText>
                <HelperTextItem
                  variant={touched.namespace && errors.namespace ? 'error' : 'default'}
                >
                  {touched.namespace && errors.namespace
                    ? errors.namespace
                    : t(
                        'The Kubernetes namespace where the gateway infrastructure will be deployed.',
                      )}
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
              onBlur={handleTargetHTTPRouteNameBlur}
              validated={
                touched.targetHTTPRouteName && errors.targetHTTPRouteName
                  ? ValidatedOptions.error
                  : ValidatedOptions.default
              }
              placeholder={t('Enter target HTTPRoute name')}
              data-test="mcp-registration-httproute-input"
            />
          )}
          <FormHelperText>
            <HelperText>
              <HelperTextItem
                variant={
                  touched.targetHTTPRouteName && errors.targetHTTPRouteName ? 'error' : 'default'
                }
              >
                {touched.targetHTTPRouteName && errors.targetHTTPRouteName
                  ? errors.targetHTTPRouteName
                  : t('The HTTPRoute that this MCP server registration targets.')}
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
            onBlur={handleToolPrefixBlur}
            validated={
              touched.toolPrefix && errors.toolPrefix
                ? ValidatedOptions.error
                : ValidatedOptions.default
            }
            placeholder={t('mcp')}
            data-test="mcp-registration-prefix"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem
                variant={touched.toolPrefix && errors.toolPrefix ? 'error' : 'default'}
              >
                {touched.toolPrefix && errors.toolPrefix
                  ? errors.toolPrefix
                  : t('A prefix applied to all tools exposed by this MCP server.')}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </Grid>
    </Form>
  );
};

export default MCPServerRegistrationFormFields;
