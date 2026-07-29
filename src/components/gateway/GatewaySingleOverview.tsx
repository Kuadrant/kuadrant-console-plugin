import * as React from 'react';
import Helmet from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { PageSection, Title } from '@patternfly/react-core';
import { useLocation } from 'react-router-dom-v5-compat';
import '../kuadrant.css';
import {
  useK8sWatchResources,
  K8sResourceCommon,
  useActiveNamespace,
} from '@openshift-console/dynamic-plugin-sdk';
import { RESOURCES } from '../../utils/resources';
import extractResourceNameFromURL from '../../utils/nameFromPath';
import AttachedResources from '../AttachedResources';

const GatewaySingleOverview: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();
  const location = useLocation();

  const routeName = extractResourceNameFromURL(location.pathname);
  const resources = {
    gateway: {
      groupVersionKind: RESOURCES.Gateway.gvk,
      namespace: activeNamespace,
      name: routeName,
      isList: false,
    },
  };

  const watchedResources = useK8sWatchResources<{ gateway: K8sResourceCommon }>(resources);
  const { loaded, loadError, data: gateway } = watchedResources.gateway;

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Attached Resources')}</title>
      </Helmet>
      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h2">{t('Attached Resources')}</Title>
        {!loaded ? (
          <div>{t('Loading...')}</div>
        ) : loadError ? (
          <div>{t('Error loading Gateway: {{message}}', { message: loadError.message })}</div>
        ) : (
          <AttachedResources resource={gateway} />
        )}
      </PageSection>
    </>
  );
};

export default GatewaySingleOverview;
