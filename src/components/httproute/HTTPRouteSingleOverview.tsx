import * as React from 'react';
import Helmet from 'react-helmet';
import { useTranslation } from 'react-i18next';
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

const HTTPRouteSingleOverview: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();
  const location = useLocation();

  const httpRouteName = extractResourceNameFromURL(location.pathname);
  const resources = {
    httpRoute: {
      groupVersionKind: RESOURCES.HTTPRoute.gvk,
      namespace: activeNamespace,
      name: httpRouteName ?? undefined,
      isList: false,
    },
  };

  const watchedResources = useK8sWatchResources<{ httpRoute: K8sResourceCommon }>(resources);
  const { loaded, loadError, data: httpRoute } = watchedResources.httpRoute;

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Attached')}</title>
      </Helmet>
      {!loaded ? (
        <div>{t('Loading...')}</div>
      ) : loadError ? (
        <div>{t('Error loading HTTPRoute: {{message}}', { message: loadError.message })}</div>
      ) : (
        <AttachedResources resource={httpRoute} />
      )}
    </>
  );
};

export default HTTPRouteSingleOverview;
