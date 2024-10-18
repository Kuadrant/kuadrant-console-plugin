import { ResourceLink, useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import {
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import * as React from 'react';
import { HTTPRoute } from './types'; // You will need to define this type similarly to Gateway.
import { useTranslation } from 'react-i18next';

interface HTTPRouteSelectProps {
  selectedHTTPRoute: HTTPRoute;
  onChange: (updated: HTTPRoute) => void;
}

const HTTPRouteSelect: React.FC<HTTPRouteSelectProps> = ({ selectedHTTPRoute, onChange }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [httpRoutes, setHTTPRoutes] = React.useState([]);
  const gvk = { group: 'gateway.networking.k8s.io', version: 'v1', kind: 'HTTPRoute' };

  const httpRouteResource = {
    groupVersionKind: gvk,
    isList: true,
  };

  const [httpRouteData, httpRouteLoaded, httpRouteError] = useK8sWatchResource(httpRouteResource);

  React.useEffect(() => {
    if (httpRouteLoaded && !httpRouteError && Array.isArray(httpRouteData)) {
      setHTTPRoutes(
        httpRouteData.map((httpRoute) => ({
          name: httpRoute.metadata.name,
          namespace: httpRoute.metadata.namespace,
        })),
      );
    }
  }, [httpRouteData, httpRouteLoaded, httpRouteError]);

  const handleHTTPRouteChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const [namespace, name] = event.currentTarget.value.split('/');
    onChange({ ...selectedHTTPRoute, name, namespace });
  };

  return (
    <>
      <FormGroup label={t('HTTPRoute API Target Reference')} isRequired fieldId="httproute-select">
        <FormSelect
          id="httproute-select"
          value={`${selectedHTTPRoute.namespace}/${selectedHTTPRoute.name}`}
          onChange={handleHTTPRouteChange}
          aria-label={t('Select HTTPRoute')}
        >
          <FormSelectOption
            key="placeholder"
            value=""
            label={t('Select an HTTPRoute')}
            isPlaceholder
          />
          {httpRoutes.map((httpRoute, index) => (
            <FormSelectOption
              key={index}
              value={`${httpRoute.namespace}/${httpRoute.name}`}
              label={`${httpRoute.namespace}/${httpRoute.name}`}
            />
          ))}
        </FormSelect>
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {t('You can view and create HTTPRoutes')}{' '}
              <ResourceLink
                groupVersionKind={gvk}
                title="Create an HTTPRoute"
                hideIcon={true}
                inline={true}
                displayName="here"
              />
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </>
  );
};

export default HTTPRouteSelect;
