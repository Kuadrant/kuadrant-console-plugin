import * as React from 'react';
import Helmet from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { PageSection, Title } from '@patternfly/react-core';
import { useLocation } from 'react-router-dom-v5-compat';
import './kuadrant.css';
import AssociatedResourceList from './AssociatedResourceList';
import {
  useK8sWatchResources,
  K8sResourceCommon,
  useActiveNamespace,
} from '@openshift-console/dynamic-plugin-sdk';

import extractResourceNameFromURL from '../utils/nameFromPath';
import { RESOURCES } from '../utils/resources';

const GRPCRoutePoliciesPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();
  const location = useLocation();

  const routeName = extractResourceNameFromURL(location.pathname);

  const resources = {
    grpcRoute: {
      groupVersionKind: RESOURCES.GRPCRoute.gvk,
      namespace: activeNamespace,
      name: routeName,
      isList: false,
    },
  };

  const watchedResources = useK8sWatchResources<{ grpcRoute: K8sResourceCommon }>(resources);
  const { loaded, loadError, data: grpcRoute } = watchedResources.grpcRoute;

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Kuadrant Policies')}</title>
      </Helmet>
      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h2">{t('Kuadrant Policies')}</Title>
        {!loaded ? (
          <div>{t('Loading GRPCRoute...')}</div>
        ) : loadError ? (
          <div>
            {t('Error loading GRPCRoute')}: {loadError.message}
          </div>
        ) : (
          <AssociatedResourceList resource={grpcRoute} />
        )}
      </PageSection>
    </>
  );
};

export default GRPCRoutePoliciesPage;
