import * as React from 'react';
import Helmet from 'react-helmet';
import {
  PageSection,
  Title,
  Tabs,
  Tab,
  TabTitleText,
  ActionGroup,
  Button,
  Alert,
  AlertVariant,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import {
  ResourceYAMLEditor,
  useK8sWatchResource,
  useActiveNamespace,
} from '@openshift-console/dynamic-plugin-sdk';
import { useLocation, useNavigate } from 'react-router';
import { RESOURCES } from '../../utils/resources';
import { MCPWizardFormState, initialFormState, MCPGatewayExtension } from './types';
import { GatewayResource } from '../gateway/types';
import {
  buildMCPGatewayExtension,
  mcpExtensionToFormState,
  isMCPGatewayExtensionValid,
} from './mcpResourceUtils';
import MCPExtensionFormFields from './MCPExtensionFormFields';
import KuadrantCreateUpdate from '../KuadrantCreateUpdate';
import { getModelFromResource } from '../../utils/getModelFromResource';
import { handleCancel } from '../../utils/cancel';
import '../css/gateway-api-plugin.css';

// Standalone create/edit page for MCPGatewayExtension resources.
// Reuses the extension form fields shared with the MCP setup wizard (step 3).
const MCPGatewayExtensionCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const location = useLocation();
  const navigate = useNavigate();
  const [activeNamespaceRaw] = useActiveNamespace();

  // Parse namespace / name / mode from the URL.
  // Create (console.resource/create): `/k8s/ns/:ns/<group>~<version>~<kind>/~new`
  // Edit (console.page/route):        `/k8s/ns/:ns/mcpgatewayextension/name/:name/edit`
  const segments = location.pathname.split('/');
  const nsIndex = segments.indexOf('ns');
  const namespaceFromUrl = nsIndex >= 0 ? segments[nsIndex + 1] : undefined;
  const nameIndex = segments.indexOf('name');
  const nameFromUrl = nameIndex >= 0 ? segments[nameIndex + 1] : undefined;
  const isEditRoute = !!nameFromUrl;

  const activeNamespace =
    !activeNamespaceRaw || activeNamespaceRaw === '#ALL_NS#' ? 'default' : activeNamespaceRaw;
  const selectedNamespace = namespaceFromUrl || activeNamespace;

  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');
  const [yamlKey, setYamlKey] = React.useState(0);
  const [formState, setFormState] = React.useState<MCPWizardFormState>({
    ...initialFormState,
    extensionNamespace: selectedNamespace,
    selectedGatewayNamespace: selectedNamespace,
  });
  const [originalMetadata, setOriginalMetadata] = React.useState<
    MCPGatewayExtension['metadata'] | null
  >(null);

  const isEdit = isEditRoute;

  const updateFormState = React.useCallback((updates: Partial<MCPWizardFormState>) => {
    setFormState((prev) => ({ ...prev, ...updates }));
  }, []);

  // The Namespace field is hidden on this standalone page (namespace comes from the
  // console's namespace picker instead), so keep formState.extensionNamespace in sync
  // with it rather than letting it go stale from the initial mount value.
  React.useEffect(() => {
    if (!isEditRoute) {
      updateFormState({ extensionNamespace: selectedNamespace });
    }
  }, [isEditRoute, selectedNamespace, updateFormState]);

  // In edit mode, watch the existing resource and populate the form once.
  const watchResource = React.useMemo(
    () =>
      isEditRoute
        ? {
            groupVersionKind: RESOURCES.MCPGatewayExtension.gvk,
            isList: false,
            name: nameFromUrl,
            namespace: namespaceFromUrl,
          }
        : null,
    [isEditRoute, nameFromUrl, namespaceFromUrl],
  );

  const [existingData, existingLoaded, existingError] =
    useK8sWatchResource<MCPGatewayExtension>(watchResource);
  const hasInitialized = React.useRef(false);

  React.useEffect(() => {
    if (
      watchResource &&
      existingLoaded &&
      !existingError &&
      existingData &&
      !hasInitialized.current
    ) {
      setOriginalMetadata(existingData.metadata);
      updateFormState(mcpExtensionToFormState(existingData, selectedNamespace));
      hasInitialized.current = true;
    }
  }, [
    watchResource,
    existingLoaded,
    existingError,
    existingData,
    selectedNamespace,
    updateFormState,
  ]);

  // Watch gateways so the listener-name dropdown can populate from the target gateway.
  const [gateways] = useK8sWatchResource<GatewayResource[]>({
    groupVersionKind: RESOURCES.Gateway.gvk,
    isList: true,
    namespace: formState.selectedGatewayNamespace || selectedNamespace,
  });
  const selectedGateway = React.useMemo(
    () => (gateways || []).find((gw) => gw.metadata?.name === formState.targetGateway),
    [gateways, formState.targetGateway],
  );
  const gatewayNames = React.useMemo(
    () =>
      (gateways || [])
        .map((gw) => gw.metadata?.name || '')
        .filter(Boolean)
        .sort(),
    [gateways],
  );

  const extensionResource = React.useMemo(
    () => buildMCPGatewayExtension(formState, selectedNamespace, originalMetadata),
    [formState, selectedNamespace, originalMetadata],
  );

  // YAML tab: existing resource for edit (once loaded), form-built resource for create.
  // On edit, formState is populated by an effect that runs after existingLoaded flips
  // true, so snapshot the loaded resource directly to avoid an empty first mount.
  const yamlResource = React.useMemo(
    () => (isEdit && existingLoaded && existingData ? existingData : extensionResource),
    [isEdit, existingLoaded, existingData, extensionResource],
  );

  // Build the K8s model synchronously from the resource (matches the wizard and
  // policy pages). useK8sModel returns undefined for this plugin-declared CRD.
  const extensionModel = React.useMemo(
    () => getModelFromResource(extensionResource),
    [extensionResource],
  );

  const redirectPath = `/kuadrant/mcp/overview/ns/${
    extensionResource.metadata?.namespace || selectedNamespace
  }`;

  const handleViewSelect = (view: 'form' | 'yaml') => {
    if (view === 'yaml') setYamlKey((k) => k + 1);
    setCreateView(view);
  };

  return (
    <>
      <Helmet>
        <title data-test="mcp-extension-page-title">
          {isEdit ? t('Edit MCPGatewayExtension') : t('Create MCPGatewayExtension')}
        </title>
      </Helmet>
      <PageSection hasBodyWrapper={false}>
        <div className="co-m-nav-title">
          <Title headingLevel="h1">
            {isEdit ? t('Edit MCPGatewayExtension') : t('Create MCPGatewayExtension')}
          </Title>
          <p className="help-block co-m-pane__heading-help-text">
            {t('An MCPGatewayExtension connects a gateway listener to MCP servers.')}
          </p>
        </div>

        <Tabs
          activeKey={createView}
          onSelect={(_event, tabIndex) => handleViewSelect(tabIndex as 'form' | 'yaml')}
          style={{ marginTop: '16px' }}
        >
          <Tab eventKey="form" title={<TabTitleText>{t('Form')}</TabTitleText>} />
          <Tab eventKey="yaml" title={<TabTitleText>{t('YAML')}</TabTitleText>} />
        </Tabs>
      </PageSection>

      {createView === 'form' ? (
        <PageSection hasBodyWrapper={false}>
          {/* MCPExtensionFormFields renders its own <Form> element, so we must not
              wrap it in another <Form> here (nested <form> is invalid HTML). The
              ActionGroup is rendered as a sibling in a plain container instead. */}
          <MCPExtensionFormFields
            formState={formState}
            updateFormState={updateFormState}
            selectedGateway={selectedGateway}
            selectedNamespace={selectedNamespace}
            disableIdentity={isEdit}
            gatewayNames={gatewayNames}
            showNamespaceField={false}
          />
          <ActionGroup>
            <KuadrantCreateUpdate
              validation={isMCPGatewayExtensionValid(formState)}
              model={extensionModel}
              resource={extensionResource}
              policyType="MCPGatewayExtension"
              navigate={navigate}
              redirectPath={redirectPath}
              update={isEdit}
            />
            <Button variant="link" onClick={() => handleCancel(navigate)}>
              {t('Cancel')}
            </Button>
          </ActionGroup>
        </PageSection>
      ) : isEdit && existingError ? (
        // Watch failed: show only the error, never mount the editor on an empty resource.
        <PageSection hasBodyWrapper={false}>
          <Alert
            variant={AlertVariant.danger}
            title={t('Error loading MCPGatewayExtension')}
            isInline
            data-test="mcp-extension-load-error"
          >
            {existingError instanceof Error ? existingError.message : String(existingError)}
          </Alert>
        </PageSection>
      ) : isEdit && !existingLoaded ? (
        <div className="kuadrant-mcp-standalone-yaml-editor" style={{ minHeight: '400px' }}>
          {t('Loading YAML editor...')}
        </div>
      ) : (
        // On the edit path, only render the editor once the watch resolves so it
        // snapshots the real resource rather than the blank template (the editor
        // snapshots initialResource at mount and only remounts when its key changes).
        // Tying the key to existingLoaded guarantees a remount when the watch resolves.
        <div
          className="kuadrant-mcp-standalone-yaml-editor"
          style={{ minHeight: '400px' }}
          key={`${yamlKey}-${existingLoaded}`}
        >
          <React.Suspense fallback={<div>{t('Loading YAML editor...')}</div>}>
            <ResourceYAMLEditor initialResource={yamlResource} create={!isEdit} />
          </React.Suspense>
        </div>
      )}
    </>
  );
};

export default MCPGatewayExtensionCreatePage;
