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
import { GatewayResource } from './types';
import { useTranslation } from 'react-i18next';
import { RESOURCES } from '../../utils/resources';

interface GatewaySelectProps {
  selectedGateway: GatewayResource;
  onChange: (updated: GatewayResource) => void;
}

const GatewaySelect: React.FC<GatewaySelectProps> = ({ selectedGateway, onChange }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const gvk = RESOURCES.Gateway.gvk;

  const gatewayResource = {
    groupVersionKind: gvk,
    isList: true,
  };

  const [gatewayData, gatewayLoaded, gatewayError] =
    useK8sWatchResource<GatewayResource[]>(gatewayResource);

  const gateways = React.useMemo(() => {
    if (gatewayLoaded && !gatewayError && Array.isArray(gatewayData)) {
      return gatewayData;
    }
    return [];
  }, [gatewayData, gatewayLoaded, gatewayError]);

  const handleGatewayChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const [namespace, name] = event.currentTarget.value.split('/');
    const found = gateways.find(
      (gw) => gw.metadata?.name === name && gw.metadata?.namespace === namespace,
    );
    if (found) {
      onChange(found);
    }
  };

  return (
    <>
      <FormGroup label={t('Gateway API Target Reference')} isRequired fieldId="gateway-select">
        <FormSelect
          id="gateway-select"
          value={`${selectedGateway.metadata?.namespace ?? ''}/${
            selectedGateway.metadata?.name ?? ''
          }`}
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
              value={`${gateway.metadata?.namespace}/${gateway.metadata?.name}`}
              label={`${gateway.metadata?.namespace}/${gateway.metadata?.name}`}
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
                title={t('Create a Gateway')}
                hideIcon={true}
                inline={true}
                displayName={t('here')}
              />
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </>
  );
};

export default GatewaySelect;
