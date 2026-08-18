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
  K8sResourceCommon,
  ResourceYAMLEditor,
  useK8sWatchResource,
  useActiveNamespace,
} from '@openshift-console/dynamic-plugin-sdk';
import { useLocation, useNavigate } from 'react-router';
import { RESOURCES } from '../../utils/resources';
import { MCPServerRegistration, MCPServerFormState, initialServerFormState } from './types';
import {
  buildMCPServerRegistration,
  mcpServerToFormState,
  isMCPServerRegistrationValid,
  buildMCPServerRegistrationTemplate,
} from './mcpResourceUtils';
import MCPServerRegistrationFormFields from './MCPServerRegistrationFormFields';
import KuadrantCreateUpdate from '../KuadrantCreateUpdate';
import { getModelFromResource } from '../../utils/getModelFromResource';
import { handleCancel } from '../../utils/cancel';
import '../css/gateway-api-plugin.css';

// Standalone create/edit page for MCPServerRegistration resources.
//
// The Form tab reuses MCPServerRegistrationFormFields, the shared field component
// also consumed by the MCP server registration wizard step (RegisterServerStep).
// The YAML tab is fully functional for create and edit. Deletion is handled from
// the resource list kebab menu (DropdownWithKebab), matching the policy create/edit
// pages which have no page-level Delete button.
const MCPServerRegistrationCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const location = useLocation();
  const navigate = useNavigate();
  const [activeNamespaceRaw] = useActiveNamespace();

  // Create (console.resource/create): `/k8s/ns/:ns/<group>~<version>~<kind>/~new`
  // Edit (console.page/route):        `/k8s/ns/:ns/mcpserverregistration/name/:name/edit`
  const segments = location.pathname.split('/');
  const nsIndex = segments.indexOf('ns');
  const namespaceFromUrl = nsIndex >= 0 ? segments[nsIndex + 1] : undefined;
  const nameIndex = segments.indexOf('name');
  const nameFromUrl = nameIndex >= 0 ? segments[nameIndex + 1] : undefined;

  const activeNamespace =
    !activeNamespaceRaw || activeNamespaceRaw === '#ALL_NS#' ? 'default' : activeNamespaceRaw;
  const selectedNamespace = namespaceFromUrl || activeNamespace;

  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');
  const [yamlKey, setYamlKey] = React.useState(0);
  const [formState, setFormState] = React.useState<MCPServerFormState>({
    ...initialServerFormState,
    namespace: selectedNamespace,
  });
  const [originalMetadata, setOriginalMetadata] = React.useState<
    MCPServerRegistration['metadata'] | null
  >(null);

  const isEdit = !!nameFromUrl;

  const handleChange = React.useCallback((field: keyof MCPServerFormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  }, []);

  // The Namespace field is hidden on this standalone page (namespace comes from the
  // console's namespace picker instead), so keep formState.namespace in sync with it
  // rather than letting it go stale from the initial mount value.
  React.useEffect(() => {
    if (!isEdit) {
      setFormState((prev) => ({ ...prev, namespace: selectedNamespace }));
    }
  }, [isEdit, selectedNamespace]);

  const watchResource = React.useMemo(
    () =>
      isEdit
        ? {
            groupVersionKind: RESOURCES.MCPServerRegistration.gvk,
            isList: false,
            name: nameFromUrl,
            namespace: namespaceFromUrl,
          }
        : null,
    [isEdit, nameFromUrl, namespaceFromUrl],
  );

  const [existingData, existingLoaded, existingError] =
    useK8sWatchResource<MCPServerRegistration>(watchResource);
  const hasInitialized = React.useRef(false);

  // In edit mode, populate the form once from the existing resource.
  React.useEffect(() => {
    if (
      watchResource &&
      existingLoaded &&
      !existingError &&
      existingData &&
      !hasInitialized.current
    ) {
      setOriginalMetadata(existingData.metadata);
      setFormState(mcpServerToFormState(existingData, selectedNamespace));
      hasInitialized.current = true;
    }
  }, [watchResource, existingLoaded, existingError, existingData, selectedNamespace]);

  // Watch HTTPRoutes so the Target HTTPRoute dropdown can populate from the namespace.
  // Namespace is not form-selectable on this page — it follows the console's
  // namespace picker (selectedNamespace) so switching it re-fetches routes.
  const [httpRoutes] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: RESOURCES.HTTPRoute.gvk,
    isList: true,
    namespace: selectedNamespace,
  });
  const httpRouteNames = React.useMemo(
    () =>
      (httpRoutes || [])
        .map((route) => route.metadata?.name || '')
        .filter(Boolean)
        .sort(),
    [httpRoutes],
  );

  // Resource built from form state, used by the Form tab's save action.
  const serverResource = React.useMemo(
    () => buildMCPServerRegistration(formState, selectedNamespace, originalMetadata),
    [formState, selectedNamespace, originalMetadata],
  );

  // Build the K8s model synchronously from the resource (matches the wizard and
  // policy pages). useK8sModel returns undefined for this plugin-declared CRD.
  const serverModel = React.useMemo(() => getModelFromResource(serverResource), [serverResource]);

  // YAML tab: existing resource for edit (once loaded), blank template for create.
  const yamlResource = React.useMemo(
    () =>
      isEdit && existingLoaded && existingData
        ? existingData
        : buildMCPServerRegistrationTemplate(selectedNamespace),
    [isEdit, existingLoaded, existingData, selectedNamespace],
  );

  const redirectPath = `/kuadrant/mcp/overview/ns/${
    serverResource.metadata?.namespace || selectedNamespace
  }`;

  const handleViewSelect = (view: 'form' | 'yaml') => {
    if (view === 'yaml') setYamlKey((k) => k + 1);
    setCreateView(view);
  };

  return (
    <>
      <Helmet>
        <title data-test="mcp-registration-page-title">
          {isEdit ? t('Edit MCPServerRegistration') : t('Create MCPServerRegistration')}
        </title>
      </Helmet>
      <PageSection hasBodyWrapper={false}>
        <div className="co-m-nav-title">
          <Title headingLevel="h1">
            {isEdit ? t('Edit MCPServerRegistration') : t('Create MCPServerRegistration')}
          </Title>
          <p className="help-block co-m-pane__heading-help-text">
            {t(
              'An MCPServerRegistration registers an HTTPRoute-backed server with an MCP gateway.',
            )}
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
          {/* MCPServerRegistrationFormFields renders its own <Form> element, so we must
              not wrap it in another <Form> here (nested <form> is invalid HTML). The
              ActionGroup is rendered as a sibling in a plain container instead. */}
          <MCPServerRegistrationFormFields
            formState={formState}
            onChange={handleChange}
            httpRouteNames={httpRouteNames}
            disableIdentity={isEdit}
          />
          <ActionGroup>
            <KuadrantCreateUpdate
              validation={isMCPServerRegistrationValid(formState)}
              model={serverModel}
              resource={serverResource}
              policyType="MCPServerRegistration"
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
            title={t('Error loading MCPServerRegistration')}
            isInline
            data-test="mcp-registration-load-error"
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

export default MCPServerRegistrationCreatePage;
