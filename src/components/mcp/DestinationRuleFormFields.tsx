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
import { DestinationRuleFormState } from './types';
import { validateRequired, validateK8sName, validateNamespace } from '../../utils/validation';

const TLS_MODE_OPTIONS = ['DISABLE', 'SIMPLE', 'MUTUAL', 'ISTIO_MUTUAL'];

interface DestinationRuleFormFieldsProps {
  formState: DestinationRuleFormState;
  onChange: (field: keyof DestinationRuleFormState, value: string) => void;
  // When true, the name and namespace inputs are disabled (edit mode — identity is immutable).
  disableIdentity?: boolean;
  // Callback fired when validation state changes
  onValidationChange?: (isValid: boolean) => void;
}

// The DestinationRule form body for step 2 (Create Destination Rule) of the
// external MCP server registration wizard.
const DestinationRuleFormFields: React.FC<DestinationRuleFormFieldsProps> = ({
  formState,
  onChange,
  disableIdentity = false,
  onValidationChange,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  const [errors, setErrors] = React.useState<{
    destinationName?: string;
    namespace?: string;
    host?: string;
  }>({});

  const [touched, setTouched] = React.useState<{
    destinationName?: boolean;
    namespace?: boolean;
    host?: boolean;
  }>({});

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

  const validateDestinationName = React.useCallback(
    (value: string) => {
      const requiredError = validateRequired(value);
      if (requiredError) return t(requiredError);
      const formatError = validateK8sName(value);
      if (formatError) return t(formatError);
      return null;
    },
    [t],
  );

  const validateDestinationNamespace = React.useCallback(
    (value: string) => {
      const requiredError = validateRequired(value);
      if (requiredError) return t(requiredError);
      const formatError = validateNamespace(value);
      if (formatError) return t(formatError);
      return null;
    },
    [t],
  );

  const validateHost = React.useCallback(
    (value: string) => {
      const requiredError = validateRequired(value);
      if (requiredError) return t(requiredError);
      return null;
    },
    [t],
  );

  // Notify parent when validation state changes. This effect must NOT call
  // setErrors — the error state shown to the user is driven by the blur
  // handlers, mirroring ServiceEntryFormFields.
  React.useEffect(() => {
    const isValid =
      validateDestinationName(formState.destinationName) === null &&
      validateDestinationNamespace(formState.namespace) === null &&
      validateHost(formState.host) === null &&
      !!formState.tlsMode;
    onValidationChange?.(isValid);
  }, [
    formState.destinationName,
    formState.namespace,
    formState.host,
    formState.tlsMode,
    validateDestinationName,
    validateDestinationNamespace,
    validateHost,
    onValidationChange,
  ]);

  const handleDestinationNameBlur = () => {
    setTouched((prev) => ({ ...prev, destinationName: true }));
    setErrors((prev) => ({
      ...prev,
      destinationName: validateDestinationName(formState.destinationName),
    }));
  };

  const handleNamespaceBlur = (value: string) => {
    setTouched((prev) => ({ ...prev, namespace: true }));
    setErrors((prev) => ({ ...prev, namespace: validateDestinationNamespace(value) }));
  };

  const handleHostBlur = () => {
    setTouched((prev) => ({ ...prev, host: true }));
    setErrors((prev) => ({ ...prev, host: validateHost(formState.host) }));
  };

  return (
    <Form>
      <Grid hasGutter md={6}>
        <FormGroup
          label={t('Destination name')}
          isRequired
          fieldId="destination-rule-name"
          labelHelp={
            <Popover bodyContent={t('A unique lowercase name for this destination rule.')}>
              <button
                type="button"
                aria-label={t('More info for destination name')}
                className="pf-v6-c-form__group-label-help"
              >
                <HelpIcon />
              </button>
            </Popover>
          }
        >
          <TextInput
            id="destination-rule-name"
            value={formState.destinationName}
            onChange={(_e, val) => onChange('destinationName', val)}
            onBlur={handleDestinationNameBlur}
            validated={
              touched.destinationName && errors.destinationName
                ? ValidatedOptions.error
                : ValidatedOptions.default
            }
            isDisabled={disableIdentity}
            placeholder={t('my-mcp-route')}
            data-test="destination-rule-name"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem
                variant={touched.destinationName && errors.destinationName ? 'error' : 'default'}
              >
                {touched.destinationName && errors.destinationName
                  ? errors.destinationName
                  : t('A unique lowercase name for this destination rule.')}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        <FormGroup
          label={t('Namespace')}
          isRequired
          fieldId="destination-rule-namespace"
          labelHelp={
            <Popover
              bodyContent={t('Choose the namespace this destination rule will be created in.')}
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
            id="destination-rule-namespace"
            value={formState.namespace}
            onChange={(_e, val) => {
              onChange('namespace', val);
              handleNamespaceBlur(val);
            }}
            isDisabled={disableIdentity}
            aria-label={t('Select namespace')}
            data-test="destination-rule-namespace"
            validated={
              touched.namespace && errors.namespace
                ? ValidatedOptions.error
                : ValidatedOptions.default
            }
          >
            <FormSelectOption value="" label={t('Select a namespace...')} isPlaceholder />
            {namespaceOptions.map((ns) => (
              <FormSelectOption key={ns} value={ns} label={ns} />
            ))}
          </FormSelect>
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant={touched.namespace && errors.namespace ? 'error' : 'default'}>
                {touched.namespace && errors.namespace
                  ? errors.namespace
                  : t('Choose the namespace this destination rule will be created in.')}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </Grid>

      <Grid hasGutter md={6}>
        <FormGroup
          label={t('Host')}
          isRequired
          fieldId="destination-rule-host"
          labelHelp={
            <Popover
              bodyContent={t(
                'The hostname this destination rule applies traffic policy to. Matches the host registered in the service entry.',
              )}
            >
              <button
                type="button"
                aria-label={t('More info for host')}
                className="pf-v6-c-form__group-label-help"
              >
                <HelpIcon />
              </button>
            </Popover>
          }
        >
          <TextInput
            id="destination-rule-host"
            value={formState.host}
            onChange={(_e, val) => onChange('host', val)}
            onBlur={handleHostBlur}
            validated={
              touched.host && errors.host ? ValidatedOptions.error : ValidatedOptions.default
            }
            placeholder={t('api.myservice.com')}
            data-test="destination-rule-host"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant={touched.host && errors.host ? 'error' : 'default'}>
                {touched.host && errors.host
                  ? errors.host
                  : t(
                      'The hostname this destination rule applies traffic policy to. Matches the host registered in the service entry.',
                    )}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </Grid>

      <Grid hasGutter md={6}>
        <FormGroup
          label={t('TLS mode')}
          fieldId="destination-rule-tls-mode"
          labelHelp={
            <Popover
              bodyContent={t(
                'The TLS connection mode used when connecting to the external service.',
              )}
            >
              <button
                type="button"
                aria-label={t('More info for TLS mode')}
                className="pf-v6-c-form__group-label-help"
              >
                <HelpIcon />
              </button>
            </Popover>
          }
        >
          <FormSelect
            id="destination-rule-tls-mode"
            value={formState.tlsMode}
            onChange={(_e, val) => onChange('tlsMode', val)}
            aria-label={t('Select TLS mode')}
            data-test="destination-rule-tls-mode"
          >
            {TLS_MODE_OPTIONS.map((mode) => (
              <FormSelectOption key={mode} value={mode} label={mode} />
            ))}
          </FormSelect>
        </FormGroup>

        <FormGroup
          label={t('TLS SNI')}
          fieldId="destination-rule-tls-sni"
          labelHelp={
            <Popover
              bodyContent={t(
                'The Server Name Indication to send when originating TLS. Defaults to the host.',
              )}
            >
              <button
                type="button"
                aria-label={t('More info for TLS SNI')}
                className="pf-v6-c-form__group-label-help"
              >
                <HelpIcon />
              </button>
            </Popover>
          }
        >
          <TextInput
            id="destination-rule-tls-sni"
            value={formState.tlsSni}
            onChange={(_e, val) => onChange('tlsSni', val)}
            isDisabled={formState.tlsMode === 'DISABLE'}
            placeholder={formState.host || t('api.myservice.com')}
            data-test="destination-rule-tls-sni"
          />
        </FormGroup>
      </Grid>
    </Form>
  );
};

export default DestinationRuleFormFields;
