import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom-v5-compat';
import {
  PageSection,
  Title,
  Content,
  ContentVariants,
  EmptyState,
  EmptyStateBody,
  Alert,
} from '@patternfly/react-core';
import { FileCodeIcon } from '@patternfly/react-icons';
// SwaggerUI v5.10.5: Last version supporting React 17
// Chosen for interactive "try it out" functionality despite bundle size
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import yaml from 'js-yaml';
import { useK8sWatchResource, useActiveNamespace } from '@openshift-console/dynamic-plugin-sdk';
import { APIProduct } from './types';
import { RESOURCES } from '../../utils/resources';
import extractResourceNameFromURL from '../../utils/nameFromPath';
import '../kuadrant.css';

const APIProductDefinitionTab: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();
  const location = useLocation();
  const productName = extractResourceNameFromURL(location.pathname);

  const [apiProduct, loaded, loadError] = useK8sWatchResource<APIProduct>({
    groupVersionKind: RESOURCES.APIProduct.gvk,
    namespace: activeNamespace,
    name: productName,
    isList: false,
  });

  // Extract the OpenAPI spec
  const openapiSpec = apiProduct?.status?.openapi?.raw;

  // Cache the spec to handle watch reconnections where status might temporarily be missing
  const [cachedSpec, setCachedSpec] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (openapiSpec) {
      setCachedSpec(openapiSpec);
    }
  }, [openapiSpec]);

  const specToUse = openapiSpec || cachedSpec;

  // Parse the OpenAPI spec (could be JSON or YAML string)
  const parsedSpec = React.useMemo(() => {
    if (!specToUse) return null;

    try {
      // Try to parse as JSON first
      return JSON.parse(specToUse);
    } catch {
      // If JSON parsing fails, try YAML
      try {
        return yaml.load(specToUse);
      } catch (error) {
        console.error('Failed to parse OpenAPI spec:', error);
        return null;
      }
    }
  }, [specToUse]);

  if (loadError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Alert variant="danger" isInline title={t('Error loading API Product')}>
          {loadError.message}
        </Alert>
      </PageSection>
    );
  }

  if (!loaded || !apiProduct) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Content component={ContentVariants.p}>{t('Loading...')}</Content>
      </PageSection>
    );
  }

  // Only show empty state if we've never had a spec (initial load with no data)
  if (!specToUse) {
    return (
      <PageSection hasBodyWrapper={false}>
        <EmptyState
          titleText={
            <Title headingLevel="h4" size="lg">
              {t('No OpenAPI specification available')}
            </Title>
          }
          icon={FileCodeIcon}
        >
          <EmptyStateBody>
            {t('This API Product does not have an OpenAPI specification in its status.')}
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  if (!parsedSpec) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Alert variant="danger" isInline title={t('Error parsing OpenAPI specification')}>
          {t('The OpenAPI specification could not be parsed. It may be malformed.')}
        </Alert>
      </PageSection>
    );
  }

  return (
    <PageSection hasBodyWrapper={false} className="apiproduct-definition-page">
      <SwaggerUI spec={parsedSpec} />
    </PageSection>
  );
};

export default APIProductDefinitionTab;
