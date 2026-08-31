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
import { CredentialFormState } from './types';
import { validateRequired, validateK8sName, validateNamespace } from '../../utils/validation';

const TYPE_OPTIONS = ['Opaque'];

interface CredentialFormFieldsProps {
  formState: CredentialFormState;
  onChange: (field: keyof CredentialFormState, value: string) => void;
  // When true, the name and namespace inputs are disabled (edit mode — identity is immutable).
  disableIdentity?: boolean;
  // Callback fired when validation state changes
  onValidationChange?: (isValid: boolean) => void;
}

// The credential Secret form body for step 4 (Add access credentials) of the
// external MCP server registration wizard.
const CredentialFormFields: React.FC<CredentialFormFieldsProps> = ({
  formState,
  onChange,
  disableIdentity = false,
  onValidationChange,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  const [errors, setErrors] = React.useState<{
    credentialName?: string;
    namespace?: string;
    tokenString?: string;
  }>({});

  const [touched, setTouched] = React.useState<{
    credentialName?: boolean;
    namespace?: boolean;
    tokenString?: boolean;
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

  const validateCredentialName = React.useCallback(
    (value: string) => {
      const requiredError = validateRequired(value);
      if (requiredError) return t(requiredError);
      const formatError = validateK8sName(value);
      if (formatError) return t(formatError);
      return null;
    },
    [t],
  );

  const validateCredentialNamespace = React.useCallback(
    (value: string) => {
      const requiredError = validateRequired(value);
      if (requiredError) return t(requiredError);
      const formatError = validateNamespace(value);
      if (formatError) return t(formatError);
      return null;
    },
    [t],
  );

  const validateTokenString = React.useCallback(
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
      validateCredentialName(formState.credentialName) === null &&
      validateCredentialNamespace(formState.namespace) === null &&
      validateTokenString(formState.tokenString) === null &&
      !!formState.type;
    onValidationChange?.(isValid);
  }, [
    formState.credentialName,
    formState.namespace,
    formState.tokenString,
    formState.type,
    validateCredentialName,
    validateCredentialNamespace,
    validateTokenString,
    onValidationChange,
  ]);

  const handleCredentialNameBlur = () => {
    setTouched((prev) => ({ ...prev, credentialName: true }));
    setErrors((prev) => ({
      ...prev,
      credentialName: validateCredentialName(formState.credentialName),
    }));
  };

  const handleNamespaceBlur = (value: string) => {
    setTouched((prev) => ({ ...prev, namespace: true }));
    setErrors((prev) => ({ ...prev, namespace: validateCredentialNamespace(value) }));
  };

  const handleTokenStringBlur = () => {
    setTouched((prev) => ({ ...prev, tokenString: true }));
    setErrors((prev) => ({ ...prev, tokenString: validateTokenString(formState.tokenString) }));
  };

  return (
    <Form>
      <Grid hasGutter md={6}>
        <FormGroup
          label={t('Credential name')}
          isRequired
          fieldId="credential-name"
          labelHelp={
            <Popover bodyContent={t('A unique lowercase name for this credential secret.')}>
              <button
                type="button"
                aria-label={t('More info for credential name')}
                className="pf-v6-c-form__group-label-help"
              >
                <HelpIcon />
              </button>
            </Popover>
          }
        >
          <TextInput
            id="credential-name"
            value={formState.credentialName}
            onChange={(_e, val) => onChange('credentialName', val)}
            onBlur={handleCredentialNameBlur}
            validated={
              touched.credentialName && errors.credentialName
                ? ValidatedOptions.error
                : ValidatedOptions.default
            }
            isDisabled={disableIdentity}
            placeholder={t('my-mcp-route')}
            data-test="credential-name"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem
                variant={touched.credentialName && errors.credentialName ? 'error' : 'default'}
              >
                {touched.credentialName && errors.credentialName
                  ? errors.credentialName
                  : t('A unique lowercase name for this credential secret.')}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        <FormGroup
          label={t('Namespace')}
          isRequired
          fieldId="credential-namespace"
          labelHelp={
            <Popover
              bodyContent={t('Choose the namespace this credential secret will be created in.')}
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
            id="credential-namespace"
            value={formState.namespace}
            onChange={(_e, val) => {
              onChange('namespace', val);
              handleNamespaceBlur(val);
            }}
            isDisabled={disableIdentity}
            aria-label={t('Select namespace')}
            data-test="credential-namespace"
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
                  : t('Choose the namespace this credential secret will be created in.')}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </Grid>

      <Grid hasGutter md={6}>
        <FormGroup
          label={t('Type')}
          fieldId="credential-type"
          labelHelp={
            <Popover bodyContent={t('The Kubernetes Secret type used to store this credential.')}>
              <button
                type="button"
                aria-label={t('More info for type')}
                className="pf-v6-c-form__group-label-help"
              >
                <HelpIcon />
              </button>
            </Popover>
          }
        >
          <FormSelect
            id="credential-type"
            value={formState.type}
            onChange={(_e, val) => onChange('type', val)}
            aria-label={t('Select type')}
            data-test="credential-type"
          >
            {TYPE_OPTIONS.map((type) => (
              <FormSelectOption key={type} value={type} label={type} />
            ))}
          </FormSelect>
        </FormGroup>
      </Grid>

      <Grid hasGutter md={6}>
        <FormGroup
          label={t('Token string')}
          isRequired
          fieldId="credential-token"
          labelHelp={
            <Popover
              bodyContent={t(
                'The credential value sent to authenticate to the external service, e.g. a bearer token.',
              )}
            >
              <button
                type="button"
                aria-label={t('More info for token string')}
                className="pf-v6-c-form__group-label-help"
              >
                <HelpIcon />
              </button>
            </Popover>
          }
        >
          <TextInput
            id="credential-token"
            type="password"
            value={formState.tokenString}
            onChange={(_e, val) => onChange('tokenString', val)}
            onBlur={handleTokenStringBlur}
            validated={
              touched.tokenString && errors.tokenString
                ? ValidatedOptions.error
                : ValidatedOptions.default
            }
            placeholder={t('Bearer $GITHUB_PAT')}
            data-test="credential-token"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem
                variant={touched.tokenString && errors.tokenString ? 'error' : 'default'}
              >
                {touched.tokenString && errors.tokenString
                  ? errors.tokenString
                  : t(
                      'The credential value sent to authenticate to the external service, e.g. a bearer token.',
                    )}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </Grid>
    </Form>
  );
};

export default CredentialFormFields;
