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
import { Gateway } from './types';
import { useTranslation } from 'react-i18next';

interface GatewaySelectProps {
  selectedGateway: Gateway;
  onChange: (updated: Gateway) => void;
}

const GatewaySelect: React.FC<GatewaySelectProps> = ({ selectedGateway, onChange }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [gateways, setGateways] = React.useState([]);
  const gvk = { group: 'gateway.networking.k8s.io', version: 'v1', kind: 'Gateway' };

  const gatewayResource = {
    groupVersionKind: gvk,
    isList: true,
  };

  const [gatewayData, gatewayLoaded, gatewayError] = useK8sWatchResource(gatewayResource);

  React.useEffect(() => {
    if (gatewayLoaded && !gatewayError && Array.isArray(gatewayData)) {
      setGateways(
        gatewayData.map((gateway) => ({
          name: gateway.metadata.name,
          namespace: gateway.metadata.namespace,
        })),
      );
    }
  }, [gatewayData, gatewayLoaded, gatewayError]);

  const handleGatewayChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const [namespace, name] = event.currentTarget.value.split('/');
    onChange({ ...selectedGateway, name, namespace });
  };

  return (
    <>
      <FormGroup label={t('Gateway API Target Reference')} isRequired fieldId="gateway-select">
        <FormSelect
          id="gateway-select"
          value={`${selectedGateway.namespace}/${selectedGateway.name}`}
          onChange={handleGatewayChange}
          aria-label={t('Select Gateway')}
        >
          <FormSelectOption
            key="placeholder"
            value=""
            label={t('Select a gateway')}
            isPlaceholder
          />
          {gateways.map((gateway, index) => (
            <FormSelectOption
              key={index}
              value={`${gateway.namespace}/${gateway.name}`}
              label={`${gateway.namespace}/${gateway.name}`}
            />
          ))}
        </FormSelect>
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {t(
                'Gateway: Reference to a Kubernetes resource that the policy attaches to. To create an additional gateway go to',
              )}{' '}
              <ResourceLink
                groupVersionKind={gvk}
                title="Create a Gateway"
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

export default GatewaySelect;
