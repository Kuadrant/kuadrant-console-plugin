import * as React from 'react';
import {
  Form,
  FormGroup,
  TextInput,
  FormSelect,
  FormSelectOption,
  FormHelperText,
  HelperText,
  HelperTextItem,
  ExpandableSection,
  Switch,
  ValidatedOptions,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { MCPWizardFormState } from './types';
import { GatewayResource } from '../gateway/types';
import {
  validateRequired,
  validateK8sName,
  validateK8sLabel,
  validateNamespace,
} from '../../utils/validation';

interface MCPExtensionFormFieldsProps {
  formState: MCPWizardFormState;
  updateFormState: (updates: Partial<MCPWizardFormState>) => void;
  selectedGateway?: GatewayResource;
  selectedNamespace: string;
  // When true, the name and namespace inputs are disabled (edit mode — identity is immutable).
  disableIdentity?: boolean;
  // Gateway names offered in the Target Gateway dropdown. In the wizard step this is
  // left undefined — the gateway was already chosen in an earlier step, so the field
  // stays free-text there. On the standalone page this is the list of Gateways
  // watched in the selected namespace. When empty, the field falls back to a
  // free-text input (mirroring the Target HTTPRoute field in
  // MCPServerRegistrationFormFields).
  gatewayNames?: string[];
  // Whether to render the Namespace field. The wizard step keeps it (namespace
  // isn't otherwise selectable there); the standalone page hides it and uses the
  // console's namespace picker instead.
  showNamespaceField?: boolean;
  validationError?: string | null;
  onValidationChange?: (isValid: boolean) => void;
}

// The MCPGatewayExtension form body, shared between the setup wizard step and the
// standalone create/edit page.
const MCPExtensionFormFields: React.FC<MCPExtensionFormFieldsProps> = ({
  formState,
  updateFormState,
  selectedGateway,
  selectedNamespace,
  disableIdentity = false,
  gatewayNames = [],
  showNamespaceField = true,
  validationError,
  onValidationChange,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  // Validation state
  const [errors, setErrors] = React.useState<{
    extensionName?: string;
    extensionNamespace?: string;
    targetGateway?: string;
    sectionName?: string;
  }>({});

  const [touched, setTouched] = React.useState<{
    extensionName?: boolean;
    extensionNamespace?: boolean;
    targetGateway?: boolean;
    sectionName?: boolean;
  }>({});

  // Get listener names from the selected gateway
  const listenerNames = React.useMemo(() => {
    if (!selectedGateway?.spec?.listeners) return [];
    return selectedGateway.spec.listeners.map((l) => l.name);
  }, [selectedGateway]);

  // Validation functions
  const validateExtensionName = React.useCallback(
    (value: string) => {
      const requiredError = validateRequired(value);
      if (requiredError) return t(requiredError);
      const formatError = validateK8sName(value);
      if (formatError) return t(formatError);
      return null;
    },
    [t],
  );

  const validateExtensionNamespace = React.useCallback(
    (value: string) => {
      if (!value) return null; // Namespace is optional (falls back to selectedNamespace)
      const formatError = validateNamespace(value);
      if (formatError) return t(formatError);
      return null;
    },
    [t],
  );

  const validateTargetGateway = React.useCallback(
    (value: string) => {
      const requiredError = validateRequired(value);
      if (requiredError) return t(requiredError);
      const formatError = validateK8sName(value);
      if (formatError) return t(formatError);
      return null;
    },
    [t],
  );

  const validateSectionName = React.useCallback(
    (value: string) => {
      const requiredError = validateRequired(value);
      if (requiredError) return t(requiredError);
      const formatError = validateK8sLabel(value);
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
      validateExtensionName(formState.extensionName) === null &&
      validateExtensionNamespace(formState.extensionNamespace) === null &&
      validateTargetGateway(formState.targetGateway) === null &&
      validateSectionName(formState.sectionName) === null;
    onValidationChange?.(isValid);
  }, [
    formState.extensionName,
    formState.extensionNamespace,
    formState.targetGateway,
    formState.sectionName,
    validateExtensionName,
    validateExtensionNamespace,
    validateTargetGateway,
    validateSectionName,
    onValidationChange,
  ]);

  // Blur handlers
  const handleExtensionNameBlur = () => {
    setTouched((prev) => ({ ...prev, extensionName: true }));
    setErrors((prev) => ({
      ...prev,
      extensionName: validateExtensionName(formState.extensionName),
    }));
  };

  const handleExtensionNamespaceBlur = () => {
    setTouched((prev) => ({ ...prev, extensionNamespace: true }));
    setErrors((prev) => ({
      ...prev,
      extensionNamespace: validateExtensionNamespace(formState.extensionNamespace),
    }));
  };

  const handleTargetGatewayBlur = () => {
    setTouched((prev) => ({ ...prev, targetGateway: true }));
    setErrors((prev) => ({
      ...prev,
      targetGateway: validateTargetGateway(formState.targetGateway),
    }));
  };

  const handleSectionNameBlur = () => {
    setTouched((prev) => ({ ...prev, sectionName: true }));
    setErrors((prev) => ({ ...prev, sectionName: validateSectionName(formState.sectionName) }));
  };

  return (
    <Form>
      <FormGroup label={t('Name')} isRequired fieldId="extension-name">
        <TextInput
          type="text"
          id="extension-name"
          value={formState.extensionName}
          onChange={(_event, value) => updateFormState({ extensionName: value })}
          onBlur={handleExtensionNameBlur}
          validated={
            touched.extensionName && errors.extensionName
              ? ValidatedOptions.error
              : ValidatedOptions.default
          }
          isRequired
          isDisabled={disableIdentity}
          placeholder={t('Enter extension name')}
          data-test="mcp-extension-name"
        />
        {validationError?.includes('extension name') && formState.extensionName.trim() && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">{validationError}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
        <FormHelperText>
          <HelperText>
            <HelperTextItem
              variant={touched.extensionName && errors.extensionName ? 'error' : 'default'}
            >
              {touched.extensionName && errors.extensionName
                ? errors.extensionName
                : t('A unique name for the MCP gateway extension resource.')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      {showNamespaceField && (
        <FormGroup label={t('Namespace')} fieldId="extension-namespace">
          <TextInput
            type="text"
            id="extension-namespace"
            value={formState.extensionNamespace}
            onChange={(_event, value) => updateFormState({ extensionNamespace: value })}
            onBlur={handleExtensionNamespaceBlur}
            validated={
              touched.extensionNamespace && errors.extensionNamespace
                ? ValidatedOptions.error
                : ValidatedOptions.default
            }
            isDisabled={disableIdentity}
            placeholder={selectedNamespace}
            data-test="mcp-extension-namespace"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem
                variant={
                  touched.extensionNamespace && errors.extensionNamespace ? 'error' : 'default'
                }
              >
                {touched.extensionNamespace && errors.extensionNamespace
                  ? errors.extensionNamespace
                  : t(
                      'The namespace for the extension. If different from the gateway namespace, a ReferenceGrant will be created.',
                    )}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      )}

      <FormGroup label={t('Target Gateway')} isRequired fieldId="target-gateway">
        {gatewayNames.length > 0 ? (
          <FormSelect
            id="target-gateway"
            value={formState.targetGateway}
            onChange={(_event, value) => {
              updateFormState({ targetGateway: value, sectionName: '' });
              if (touched.targetGateway) {
                setErrors((prev) => ({ ...prev, targetGateway: validateTargetGateway(value) }));
              }
            }}
            onBlur={handleTargetGatewayBlur}
            validated={
              touched.targetGateway && errors.targetGateway
                ? ValidatedOptions.error
                : ValidatedOptions.default
            }
            aria-label={t('Select a gateway')}
            data-test="mcp-target-gateway-select"
          >
            <FormSelectOption value="" label={t('Select a gateway...')} isPlaceholder />
            {gatewayNames.map((name) => (
              <FormSelectOption key={name} value={name} label={name} />
            ))}
          </FormSelect>
        ) : (
          <TextInput
            type="text"
            id="target-gateway"
            value={formState.targetGateway}
            onChange={(_event, value) => updateFormState({ targetGateway: value, sectionName: '' })}
            onBlur={handleTargetGatewayBlur}
            validated={
              touched.targetGateway && errors.targetGateway
                ? ValidatedOptions.error
                : ValidatedOptions.default
            }
            isRequired
            placeholder={t('Enter target gateway name')}
            data-test="mcp-target-gateway"
          />
        )}
        <FormHelperText>
          <HelperText>
            <HelperTextItem
              variant={touched.targetGateway && errors.targetGateway ? 'error' : 'default'}
            >
              {touched.targetGateway && errors.targetGateway
                ? errors.targetGateway
                : t('The name of the gateway this extension targets.')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
        {validationError?.includes('target Gateway') && formState.targetGateway.trim() && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">{validationError}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup label={t('Listener name')} isRequired fieldId="section-name">
        {listenerNames.length > 0 ? (
          <FormSelect
            id="section-name"
            value={formState.sectionName}
            onChange={(_event, value) => {
              updateFormState({ sectionName: value });
              if (touched.sectionName) {
                setErrors((prev) => ({ ...prev, sectionName: validateSectionName(value) }));
              }
            }}
            onBlur={handleSectionNameBlur}
            validated={
              touched.sectionName && errors.sectionName
                ? ValidatedOptions.error
                : ValidatedOptions.default
            }
            aria-label={t('Select a listener')}
            data-test="mcp-section-name"
          >
            <FormSelectOption value="" label={t('Select a listener...')} isPlaceholder />
            {listenerNames.map((name) => (
              <FormSelectOption key={name} value={name} label={name} />
            ))}
          </FormSelect>
        ) : (
          <TextInput
            type="text"
            id="section-name"
            value={formState.sectionName}
            onChange={(_event, value) => updateFormState({ sectionName: value })}
            onBlur={handleSectionNameBlur}
            validated={
              touched.sectionName && errors.sectionName
                ? ValidatedOptions.error
                : ValidatedOptions.default
            }
            isRequired
            placeholder={t('Enter listener name')}
            data-test="mcp-section-name-input"
          />
        )}
        <FormHelperText>
          <HelperText>
            <HelperTextItem
              variant={touched.sectionName && errors.sectionName ? 'error' : 'default'}
            >
              {touched.sectionName && errors.sectionName
                ? errors.sectionName
                : t('The name of the gateway listener to use for MCP traffic.')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
        {validationError &&
          !validationError.includes('extension name') &&
          !validationError.includes('target Gateway') &&
          formState.sectionName.trim() && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant="error">{validationError}</HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
      </FormGroup>

      <ExpandableSection toggleText={t('Advanced broker settings')}>
        <FormGroup fieldId="http-route-management">
          <Switch
            id="http-route-management"
            label={t('HTTPRoute Management')}
            isChecked={!formState.httpRouteManagementEnabled}
            onChange={(_event, checked) =>
              updateFormState({ httpRouteManagementEnabled: !checked })
            }
            data-test="mcp-http-route-management"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>
                {t('Disables the controller automatically creating the gateway HTTPRoute.')}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        <FormGroup fieldId="override-hostnames">
          <Switch
            id="override-hostnames"
            label={t('Override hostnames')}
            isChecked={formState.overrideHostnames}
            onChange={(_event, checked) => updateFormState({ overrideHostnames: checked })}
            data-test="mcp-override-hostnames"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>
                {t('Override the public and private hostnames derived from the gateway listener.')}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
        {formState.overrideHostnames && (
          <>
            <FormGroup label={t('Public host')} fieldId="public-host">
              <TextInput
                type="text"
                id="public-host"
                value={formState.publicHost}
                onChange={(_event, value) => updateFormState({ publicHost: value })}
                placeholder={t('e.g. mcp.example.com')}
                data-test="mcp-public-host"
              />
            </FormGroup>
            <FormGroup label={t('Private host')} fieldId="private-host">
              <TextInput
                type="text"
                id="private-host"
                value={formState.privateHost}
                onChange={(_event, value) => updateFormState({ privateHost: value })}
                placeholder={t('e.g. mcp-internal.svc.cluster.local')}
                data-test="mcp-private-host"
              />
            </FormGroup>
          </>
        )}

        <FormGroup fieldId="session-storage">
          <Switch
            id="session-storage"
            label={t('Session storage')}
            isChecked={formState.sessionStorageEnabled}
            onChange={(_event, checked) => updateFormState({ sessionStorageEnabled: checked })}
            data-test="mcp-session-storage"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>
                {t(
                  'Use Redis-based session storage instead of in-memory. The secret must contain a CACHE_CONNECTION_STRING key.',
                )}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
        {formState.sessionStorageEnabled && (
          <FormGroup label={t('Secret name')} fieldId="session-store-secret" isRequired>
            <TextInput
              type="text"
              id="session-store-secret"
              value={formState.sessionStoreSecretName}
              onChange={(_event, value) => updateFormState({ sessionStoreSecretName: value })}
              isRequired
              placeholder={t('e.g. redis-session-secret')}
              data-test="mcp-session-store-secret"
            />
          </FormGroup>
        )}

        <FormGroup fieldId="oauth-metadata">
          <Switch
            id="oauth-metadata"
            label={t('OAuth protected resource')}
            isChecked={formState.oauthEnabled}
            onChange={(_event, checked) => updateFormState({ oauthEnabled: checked })}
            data-test="mcp-oauth-enabled"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>
                {t(
                  'Serve OAuth protected resource metadata at /.well-known/oauth-protected-resource.',
                )}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
        {formState.oauthEnabled && (
          <>
            <FormGroup label={t('Authorization servers')} fieldId="oauth-auth-servers" isRequired>
              <TextInput
                type="text"
                id="oauth-auth-servers"
                value={formState.oauthAuthorizationServers}
                onChange={(_event, value) => updateFormState({ oauthAuthorizationServers: value })}
                isRequired
                placeholder={t('e.g. https://auth.example.com')}
                data-test="mcp-oauth-auth-servers"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {t('Comma-separated list of OAuth authorization server URLs.')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            <FormGroup label={t('Resource name')} fieldId="oauth-resource-name">
              <TextInput
                type="text"
                id="oauth-resource-name"
                value={formState.oauthResourceName}
                onChange={(_event, value) => updateFormState({ oauthResourceName: value })}
                placeholder={t('e.g. MCP Server')}
                data-test="mcp-oauth-resource-name"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {t('Human-readable name for this protected resource.')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          </>
        )}
      </ExpandableSection>
    </Form>
  );
};

export default MCPExtensionFormFields;
