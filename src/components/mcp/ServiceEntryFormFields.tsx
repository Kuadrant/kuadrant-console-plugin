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
import { ServiceEntryFormState } from './types';
import {
  validateRequired,
  validateK8sName,
  validateNamespace,
  validatePort,
} from '../../utils/validation';

const PROTOCOL_OPTIONS = ['HTTP', 'HTTPS', 'HTTP2', 'GRPC', 'TCP', 'TLS', 'MONGO', 'REDIS'];
const LOCATION_OPTIONS = ['MESH_EXTERNAL', 'MESH_INTERNAL'];
const RESOLUTION_OPTIONS = ['DNS', 'DNS_ROUND_ROBIN', 'STATIC', 'NONE'];

interface ServiceEntryFormFieldsProps {
  formState: ServiceEntryFormState;
  onChange: (field: keyof ServiceEntryFormState, value: string) => void;
  // When true, the name and namespace inputs are disabled (edit mode — identity is immutable).
  disableIdentity?: boolean;
  // Callback fired when validation state changes
  onValidationChange?: (isValid: boolean) => void;
}

// The ServiceEntry form body for step 1 (Create Service Entry) of the external
// MCP server registration wizard.
const ServiceEntryFormFields: React.FC<ServiceEntryFormFieldsProps> = ({
  formState,
  onChange,
  disableIdentity = false,
  onValidationChange,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  const [errors, setErrors] = React.useState<{
    serviceName?: string;
    namespace?: string;
    hosts?: string;
    port?: string;
  }>({});

  const [touched, setTouched] = React.useState<{
    serviceName?: boolean;
    namespace?: boolean;
    hosts?: boolean;
    port?: boolean;
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

  const validateServiceName = React.useCallback(
    (value: string) => {
      const requiredError = validateRequired(value);
      if (requiredError) return t(requiredError);
      const formatError = validateK8sName(value);
      if (formatError) return t(formatError);
      return null;
    },
    [t],
  );

  const validateServiceNamespace = React.useCallback(
    (value: string) => {
      const requiredError = validateRequired(value);
      if (requiredError) return t(requiredError);
      const formatError = validateNamespace(value);
      if (formatError) return t(formatError);
      return null;
    },
    [t],
  );

  const validateHosts = React.useCallback(
    (value: string) => {
      const requiredError = validateRequired(value);
      if (requiredError) return t(requiredError);
      return null;
    },
    [t],
  );

  const validateServicePort = React.useCallback(
    (value: string) => {
      const requiredError = validateRequired(value);
      if (requiredError) return t(requiredError);
      const formatError = validatePort(value);
      if (formatError) return t(formatError);
      return null;
    },
    [t],
  );

  // Notify parent when validation state changes. This effect must NOT call
  // setErrors — the error state shown to the user is driven by the blur
  // handlers, mirroring MCPServerRegistrationFormFields.
  React.useEffect(() => {
    const isValid =
      validateServiceName(formState.serviceName) === null &&
      validateServiceNamespace(formState.namespace) === null &&
      validateHosts(formState.hosts) === null &&
      validateServicePort(formState.port) === null &&
      !!formState.protocol &&
      !!formState.location &&
      !!formState.resolution;
    onValidationChange?.(isValid);
  }, [
    formState.serviceName,
    formState.namespace,
    formState.hosts,
    formState.port,
    formState.protocol,
    formState.location,
    formState.resolution,
    validateServiceName,
    validateServiceNamespace,
    validateHosts,
    validateServicePort,
    onValidationChange,
  ]);

  const handleServiceNameBlur = () => {
    setTouched((prev) => ({ ...prev, serviceName: true }));
    setErrors((prev) => ({ ...prev, serviceName: validateServiceName(formState.serviceName) }));
  };

  const handleNamespaceBlur = (value: string) => {
    setTouched((prev) => ({ ...prev, namespace: true }));
    setErrors((prev) => ({ ...prev, namespace: validateServiceNamespace(value) }));
  };

  const handleHostsBlur = () => {
    setTouched((prev) => ({ ...prev, hosts: true }));
    setErrors((prev) => ({ ...prev, hosts: validateHosts(formState.hosts) }));
  };

  const handlePortBlur = () => {
    setTouched((prev) => ({ ...prev, port: true }));
    setErrors((prev) => ({ ...prev, port: validateServicePort(formState.port) }));
  };

  return (
    <Form>
      <Grid hasGutter md={6}>
        <FormGroup
          label={t('Service name')}
          isRequired
          fieldId="service-entry-name"
          labelHelp={
            <Popover bodyContent={t('A unique lowercase name for this service entry.')}>
              <button
                type="button"
                aria-label={t('More info for service name')}
                className="pf-v6-c-form__group-label-help"
              >
                <HelpIcon />
              </button>
            </Popover>
          }
        >
          <TextInput
            id="service-entry-name"
            value={formState.serviceName}
            onChange={(_e, val) => onChange('serviceName', val)}
            onBlur={handleServiceNameBlur}
            validated={
              touched.serviceName && errors.serviceName
                ? ValidatedOptions.error
                : ValidatedOptions.default
            }
            isDisabled={disableIdentity}
            placeholder={t('my-mcp-route')}
            data-test="service-entry-name"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem
                variant={touched.serviceName && errors.serviceName ? 'error' : 'default'}
              >
                {touched.serviceName && errors.serviceName
                  ? errors.serviceName
                  : t('A unique lowercase name for this service entry.')}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        <FormGroup
          label={t('Namespace')}
          isRequired
          fieldId="service-entry-namespace"
          labelHelp={
            <Popover bodyContent={t('Choose the namespace this service entry will be created in.')}>
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
            id="service-entry-namespace"
            value={formState.namespace}
            onChange={(_e, val) => {
              onChange('namespace', val);
              handleNamespaceBlur(val);
            }}
            isDisabled={disableIdentity}
            aria-label={t('Select namespace')}
            data-test="service-entry-namespace"
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
                  : t('Choose the namespace this service entry will be created in.')}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </Grid>

      <Grid hasGutter md={6}>
        <FormGroup
          label={t('Hosts')}
          isRequired
          fieldId="service-entry-hosts"
          labelHelp={
            <Popover
              bodyContent={t('One or more hostnames of the external service, comma-separated.')}
            >
              <button
                type="button"
                aria-label={t('More info for hosts')}
                className="pf-v6-c-form__group-label-help"
              >
                <HelpIcon />
              </button>
            </Popover>
          }
        >
          <TextInput
            id="service-entry-hosts"
            value={formState.hosts}
            onChange={(_e, val) => onChange('hosts', val)}
            onBlur={handleHostsBlur}
            validated={
              touched.hosts && errors.hosts ? ValidatedOptions.error : ValidatedOptions.default
            }
            placeholder={t('api.myservice.com')}
            data-test="service-entry-hosts"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant={touched.hosts && errors.hosts ? 'error' : 'default'}>
                {touched.hosts && errors.hosts
                  ? errors.hosts
                  : t('One or more hostnames of the external service, comma-separated.')}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </Grid>

      <Grid hasGutter md={6}>
        <FormGroup
          label={t('Port number')}
          isRequired
          fieldId="service-entry-port"
          labelHelp={
            <Popover bodyContent={t('The port the external service listens on.')}>
              <button
                type="button"
                aria-label={t('More info for port number')}
                className="pf-v6-c-form__group-label-help"
              >
                <HelpIcon />
              </button>
            </Popover>
          }
        >
          <TextInput
            id="service-entry-port"
            type="number"
            value={formState.port}
            onChange={(_e, val) => onChange('port', val)}
            onBlur={handlePortBlur}
            validated={
              touched.port && errors.port ? ValidatedOptions.error : ValidatedOptions.default
            }
            placeholder={t('443')}
            data-test="service-entry-port"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant={touched.port && errors.port ? 'error' : 'default'}>
                {touched.port && errors.port
                  ? errors.port
                  : t('The port the external service listens on.')}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        <FormGroup
          label={t('Protocol')}
          fieldId="service-entry-protocol"
          labelHelp={
            <Popover bodyContent={t('The protocol used to access the external service.')}>
              <button
                type="button"
                aria-label={t('More info for protocol')}
                className="pf-v6-c-form__group-label-help"
              >
                <HelpIcon />
              </button>
            </Popover>
          }
        >
          <FormSelect
            id="service-entry-protocol"
            value={formState.protocol}
            onChange={(_e, val) => onChange('protocol', val)}
            aria-label={t('Select protocol')}
            data-test="service-entry-protocol"
          >
            {PROTOCOL_OPTIONS.map((protocol) => (
              <FormSelectOption key={protocol} value={protocol} label={protocol} />
            ))}
          </FormSelect>
        </FormGroup>
      </Grid>

      <Grid hasGutter md={6}>
        <FormGroup
          label={t('Location')}
          fieldId="service-entry-location"
          labelHelp={
            <Popover
              bodyContent={t(
                'Whether the service is external to the mesh (MESH_EXTERNAL) or part of it (MESH_INTERNAL).',
              )}
            >
              <button
                type="button"
                aria-label={t('More info for location')}
                className="pf-v6-c-form__group-label-help"
              >
                <HelpIcon />
              </button>
            </Popover>
          }
        >
          <FormSelect
            id="service-entry-location"
            value={formState.location}
            onChange={(_e, val) => onChange('location', val)}
            aria-label={t('Select location')}
            data-test="service-entry-location"
          >
            {LOCATION_OPTIONS.map((location) => (
              <FormSelectOption key={location} value={location} label={location} />
            ))}
          </FormSelect>
        </FormGroup>

        <FormGroup
          label={t('Resolution')}
          fieldId="service-entry-resolution"
          labelHelp={
            <Popover bodyContent={t('How the proxy resolves the IP addresses of the hosts.')}>
              <button
                type="button"
                aria-label={t('More info for resolution')}
                className="pf-v6-c-form__group-label-help"
              >
                <HelpIcon />
              </button>
            </Popover>
          }
        >
          <FormSelect
            id="service-entry-resolution"
            value={formState.resolution}
            onChange={(_e, val) => onChange('resolution', val)}
            aria-label={t('Select resolution')}
            data-test="service-entry-resolution"
          >
            {RESOLUTION_OPTIONS.map((resolution) => (
              <FormSelectOption key={resolution} value={resolution} label={resolution} />
            ))}
          </FormSelect>
        </FormGroup>
      </Grid>
    </Form>
  );
};

export default ServiceEntryFormFields;
