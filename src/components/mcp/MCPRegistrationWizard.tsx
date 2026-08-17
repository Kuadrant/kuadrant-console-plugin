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
  Content,
  Title,
  Popover,
  Button,
} from '@patternfly/react-core';
import { HelpIcon } from '@patternfly/react-icons';
import { useK8sWatchResource, useActiveNamespace } from '@openshift-console/dynamic-plugin-sdk';
import { MCPRegistrationFormState, initialServerFormState } from './types';
import { RESOURCES } from '../../utils/resources';
import HTTPRouteCreatePage from '../httproute/HTTPRouteCreatePage';
import { HTTPRouteResource } from '../httproute/types';
import RegisterServerStep, { buildMCPServerYAML } from './steps/RegisterServerStep';
import MCPVerifyStep, { VerifyStepItem, WatchResourceConfig } from './MCPVerifyStep';

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

interface MCPRegistrationWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

const MCPRegistrationWizard: React.FC<MCPRegistrationWizardProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [selectedNamespaceRaw] = useActiveNamespace();
  const selectedNamespace =
    !selectedNamespaceRaw || selectedNamespaceRaw === '#ALL_NS#' ? 'default' : selectedNamespaceRaw;

  const [formState, setFormState] = React.useState<MCPRegistrationFormState>({
    server: { ...initialServerFormState },
  });
  const [routeMode, setRouteMode] = React.useState<'existing' | 'new'>('existing');
  const [selectedExistingRouteName, setSelectedExistingRouteName] = React.useState('');
  const [httpRouteResource, setHttpRouteResource] = React.useState<HTTPRouteResource | null>(null);
  const [httpRouteValid, setHttpRouteValid] = React.useState(false);
  const [resourcesCreated, setResourcesCreated] = React.useState(false);

  // Watch existing HTTPRoutes
  const [httpRoutes, routesLoaded, routesError] = useK8sWatchResource<HTTPRouteResource[]>({
    groupVersionKind: RESOURCES.HTTPRoute.gvk,
    isList: true,
    namespace: selectedNamespace,
  });

  const handleClose = () => {
    setFormState({
      server: { ...initialServerFormState },
    });
    setRouteMode('existing');
    setSelectedExistingRouteName('');
    setHttpRouteResource(null);
    setHttpRouteValid(false);
    setResourcesCreated(false);
    onClose();
  };

  const isStep1Valid =
    (routeMode === 'existing' && !!selectedExistingRouteName) ||
    (routeMode === 'new' && httpRouteValid && !!httpRouteResource);

  const isStep2Valid =
    !!formState.server.registrationName &&
    !!formState.server.namespace &&
    !!formState.server.toolPrefix;

  const verifyItems = React.useMemo<VerifyStepItem[]>(() => {
    const routeName =
      routeMode === 'existing' ? selectedExistingRouteName : httpRouteResource?.metadata?.name;
    if (!routeName) return [];

    const mcpServerResource = buildMCPServerYAML(formState.server, routeName);

    const items: VerifyStepItem[] = [];

    if (routeMode === 'new' && httpRouteResource) {
      items.push({
        type: 'create' as const,
        id: 'create-route',
        label: t('Create HTTPRoute'),
        resource: httpRouteResource,
        successMessage: t('HTTPRoute created successfully'),
      });
    }

    items.push({
      type: 'create' as const,
      id: 'create-server',
      label: t('Create MCPServerRegistration'),
      resource: mcpServerResource,
      successMessage: t('MCPServerRegistration created successfully'),
    });

    return items;
  }, [routeMode, selectedExistingRouteName, httpRouteResource, formState.server, t]);

  const verifyWatchResource = React.useMemo<WatchResourceConfig>(
    () => ({
      gvk: RESOURCES.MCPServerRegistration.gvk,
      name: formState.server.registrationName,
      namespace: formState.server.namespace,
    }),
    [formState.server.registrationName, formState.server.namespace],
  );

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      variant="large"
      aria-labelledby="mcp-wizard-modal-title"
    >
      <ModalHeader
        labelId="mcp-wizard-modal-title"
        title={t('Setup MCP server')}
        description={t(
          'Register an internal MCP server by creating an HTTPRoute and server registration',
        )}
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
              name={t('HTTPRoute for MCP server')}
              id="create-route"
              footer={{
                nextButtonText: t('Next'),
                isNextDisabled: !isStep1Valid,
              }}
            >
              <Title headingLevel="h2" style={{ marginBottom: '16px' }}>
                {t('Choose or create an HTTPRoute')}
              </Title>
              <Content component="p" style={{ marginBottom: '24px' }}>
                {t('Select an existing route or create a new one for the MCP server.')}
              </Content>

              <Card style={{ marginBottom: '16px' }}>
                <CardHeader>
                  <Radio
                    id="route-mode-existing"
                    name="route-mode"
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
                      fieldId="route-select"
                    >
                      <FormSelect
                        id="route-select"
                        value={selectedExistingRouteName}
                        onChange={(_event, value) => setSelectedExistingRouteName(value)}
                        aria-label={t('Select an HTTPRoute')}
                        data-test="mcp-registration-route-select"
                        isDisabled={!routesLoaded}
                      >
                        <FormSelectOption
                          value=""
                          label={!routesLoaded ? t('Loading routes...') : t('Select a route...')}
                          isPlaceholder
                        />
                        {(httpRoutes || []).map((route) => (
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
                    id="route-mode-new"
                    name="route-mode"
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
                          const routeNs = resource.metadata?.namespace;
                          if (!formState.server.namespace && routeNs) {
                            setFormState((prev) => ({
                              ...prev,
                              server: { ...prev.server, namespace: routeNs },
                            }));
                          }
                        }}
                      />
                    </div>
                  </CardBody>
                )}
              </Card>
            </WizardStep>

            <WizardStep
              name={t('Register MCP server')}
              id="register-server"
              isDisabled={!isStep1Valid}
              footer={{
                nextButtonText: t('Next'),
                isNextDisabled: !isStep2Valid,
              }}
            >
              <RegisterServerStep
                formState={formState.server}
                onChange={(server) => setFormState((prev) => ({ ...prev, server }))}
                routeName={
                  routeMode === 'existing'
                    ? selectedExistingRouteName
                    : httpRouteResource?.metadata?.name
                }
              />
            </WizardStep>

            <WizardStep
              name={t('Verify MCP server')}
              id="verify-server"
              isDisabled={!isStep1Valid || !isStep2Valid}
              footer={{
                nextButtonText: t('Finish'),
                isNextDisabled: !resourcesCreated,
              }}
            >
              <MCPVerifyStep
                items={verifyItems}
                watchResource={verifyWatchResource}
                selectedNamespace={formState.server.namespace}
                title={t('Verify MCP server')}
                description={t(
                  'Creating and verifying your MCP server registration. Resources will be removed if registration fails.',
                )}
                watchLabel={t('MCP server is ready')}
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

export default MCPRegistrationWizard;
