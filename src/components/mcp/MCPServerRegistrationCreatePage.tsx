import * as React from 'react';
import Helmet from 'react-helmet';
import {
  PageSection,
  Title,
  Tabs,
  Tab,
  TabTitleText,
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
import { useLocation } from 'react-router';
import { RESOURCES } from '../../utils/resources';
import { MCPServerRegistration } from './types';
import { buildMCPServerRegistrationTemplate } from './mcpResourceUtils';
import '../css/gateway-api-plugin.css';

// Standalone create/edit page for MCPServerRegistration resources.
//
// The Form tab is intentionally a placeholder for now: the server-registration
// form is delivered by the MCP server registration wizard (#673 / PR #738),
// which is not yet merged. Once it lands, the shared form fields will be
// extracted (mirroring MCPExtensionFormFields) and dropped into the Form tab.
// The YAML tab is fully functional for create and edit today. Deletion is
// handled from the resource list kebab menu (DropdownWithKebab), matching the
// policy create/edit pages which have no page-level Delete button.
const MCPServerRegistrationCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const location = useLocation();
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

  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('yaml');
  const [yamlKey, setYamlKey] = React.useState(0);

  const isEdit = !!nameFromUrl;

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

  // Template for create; existing resource for edit (once loaded).
  const yamlResource = React.useMemo(
    () =>
      isEdit && existingLoaded && existingData
        ? existingData
        : buildMCPServerRegistrationTemplate(selectedNamespace),
    [isEdit, existingLoaded, existingData, selectedNamespace],
  );

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
          <Alert
            variant={AlertVariant.info}
            isInline
            title={t('The form editor for MCPServerRegistration is coming soon.')}
            data-test="mcp-registration-form-placeholder"
          >
            {t(
              'For now, please use the YAML tab to create and edit MCPServerRegistration resources.',
            )}
          </Alert>
          <div style={{ marginTop: '16px' }}>
            <Button variant="primary" onClick={() => handleViewSelect('yaml')}>
              {t('Switch to YAML')}
            </Button>
          </div>
        </PageSection>
      ) : (
        <>
          {isEdit && existingError && (
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
          )}
          {isEdit && !existingLoaded && !existingError ? (
            <div className="kuadrant-mcp-yaml-editor" style={{ minHeight: '400px' }}>
              {t('Loading YAML editor...')}
            </div>
          ) : (
            // On the edit path, only render the editor once the watch resolves so it
            // snapshots the real resource rather than the blank template (the editor
            // snapshots initialResource at mount and only remounts when its key changes).
            // Tying the key to existingLoaded guarantees a remount when the watch resolves.
            <div
              className="kuadrant-mcp-yaml-editor"
              style={{ minHeight: '400px' }}
              key={`${yamlKey}-${existingLoaded}`}
            >
              <React.Suspense fallback={<div>{t('Loading YAML editor...')}</div>}>
                <ResourceYAMLEditor initialResource={yamlResource} create={!isEdit} />
              </React.Suspense>
            </div>
          )}
        </>
      )}
    </>
  );
};

export default MCPServerRegistrationCreatePage;
