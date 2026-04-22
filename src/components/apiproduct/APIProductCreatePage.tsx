import * as React from 'react';
import Helmet from 'react-helmet';
import * as yaml from 'js-yaml';
import { PageSection, Title, Tabs, Tab, TabTitleText } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import {
  ResourceYAMLEditor,
  getGroupVersionKindForResource,
  useK8sWatchResource,
  useActiveNamespace,
  NamespaceBar,
} from '@openshift-console/dynamic-plugin-sdk';
import { useLocation, useNavigate } from 'react-router-dom-v5-compat';
import { APIProduct } from './types';
import APIProductForm, { APIProductFormData } from './APIProductForm';
import { RESOURCES } from '../../utils/resources';
import '../kuadrant.css';

const APIProductCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeTabKey, setActiveTabKey] = React.useState<string | number>(0);
  const [selectedNamespace] = useActiveNamespace();
  const location = useLocation();
  const navigate = useNavigate();
  const [isResourceNameManual, setIsResourceNameManual] = React.useState(false);

  const handleNamespaceChange = (namespace: string) => {
    if (namespace !== '#ALL_NS#') {
      navigate(`/kuadrant/ns/${namespace}/apiproducts/~new`, { replace: true });
    }
  };

  // Extract edit parameters from URL
  // Route: /kuadrant/ns/:ns/apiproducts/:name/edit
  // Split: ['', 'kuadrant', 'ns', 'namespace', 'apiproducts', 'name', 'edit']
  // Index:   0    1          2      3            4              5       6
  const pathSplit = location.pathname.split('/');
  const namespaceEdit = pathSplit[3];
  const nameEdit = pathSplit[5];
  const isEditMode = pathSplit[6] === 'edit';

  // Get APIProduct GVK
  const apiProductGVK = getGroupVersionKindForResource({
    apiVersion: `${RESOURCES.APIProduct.gvk.group}/${RESOURCES.APIProduct.gvk.version}`,
    kind: RESOURCES.APIProduct.gvk.kind,
  });

  // Fetch existing resource for edit mode
  // Always call the hook unconditionally (Rules of Hooks)
  const apiProductResource = nameEdit
    ? {
        groupVersionKind: apiProductGVK,
        isList: false,
        name: nameEdit,
        namespace: namespaceEdit,
      }
    : null;

  const [apiProductData, apiProductLoaded, apiProductError] =
    useK8sWatchResource<APIProduct>(apiProductResource);

  // Initialize form data from existing resource or blank
  const [formData, setFormData] = React.useState<APIProductFormData>(() => ({
    displayName: '',
    resourceName: '',
    version: '',
    description: '',
    tags: [],
    publishStatus: 'Draft',
    approvalMode: 'manual',
    openAPISpecURL: '',
    docsURL: '',
    httpRoute: null,
  }));

  // Load existing resource into form data
  React.useEffect(() => {
    if (apiProductLoaded && !apiProductError && apiProductData && !Array.isArray(apiProductData)) {
      const apiProduct = apiProductData as APIProduct;
      setFormData({
        displayName: apiProduct.spec.displayName || '',
        resourceName: apiProduct.metadata.name || '',
        version: apiProduct.spec.version || '',
        description: apiProduct.spec.description || '',
        tags: apiProduct.spec.tags || [],
        publishStatus: apiProduct.spec.publishStatus || 'Draft',
        approvalMode: apiProduct.spec.approvalMode || 'manual',
        openAPISpecURL: apiProduct.spec.documentation?.openAPISpecURL || '',
        docsURL: apiProduct.spec.documentation?.docsURL || '',
        httpRoute: apiProduct.spec.targetRef?.name
          ? {
              name: apiProduct.spec.targetRef.name,
              namespace: apiProduct.spec.targetRef.namespace ?? apiProduct.metadata.namespace,
            }
          : null,
      });
      // Mark as manual since we're editing an existing resource
      setIsResourceNameManual(true);
    }
  }, [apiProductData, apiProductLoaded, apiProductError]);

  // Construct APIProduct resource from form data
  const constructResource = (): APIProduct => {
    const apiVersion = `${RESOURCES.APIProduct.gvk.group}/${RESOURCES.APIProduct.gvk.version}`;
    const existingData = apiProductData && !Array.isArray(apiProductData) ? apiProductData : null;

    // Use the namespace from the edited resource in edit mode, otherwise use selected namespace
    const resourceNamespace = isEditMode
      ? existingData?.metadata?.namespace ?? namespaceEdit
      : selectedNamespace;

    const resource: any = {
      apiVersion,
      kind: RESOURCES.APIProduct.gvk.kind,
      metadata: {
        name: formData.resourceName,
        namespace: resourceNamespace,
      },
      spec: {
        displayName: formData.displayName,
        description: formData.description,
        tags: formData.tags,
        publishStatus: formData.publishStatus as 'Draft' | 'Published' | 'Deprecated' | 'Retired',
        approvalMode: formData.approvalMode,
      },
    };

    // Add version if provided
    if (formData.version) {
      resource.spec.version = formData.version;
    }

    // Add documentation object if any URL is provided
    if (formData.openAPISpecURL || formData.docsURL) {
      resource.spec.documentation = {};
      if (formData.openAPISpecURL) {
        resource.spec.documentation.openAPISpecURL = formData.openAPISpecURL;
      }
      if (formData.docsURL) {
        resource.spec.documentation.docsURL = formData.docsURL;
      }
    }

    // Only add metadata fields if editing existing resource
    if (existingData?.metadata?.creationTimestamp) {
      resource.metadata.creationTimestamp = existingData.metadata.creationTimestamp;
    }
    if (existingData?.metadata?.resourceVersion) {
      resource.metadata.resourceVersion = existingData.metadata.resourceVersion;
    }

    // Only add targetRef if httpRoute is selected
    if (formData.httpRoute?.name) {
      resource.spec.targetRef = {
        group: 'gateway.networking.k8s.io',
        kind: 'HTTPRoute',
        name: formData.httpRoute.name,
        namespace: formData.httpRoute.namespace,
      };
    }

    return resource as APIProduct;
  };

  // Handle YAML changes and update form data
  const handleYAMLChange = (yamlInput: string) => {
    try {
      const parsed = yaml.load(yamlInput) as any;
      const resourceName = parsed.metadata?.name || '';

      setFormData({
        displayName: parsed.spec?.displayName || '',
        resourceName,
        version: parsed.spec?.version || '',
        description: parsed.spec?.description || '',
        tags: parsed.spec?.tags || [],
        publishStatus: parsed.spec?.publishStatus || 'Draft',
        approvalMode: parsed.spec?.approvalMode || 'manual',
        openAPISpecURL: parsed.spec?.documentation?.openAPISpecURL || '',
        docsURL: parsed.spec?.documentation?.docsURL || '',
        httpRoute: parsed.spec?.targetRef?.name
          ? {
              name: parsed.spec.targetRef.name,
              namespace: parsed.spec.targetRef.namespace || selectedNamespace,
            }
          : null,
      });

      // If user provided a resourceName in YAML, mark it as manually edited
      if (resourceName) {
        setIsResourceNameManual(true);
      }
    } catch (e) {
      // Invalid YAML - don't update form data
      console.warn('Invalid YAML, not updating form data:', e);
    }
  };

  const yamlResource = constructResource();

  return (
    <>
      <Helmet>
        <title data-test="apiproduct-create-page-title">
          {isEditMode ? t('Edit API Product') : t('Create API Product')}
        </title>
      </Helmet>
      <NamespaceBar onNamespaceChange={handleNamespaceChange} />
      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h1" style={{ marginBottom: 'var(--pf-v6-global--spacer--lg)' }}>
          {isEditMode ? t('Edit API Product') : t('Create API Product')}
        </Title>

        <Tabs
          activeKey={activeTabKey}
          onSelect={(_event, tabIndex) => setActiveTabKey(tabIndex)}
          style={{ marginBottom: 'var(--pf-v6-global--spacer--lg)' }}
        >
          <Tab eventKey={0} title={<TabTitleText>{t('Form View')}</TabTitleText>} />
          <Tab eventKey={1} title={<TabTitleText>{t('YAML View')}</TabTitleText>} />
        </Tabs>

        {activeTabKey === 0 && (
          <APIProductForm
            obj={apiProductData && !Array.isArray(apiProductData) ? apiProductData : undefined}
            namespace={selectedNamespace}
            formData={formData}
            onFormDataChange={setFormData}
            isResourceNameManual={isResourceNameManual}
            setIsResourceNameManual={setIsResourceNameManual}
            isEditMode={isEditMode}
          />
        )}
      </PageSection>
      {activeTabKey === 1 && (
        <React.Suspense fallback={<div>{t('Loading...')}</div>}>
          <ResourceYAMLEditor
            initialResource={yamlResource}
            create={!isEditMode}
            onChange={handleYAMLChange}
          />
        </React.Suspense>
      )}
    </>
  );
};

export default APIProductCreatePage;
