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
  // policy's target namespace - a Gateway from a different namespace can never
  // be saved (targetRef has no namespace field), so the list must be scoped
  // to this namespace rather than watching the whole cluster
  namespace: string;
  isDisabled?: boolean;
}

const GatewaySelect: React.FC<GatewaySelectProps> = ({
  selectedGateway,
  onChange,
  namespace,
  isDisabled = false,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const gvk = RESOURCES.Gateway.gvk;
  const isAllNamespaces = !namespace || namespace === '#ALL_NS#';

  const gatewayResource = isAllNamespaces
    ? null
    : {
        groupVersionKind: gvk,
        isList: true,
        namespace,
      };

  const [gatewayData, gatewayLoaded, gatewayError] =
    useK8sWatchResource<GatewayResource[]>(gatewayResource);

  // A Gateway selected in one namespace is never valid in another - the
  // watch above re-scopes automatically, but the controlled selection must
  // be cleared too or the old name gets silently resubmitted against the
  // new namespace's Gateway list.
  const prevNamespaceRef = React.useRef(namespace);
  React.useEffect(() => {
    if (prevNamespaceRef.current !== namespace) {
      prevNamespaceRef.current = namespace;
      if (!isDisabled && selectedGateway.metadata?.name) {
        onChange({ metadata: { name: '', namespace: '' } } as GatewayResource);
      }
    }
  }, [namespace]);

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
          isDisabled={isDisabled || isAllNamespaces}
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
            <HelperTextItem variant={isAllNamespaces ? 'warning' : 'default'}>
              {isAllNamespaces
                ? t('Select a specific namespace to choose a Gateway')
                : t(
                    'Gateway: Reference to a Kubernetes resource that the policy attaches to. To create an additional gateway go to',
                  )}{' '}
              {!isAllNamespaces && (
                <ResourceLink
                  groupVersionKind={gvk}
                  title={t('Create a Gateway')}
                  hideIcon={true}
                  inline={true}
                  displayName={t('here')}
                />
              )}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </>
  );
};

export default GatewaySelect;
