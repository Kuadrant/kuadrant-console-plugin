import * as React from 'react';
import Helmet from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { Page, PageSection, Title } from '@patternfly/react-core';
import { useLocation } from 'react-router-dom';
import './kuadrant.css';
import AssociatedResourceList from './AssociatedResourceList';
import {
  useK8sWatchResources,
  K8sResourceCommon,
  useActiveNamespace,
} from '@openshift-console/dynamic-plugin-sdk';

import extractResourceNameFromURL from '../utils/nameFromPath';

const HTTPRoutePoliciesPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();
  const location = useLocation();

  const routeName = extractResourceNameFromURL(location.pathname);

  const resources = {
    httpRoute: {
      groupVersionKind: {
        group: 'gateway.networking.k8s.io',
        version: 'v1',
        kind: 'HTTPRoute',
      },
      namespace: activeNamespace,
      name: routeName,
      isList: false,
    },
  };

  const watchedResources = useK8sWatchResources<{ httpRoute: K8sResourceCommon }>(resources);
  const { loaded, loadError, data: httpRoute } = watchedResources.httpRoute;

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Kuadrant Policies')}</title>
      </Helmet>
      <Page>
        <PageSection hasBodyWrapper={false}>
          <Title headingLevel="h2">{t('Kuadrant Policies')}</Title>
          {!loaded ? (
            <div>Loading...</div>
          ) : loadError ? (
            <div>Error loading HTTPRoute: {loadError.message}</div>
          ) : (
            <AssociatedResourceList resource={httpRoute} />
          )}
        </PageSection>
      </Page>
    </>
  );
};

export default HTTPRoutePoliciesPage;
