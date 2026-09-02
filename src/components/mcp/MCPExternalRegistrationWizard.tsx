import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Modal,
  ModalBody,
  ModalHeader,
  Wizard,
  WizardStep,
  Card,
  CardHeader,
  CardBody,
  Radio,
  FormSelect,
  FormSelectOption,
  FormGroup,
  Popover,
  Button,
} from '@patternfly/react-core';
import { HelpIcon } from '@patternfly/react-icons';
import { useK8sWatchResource, useActiveNamespace } from '@openshift-console/dynamic-plugin-sdk';
import {
  MCPExternalRegistrationFormState,
  initialServiceEntryFormState,
  initialDestinationRuleFormState,
  initialCredentialFormState,
  initialServerFormState,
} from './types';
import { RESOURCES } from '../../utils/resources';
import HTTPRouteCreatePage from '../httproute/HTTPRouteCreatePage';
import { HTTPRouteResource } from '../httproute/types';
import ServiceEntryStep from './steps/ServiceEntryStep';
import DestinationRuleStep from './steps/DestinationRuleStep';
import CredentialStep from './steps/CredentialStep';
import RegisterServerStep from './steps/RegisterServerStep';
import MCPVerifyStep, { VerifyStepItem, WatchResourceConfig } from './MCPVerifyStep';
import {
  buildServiceEntry,
  buildDestinationRule,
  buildCredentialSecret,
  buildMCPServerRegistration,
  wireHTTPRouteToExternalHost,
  parseServiceEntryHosts,
} from './mcpResourceUtils';

interface WizardErrorBoundaryProps {
  children: React.ReactNode;
  errorTitle: string;
}

class WizardErrorBoundary extends React.Component<
  WizardErrorBoundaryProps,
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <Alert
          variant="danger"
          isInline
          title={this.props.errorTitle} // eslint-disable-line react/prop-types
        >
          {this.state.error.message}
        </Alert>
      );
    }
    return this.props.children; // eslint-disable-line react/prop-types
  }
}

interface MCPExternalRegistrationWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

const MCPExternalRegistrationWizard: React.FC<MCPExternalRegistrationWizardProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [selectedNamespaceRaw] = useActiveNamespace();
  const selectedNamespace =
    !selectedNamespaceRaw || selectedNamespaceRaw === '#ALL_NS#' ? 'default' : selectedNamespaceRaw;

  const [formState, setFormState] = React.useState<MCPExternalRegistrationFormState>({
    serviceEntry: { ...initialServiceEntryFormState },
    destinationRule: { ...initialDestinationRuleFormState },
    credential: { ...initialCredentialFormState },
    server: { ...initialServerFormState },
  });
  const [isServiceEntryValid, setIsServiceEntryValid] = React.useState(false);
  const [isDestinationRuleValid, setIsDestinationRuleValid] = React.useState(false);
  const [isCredentialValid, setIsCredentialValid] = React.useState(false);
  const [isServerValid, setIsServerValid] = React.useState(false);
  const [routeMode, setRouteMode] = React.useState<'existing' | 'new'>('existing');
  const [selectedExistingRoute, setSelectedExistingRoute] =
    React.useState<HTTPRouteResource | null>(null);
  const [httpRouteResource, setHttpRouteResource] = React.useState<HTTPRouteResource | null>(null);
  const [httpRouteValid, setHttpRouteValid] = React.useState(false);
  const [resourcesCreated, setResourcesCreated] = React.useState(false);

  // Watch existing HTTPRoutes
  const [httpRoutes, routesLoaded, routesError] = useK8sWatchResource<HTTPRouteResource[]>({
    groupVersionKind: RESOURCES.HTTPRoute.gvk,
    isList: true,
    namespace: selectedNamespace,
  });

  const isHTTPRouteStepValid =
    (routeMode === 'existing' && !!selectedExistingRoute) ||
    (routeMode === 'new' && httpRouteValid && !!httpRouteResource);

  const routeName =
    routeMode === 'existing'
      ? selectedExistingRoute?.metadata?.name
      : httpRouteResource?.metadata?.name;
  const routeNamespace =
    routeMode === 'existing'
      ? selectedExistingRoute?.metadata?.namespace
      : httpRouteResource?.metadata?.namespace;

  const verifyItems = React.useMemo<VerifyStepItem[]>(() => {
    if (!routeName) return [];

    const items: VerifyStepItem[] = [
      {
        type: 'create' as const,
        id: 'create-service-entry',
        label: t('Create ServiceEntry'),
        resource: buildServiceEntry(formState.serviceEntry, formState.serviceEntry.namespace),
        successMessage: t('ServiceEntry created successfully'),
      },
      {
        type: 'create' as const,
        id: 'create-destination-rule',
        label: t('Create DestinationRule'),
        resource: buildDestinationRule(
          formState.destinationRule,
          formState.destinationRule.namespace,
        ),
        successMessage: t('DestinationRule created successfully'),
      },
    ];

    if (routeMode === 'new' && httpRouteResource) {
      items.push({
        type: 'create' as const,
        id: 'create-route',
        label: t('Create HTTPRoute'),
        resource: wireHTTPRouteToExternalHost(
          httpRouteResource,
          parseServiceEntryHosts(formState.serviceEntry.hosts)[0],
          Number(formState.serviceEntry.port),
        ),
        successMessage: t('HTTPRoute created successfully'),
      });
    }

    items.push({
      type: 'create' as const,
      id: 'create-credential',
      label: t('Create credential Secret'),
      resource: buildCredentialSecret(formState.credential, formState.credential.namespace),
      successMessage: t('Credential Secret created successfully'),
      allowAlreadyExists: false,
    });

    items.push({
      type: 'create' as const,
      id: 'create-server',
      label: t('Create MCPServerRegistration'),
      resource: buildMCPServerRegistration(
        { ...formState.server, namespace: formState.credential.namespace },
        formState.credential.namespace,
        null,
        routeName,
        routeNamespace,
        formState.credential.credentialName,
      ),
      successMessage: t('MCPServerRegistration created successfully'),
    });

    return items;
  }, [
    routeName,
    routeNamespace,
    routeMode,
    httpRouteResource,
    formState.serviceEntry,
    formState.destinationRule,
    formState.credential,
    formState.server,
    t,
  ]);

  const verifyWatchResource = React.useMemo<WatchResourceConfig>(
    () => ({
      gvk: RESOURCES.MCPServerRegistration.gvk,
      name: formState.server.registrationName,
      namespace: formState.credential.namespace,
    }),
    [formState.server.registrationName, formState.credential.namespace],
  );

  const handleClose = () => {
    setFormState({
      serviceEntry: { ...initialServiceEntryFormState },
      destinationRule: { ...initialDestinationRuleFormState },
      credential: { ...initialCredentialFormState },
      server: { ...initialServerFormState },
    });
    setIsServiceEntryValid(false);
    setIsDestinationRuleValid(false);
    setIsCredentialValid(false);
    setIsServerValid(false);
    setRouteMode('existing');
    setSelectedExistingRoute(null);
    setHttpRouteResource(null);
    setHttpRouteValid(false);
    setResourcesCreated(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      variant="large"
      aria-labelledby="mcp-external-wizard-modal-title"
    >
      <ModalHeader
        labelId="mcp-external-wizard-modal-title"
        title={t('Setup external MCP server')}
        description={t('Create the resources needed to register an external MCP server')}
      />
      <ModalBody>
        <WizardErrorBoundary errorTitle={t('An error occurred in the wizard')}>
          <Wizard
            onClose={handleClose}
            onSave={handleClose}
            height={750}
            className="kuadrant-mcp-wizard"
          >
            <WizardStep
              name={t('Create Service Entry')}
              id="create-service-entry"
              footer={{
                nextButtonText: t('Next'),
                isNextDisabled: !isServiceEntryValid,
              }}
            >
              <ServiceEntryStep
                formState={formState.serviceEntry}
                onChange={(serviceEntry) =>
                  setFormState((prev) => ({
                    ...prev,
                    serviceEntry,
                    destinationRule: {
                      ...prev.destinationRule,
                      namespace: serviceEntry.namespace,
                      host:
                        parseServiceEntryHosts(serviceEntry.hosts)[0] || prev.destinationRule.host,
                    },
                  }))
                }
                onValidationChange={setIsServiceEntryValid}
              />
            </WizardStep>

            <WizardStep
              name={t('Create Destination Rule')}
              id="create-destination-rule"
              isDisabled={!isServiceEntryValid}
              footer={{
                nextButtonText: t('Next'),
                isNextDisabled: !isDestinationRuleValid,
              }}
            >
              <DestinationRuleStep
                formState={formState.destinationRule}
                onChange={(destinationRule) =>
                  setFormState((prev) => ({ ...prev, destinationRule }))
                }
                onValidationChange={setIsDestinationRuleValid}
              />
            </WizardStep>

            <WizardStep
              name={t('Create HTTP route')}
              id="create-http-route"
              isDisabled={!isServiceEntryValid || !isDestinationRuleValid}
              footer={{
                nextButtonText: t('Next'),
                isNextDisabled: !isHTTPRouteStepValid,
              }}
            >
              <Card style={{ marginBottom: '16px' }}>
                <CardHeader>
                  <Radio
                    id="external-route-mode-existing"
                    name="external-route-mode"
                    label={t('Choose an existing HTTPRoute')}
                    isChecked={routeMode === 'existing'}
                    onChange={() => setRouteMode('existing')}
                  />
                </CardHeader>
                {routeMode === 'existing' && (
                  <CardBody>
                    <FormGroup
                      label={
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {t('HTTPRoute name')}
                          <Popover
                            bodyContent={t(
                              'Select an HTTPRoute that the MCP server will register with.',
                            )}
                          >
                            <Button variant="plain" aria-label={t('HTTPRoute name help')}>
                              <HelpIcon />
                            </Button>
                          </Popover>
                        </div>
                      }
                      fieldId="external-route-select"
                    >
                      <FormSelect
                        id="external-route-select"
                        value={selectedExistingRoute?.metadata?.name || ''}
                        onChange={(_event, value) =>
                          setSelectedExistingRoute(
                            (httpRoutes || []).find((route) => route.metadata?.name === value) ||
                              null,
                          )
                        }
                        aria-label={t('Select an HTTPRoute')}
                        data-test="mcp-external-route-select"
                        isDisabled={!routesLoaded}
                      >
                        <FormSelectOption
                          value=""
                          label={!routesLoaded ? t('Loading routes...') : t('Select a route...')}
                          isPlaceholder
                        />
                        {(httpRoutes || [])
                          .filter((route) =>
                            route.spec?.rules?.some((rule) =>
                              rule.backendRefs?.some(
                                (backend) =>
                                  backend.group === 'networking.istio.io' &&
                                  backend.kind === 'Hostname' &&
                                  backend.name ===
                                    parseServiceEntryHosts(formState.serviceEntry.hosts)[0],
                              ),
                            ),
                          )
                          .map((route) => (
                            <FormSelectOption
                              key={`${route.metadata?.namespace}/${route.metadata?.name}`}
                              value={route.metadata?.name || ''}
                              label={`${route.metadata?.name} (${route.metadata?.namespace})`}
                            />
                          ))}
                      </FormSelect>
                    </FormGroup>
                    {routesError && (
                      <Alert
                        variant="warning"
                        title={t('Could not load routes')}
                        isInline
                        style={{ marginTop: '8px' }}
                      >
                        {String(routesError)}
                      </Alert>
                    )}
                  </CardBody>
                )}
              </Card>

              <Card>
                <CardHeader>
                  <Radio
                    id="external-route-mode-new"
                    name="external-route-mode"
                    label={t('Create a new HTTPRoute')}
                    isChecked={routeMode === 'new'}
                    onChange={() => setRouteMode('new')}
                  />
                </CardHeader>
                {routeMode === 'new' && (
                  <CardBody>
                    <div className="kuadrant-mcp-embedded-form">
                      <HTTPRouteCreatePage
                        onFormChange={(resource, isValid) => {
                          setHttpRouteResource(resource);
                          setHttpRouteValid(isValid);
                        }}
                      />
                    </div>
                  </CardBody>
                )}
              </Card>
            </WizardStep>

            <WizardStep
              name={t('Add access credentials')}
              id="add-access-credentials"
              isDisabled={!isServiceEntryValid || !isDestinationRuleValid || !isHTTPRouteStepValid}
              footer={{
                nextButtonText: t('Next'),
                isNextDisabled: !isCredentialValid,
              }}
            >
              <CredentialStep
                formState={formState.credential}
                onChange={(credential) => setFormState((prev) => ({ ...prev, credential }))}
                onValidationChange={setIsCredentialValid}
              />
            </WizardStep>

            <WizardStep
              name={t('Create MCP server registration')}
              id="create-mcp-server-registration"
              isDisabled={
                !isServiceEntryValid ||
                !isDestinationRuleValid ||
                !isHTTPRouteStepValid ||
                !isCredentialValid
              }
              footer={{
                nextButtonText: t('Save and continue'),
                isNextDisabled: !isServerValid,
              }}
            >
              <RegisterServerStep
                formState={formState.server}
                onChange={(server) => setFormState((prev) => ({ ...prev, server }))}
                routeName={routeName}
                routeNamespace={routeNamespace}
                credentialNamespace={formState.credential.namespace}
                credentialName={formState.credential.credentialName}
                onValidationChange={setIsServerValid}
              />
            </WizardStep>

            <WizardStep
              name={t('Verify configuration')}
              id="verify-configuration"
              isDisabled={
                !isServiceEntryValid ||
                !isDestinationRuleValid ||
                !isHTTPRouteStepValid ||
                !isCredentialValid ||
                !isServerValid
              }
              footer={{
                nextButtonText: t('Finish'),
                isNextDisabled: !resourcesCreated,
              }}
            >
              <MCPVerifyStep
                items={verifyItems}
                watchResource={verifyWatchResource}
                selectedNamespace={formState.credential.namespace}
                title={t('Verify configuration')}
                description={t(
                  'Creating and verifying your external MCP server registration. Resources will be removed if registration fails.',
                )}
                watchLabel={t('MCP server registration created')}
                watchSuccessMessage={t('MCP server is running and healthy')}
                rollbackOnFailure
                onAllCreated={() => setResourcesCreated(true)}
              />
            </WizardStep>
          </Wizard>
        </WizardErrorBoundary>
      </ModalBody>
    </Modal>
  );
};

export default MCPExternalRegistrationWizard;
