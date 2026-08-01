import * as React from 'react';
import Helmet from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom-v5-compat';
import '../kuadrant.css';
import { PageSection } from '@patternfly/react-core';
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
      name: routeName ?? undefined,
      isList: false,
    },
  };

  const watchedResources = useK8sWatchResources<{ gateway: K8sResourceCommon }>(resources);
  const { loaded, loadError, data: gateway } = watchedResources.gateway;

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Attached')}</title>
      </Helmet>
      {!loaded ? (
        <PageSection hasBodyWrapper={false}>
          <div>{t('Loading...')}</div>
        </PageSection>
      ) : loadError ? (
        <PageSection hasBodyWrapper={false}>
          <div>{t('Error loading Gateway: {{message}}', { message: loadError.message })}</div>
        </PageSection>
      ) : (
        <AttachedResources resource={gateway} />
      )}
    </>
  );
};

export default GatewaySingleOverview;
