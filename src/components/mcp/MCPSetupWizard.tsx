import * as React from 'react';
import Helmet from 'react-helmet';
import {
  PageSection,
  Title,
  Wizard,
  WizardStep,
  Card,
  CardBody,
  CardHeader,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Button,
  Radio,
  Content,
  Popover,
  Alert,
} from '@patternfly/react-core';
import { HelpIcon } from '@patternfly/react-icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  K8sResourceCommon,
  useK8sWatchResource,
  useActiveNamespace,
} from '@openshift-console/dynamic-plugin-sdk';
import { RESOURCES } from '../../utils/resources';
import { GatewayResource } from '../gateway/types';
import { HTTPRouteResource } from '../httproute/types';
import { MCPWizardFormState, MCPGatewayExtension, initialFormState } from './types';
import MCPExtensionStep from './MCPExtensionStep';
import MCPVerifyStep, { VerifyStepItem, WatchResourceConfig } from './MCPVerifyStep';
import GatewayCreatePage from '../gateway/GatewayCreatePage';
import HTTPRouteCreatePage from '../httproute/HTTPRouteCreatePage';
import { GatewayForSelect } from '../../utils/ParentReferencesSelect';
import '../css/gateway-api-plugin.css';

const MCPSetupWizard: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const navigate = useNavigate();
  const [activeNamespace] = useActiveNamespace();
  const resolvedNamespace =
    !activeNamespace || activeNamespace === '#ALL_NS#' ? 'default' : activeNamespace;
  // Freeze namespace at mount so mid-wizard namespace changes don't cause stale resources
  const [selectedNamespace] = React.useState(resolvedNamespace);

  const [newGatewayResource, setNewGatewayResource] = React.useState<GatewayResource | null>(null);
  const [newGatewayValid, setNewGatewayValid] = React.useState(false);
  const [newRouteResource, setNewRouteResource] = React.useState<HTTPRouteResource | null>(null);
  const [newRouteValid, setNewRouteValid] = React.useState(false);
  const [extensionValid, setExtensionValid] = React.useState(false);

  const [formState, setFormState] = React.useState<MCPWizardFormState>({
    ...initialFormState,
    extensionNamespace: selectedNamespace,
    selectedGatewayNamespace: selectedNamespace,
    selectedRouteNamespace: selectedNamespace,
  });

  // Watch existing Gateways for Step 1 dropdown
  const [gateways, gatewaysLoaded, gatewaysError] = useK8sWatchResource<GatewayResource[]>({
    groupVersionKind: RESOURCES.Gateway.gvk,
    isList: true,
    namespace: selectedNamespace,
  });

  // Watch existing HTTPRoutes for Step 2 dropdown
  const [httpRoutes, routesLoaded, routesError] = useK8sWatchResource<HTTPRouteResource[]>({
    groupVersionKind: RESOURCES.HTTPRoute.gvk,
    isList: true,
    namespace: selectedNamespace,
  });

  const updateFormState = React.useCallback((updates: Partial<MCPWizardFormState>) => {
    setFormState((prev) => ({ ...prev, ...updates }));
  }, []);

  // When a gateway is selected, auto-populate the target gateway in Step 3
  React.useEffect(() => {
    if (formState.gatewayMode === 'existing' && formState.selectedGatewayName) {
      updateFormState({ targetGateway: formState.selectedGatewayName });
    } else if (formState.gatewayMode === 'new' && formState.newGatewayName) {
      updateFormState({ targetGateway: formState.newGatewayName });
    }
  }, [
    formState.gatewayMode,
    formState.selectedGatewayName,
    formState.newGatewayName,
    updateFormState,
  ]);

  // Get listeners from the selected gateway for the listener dropdown in Step 3
  const selectedGateway = React.useMemo(() => {
    if (formState.gatewayMode !== 'existing' || !formState.selectedGatewayName) return undefined;
    return (gateways || []).find((gw) => gw.metadata?.name === formState.selectedGatewayName);
  }, [gateways, formState.gatewayMode, formState.selectedGatewayName]);

  // Expose the Step 1 draft Gateway to Step 2's parentRef selector before it is
  // persisted (created only at the Verify step). newGatewayResource is already
  // pinned to the frozen wizard namespace at storage time. See issue #795.
  const draftGateways = React.useMemo<GatewayForSelect[]>(() => {
    if (formState.gatewayMode !== 'new' || !newGatewayResource) return [];
    return [newGatewayResource as GatewayForSelect];
  }, [formState.gatewayMode, newGatewayResource]);

  const extensionNamespace = formState.extensionNamespace || selectedNamespace;
  const gatewayNamespace = formState.selectedGatewayNamespace || selectedNamespace;
  const isCrossNamespace = extensionNamespace !== gatewayNamespace;

  const verifyItems = React.useMemo<VerifyStepItem[]>(() => {
    const result: VerifyStepItem[] = [];

    if (formState.gatewayMode === 'new' && newGatewayResource) {
      result.push({
        type: 'create',
        id: 'create-gateway',
        label: t('Create Gateway'),
        resource: newGatewayResource,
        successMessage: t('Gateway created successfully'),
      });
    }

    if (formState.routeMode === 'new' && newRouteResource) {
      result.push({
        type: 'create',
        id: 'create-route',
        label: t('Create HTTPRoute'),
        resource: newRouteResource,
        successMessage: t('HTTPRoute created successfully'),
      });
    }

    if (isCrossNamespace) {
      result.push({
        type: 'create',
        id: 'create-ref-grant',
        label: t('Create ReferenceGrant'),
        resource: {
          apiVersion: 'gateway.networking.k8s.io/v1beta1',
          kind: 'ReferenceGrant',
          metadata: {
            name: `${formState.extensionName}-ref-grant`,
            namespace: gatewayNamespace,
          },
          spec: {
            from: [
              {
                group: 'mcp.kuadrant.io',
                kind: 'MCPGatewayExtension',
                namespace: extensionNamespace,
              },
            ],
            to: [
              {
                group: 'gateway.networking.k8s.io',
                kind: 'Gateway',
                name: formState.targetGateway,
              },
            ],
          },
        } as K8sResourceCommon,
        successMessage: t('ReferenceGrant created successfully'),
      });
    } else {
      result.push({
        type: 'info',
        id: 'ref-grant-check',
        label: t('ReferenceGrant check'),
        message: t('No reference grant needed'),
      });
    }

    const mcpExtensionResource: MCPGatewayExtension = {
      apiVersion: 'mcp.kuadrant.io/v1',
      kind: 'MCPGatewayExtension',
      metadata: {
        name: formState.extensionName,
        namespace: extensionNamespace,
      },
      spec: {
        targetRef: {
          group: 'gateway.networking.k8s.io',
          kind: 'Gateway',
          name: formState.targetGateway,
          namespace: gatewayNamespace,
          sectionName: formState.sectionName,
        },
        ...(formState.overrideHostnames && formState.publicHost
          ? { publicHost: formState.publicHost }
          : {}),
        ...(formState.overrideHostnames && formState.privateHost
          ? { privateHost: formState.privateHost }
          : {}),
        ...(formState.sessionStorageEnabled && formState.sessionStoreSecretName
          ? { sessionStore: { secretName: formState.sessionStoreSecretName } }
          : {}),
        ...(formState.oauthEnabled && formState.oauthAuthorizationServers
          ? {
              oauthProtectedResource: {
                authorizationServers: formState.oauthAuthorizationServers
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
                ...(formState.oauthResourceName
                  ? { resourceName: formState.oauthResourceName }
                  : {}),
              },
            }
          : {}),
      },
    };

    result.push({
      type: 'create',
      id: 'create-extension',
      label: t('Create MCPGatewayExtension'),
      resource: mcpExtensionResource,
      successMessage: t('MCPGatewayExtension created successfully'),
    });

    return result;
  }, [
    formState,
    newGatewayResource,
    newRouteResource,
    isCrossNamespace,
    extensionNamespace,
    gatewayNamespace,
    t,
  ]);

  const verifyWatchResource = React.useMemo<WatchResourceConfig>(
    () => ({
      gvk: RESOURCES.MCPGatewayExtension.gvk,
      name: formState.extensionName,
      namespace: extensionNamespace,
    }),
    [formState.extensionName, extensionNamespace],
  );

  const handleCancel = () => {
    navigate(`/kuadrant/mcp/overview/ns/${selectedNamespace}`);
  };

  // Step 1 validation: must have a gateway selected or a valid new gateway form
  const isStep1Valid =
    (formState.gatewayMode === 'existing' && formState.selectedGatewayName !== '') ||
    (formState.gatewayMode === 'new' && newGatewayValid);

  // Step 2 validation: must have a route selected or a valid new route form
  const isStep2Valid =
    (formState.routeMode === 'existing' && formState.selectedRouteName !== '') ||
    (formState.routeMode === 'new' && newRouteValid);

  return (
    <>
      <Helmet>
        <title data-test="mcp-setup-wizard-title">{t('MCP Gateway Setup')}</title>
      </Helmet>
      <PageSection hasBodyWrapper={false}>
        <div className="co-m-nav-title">
          <Title headingLevel="h1">{t('MCP Gateway Setup')}</Title>
          <p className="help-block co-m-pane__heading-help-text">
            {t(
              'Set up the infrastructure needed to expose MCP servers through a gateway. This wizard will guide you through creating a gateway, route, and MCP extension.',
            )}
          </p>
        </div>
      </PageSection>
      <PageSection hasBodyWrapper={false}>
        <Wizard onClose={handleCancel} isVisitRequired>
          {/* Step 1: Create Gateway */}
          <WizardStep
            name={t('1. Create Gateway')}
            id="step-gateway"
            footer={{
              nextButtonText: t('Next'),
              isNextDisabled: !isStep1Valid,
            }}
          >
            <Title headingLevel="h2" style={{ marginBottom: '16px' }}>
              {t('Choose or create a Gateway')}
            </Title>
            <Content component="p" style={{ marginBottom: '24px' }}>
              {t('Select an existing gateway or create a new one to handle MCP traffic.')}
            </Content>

            <Card style={{ marginBottom: '16px' }}>
              <CardHeader>
                <Radio
                  id="gateway-mode-existing"
                  name="gateway-mode"
                  label={t('Choose an existing Gateway')}
                  isChecked={formState.gatewayMode === 'existing'}
                  onChange={() => updateFormState({ gatewayMode: 'existing' })}
                />
              </CardHeader>
              {formState.gatewayMode === 'existing' && (
                <CardBody>
                  <FormGroup
                    label={
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {t('Gateway name')}
                        <Popover
                          bodyContent={t(
                            'Select a gateway that will receive MCP traffic. The gateway must have at least one listener configured.',
                          )}
                        >
                          <Button variant="plain" aria-label={t('Gateway name help')}>
                            <HelpIcon />
                          </Button>
                        </Popover>
                      </div>
                    }
                    fieldId="gateway-select"
                  >
                    <FormSelect
                      id="gateway-select"
                      value={formState.selectedGatewayName}
                      onChange={(_event, value) =>
                        updateFormState({
                          gatewayMode: 'existing',
                          selectedGatewayName: value,
                          selectedGatewayNamespace:
                            (gateways || []).find((gw) => gw.metadata?.name === value)?.metadata
                              ?.namespace || selectedNamespace,
                        })
                      }
                      aria-label={t('Select a Gateway')}
                      data-test="mcp-gateway-select"
                      isDisabled={!gatewaysLoaded}
                    >
                      <FormSelectOption
                        value=""
                        label={
                          !gatewaysLoaded ? t('Loading gateways...') : t('Select a gateway...')
                        }
                        isPlaceholder
                      />
                      {(gateways || []).map((gw) => (
                        <FormSelectOption
                          key={`${gw.metadata?.namespace}/${gw.metadata?.name}`}
                          value={gw.metadata?.name || ''}
                          label={`${gw.metadata?.name} (${gw.metadata?.namespace})`}
                        />
                      ))}
                    </FormSelect>
                  </FormGroup>
                  {gatewaysError && (
                    <Alert
                      variant="warning"
                      title={t('Could not load gateways')}
                      isInline
                      style={{ marginTop: '8px' }}
                    >
                      {String(gatewaysError)}
                    </Alert>
                  )}
                </CardBody>
              )}
            </Card>

            <Card>
              <CardHeader>
                <Radio
                  id="gateway-mode-new"
                  name="gateway-mode"
                  label={t('Create a new Gateway')}
                  isChecked={formState.gatewayMode === 'new'}
                  onChange={() => updateFormState({ gatewayMode: 'new' })}
                />
              </CardHeader>
              {formState.gatewayMode === 'new' && (
                <CardBody>
                  <div className="kuadrant-mcp-embedded-form">
                    <GatewayCreatePage
                      onFormChange={(resource, isValid) => {
                        // Pin the namespace to the frozen wizard namespace so the
                        // Gateway created at Verify and the draft shown in Step 2
                        // never diverge if the active namespace changes mid-wizard.
                        setNewGatewayResource({
                          ...resource,
                          metadata: { ...resource.metadata, namespace: selectedNamespace },
                        });
                        setNewGatewayValid(isValid);
                        updateFormState({
                          newGatewayName: resource.metadata?.name || '',
                          targetGateway: resource.metadata?.name || '',
                        });
                      }}
                    />
                  </div>
                </CardBody>
              )}
            </Card>
          </WizardStep>

          {/* Step 2: Route for Gateway */}
          <WizardStep
            name={t('2. Route for Gateway')}
            id="step-route"
            footer={{
              nextButtonText: t('Next'),
              isNextDisabled: !isStep2Valid,
            }}
          >
            <Title headingLevel="h2" style={{ marginBottom: '16px' }}>
              {t('Choose or create an HTTPRoute')}
            </Title>
            <Content component="p" style={{ marginBottom: '24px' }}>
              {t('Select an existing route or create a new one to direct traffic to MCP servers.')}
            </Content>

            <Card style={{ marginBottom: '16px' }}>
              <CardHeader>
                <Radio
                  id="route-mode-existing"
                  name="route-mode"
                  label={t('Choose an existing HTTPRoute')}
                  isChecked={formState.routeMode === 'existing'}
                  onChange={() => updateFormState({ routeMode: 'existing' })}
                />
              </CardHeader>
              {formState.routeMode === 'existing' && (
                <CardBody>
                  <FormGroup
                    label={
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {t('HTTPRoute name')}
                        <Popover
                          bodyContent={t(
                            'Select an HTTPRoute that defines how traffic reaches your MCP servers.',
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
                      value={formState.selectedRouteName}
                      onChange={(_event, value) =>
                        updateFormState({
                          routeMode: 'existing',
                          selectedRouteName: value,
                          selectedRouteNamespace:
                            (httpRoutes || []).find((r) => r.metadata?.name === value)?.metadata
                              ?.namespace || selectedNamespace,
                        })
                      }
                      aria-label={t('Select an HTTPRoute')}
                      data-test="mcp-route-select"
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
                  isChecked={formState.routeMode === 'new'}
                  onChange={() => updateFormState({ routeMode: 'new' })}
                />
              </CardHeader>
              {formState.routeMode === 'new' && (
                <CardBody>
                  <div className="kuadrant-mcp-embedded-form">
                    <HTTPRouteCreatePage
                      extraGateways={draftGateways}
                      onFormChange={(resource, isValid) => {
                        setNewRouteResource(resource);
                        setNewRouteValid(isValid);
                        updateFormState({
                          newRouteName: resource.metadata?.name || '',
                        });
                      }}
                    />
                  </div>
                </CardBody>
              )}
            </Card>
          </WizardStep>

          {/* Step 3: MCP Extension */}
          <WizardStep
            name={t('3. MCP Extension')}
            id="step-extension"
            footer={{
              nextButtonText: t('Next'),
              isNextDisabled: !extensionValid,
            }}
          >
            <MCPExtensionStep
              formState={formState}
              updateFormState={updateFormState}
              selectedGateway={selectedGateway}
              selectedNamespace={selectedNamespace}
              onValidationChange={setExtensionValid}
            />
          </WizardStep>

          {/* Step 4: Verify configuration */}
          <WizardStep
            name={t('4. Verify configuration')}
            id="step-verify"
            footer={{
              nextButtonText: t('Done'),
              onNext: () => navigate(`/kuadrant/mcp/overview/ns/${selectedNamespace}`),
              isBackHidden: true,
            }}
          >
            <MCPVerifyStep
              items={verifyItems}
              watchResource={verifyWatchResource}
              selectedNamespace={selectedNamespace}
              title={t('Verify configuration')}
              description={t(
                'Creating and verifying your MCP infrastructure. You can navigate away at any time — resources that have been created will persist.',
              )}
              watchLabel={t('MCP Extension is ready')}
              watchSuccessMessage={t('MCP Extension is running and healthy')}
              showOverviewLink
            />
          </WizardStep>
        </Wizard>
      </PageSection>
    </>
  );
};

export default MCPSetupWizard;
