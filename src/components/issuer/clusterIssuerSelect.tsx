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
import { ClusterIssuer } from './types'; // You will need to define this type similarly to Gateway.
import { useTranslation } from 'react-i18next';

interface ClusterIssuerSelectProps {
  selectedClusterIssuer: ClusterIssuer;
  onChange: (updated: ClusterIssuer) => void;
}

const ClusterIssuerSelect: React.FC<ClusterIssuerSelectProps> = ({
  selectedClusterIssuer,
  onChange,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [clusterIssuers, setClusterIssuers] = React.useState([]);
  const gvk = { group: 'cert-manager.io', version: 'v1', kind: 'ClusterIssuer' };

  const clusterIssuerResource = {
    groupVersionKind: gvk,
    isList: true,
  };

  const [clusterIssuerData, clusterIssuerLoaded, clusterIssuerError] =
    useK8sWatchResource(clusterIssuerResource);

  React.useEffect(() => {
    if (clusterIssuerLoaded && !clusterIssuerError && Array.isArray(clusterIssuerData)) {
      setClusterIssuers(
        clusterIssuerData.map((clusterIssuer) => ({
          name: clusterIssuer.metadata.name,
        })),
      );
    }
  }, [clusterIssuerData, clusterIssuerLoaded, clusterIssuerError]);

  const handleClusterIssuerChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const [name] = event.currentTarget.value.split('/');
    onChange({ ...selectedClusterIssuer, name });
  };

  return (
    <>
      <FormGroup
        label={t('ClusterIssuer API Target Reference')}
        isRequired
        fieldId="clusterissuer-select"
      >
        <FormSelect
          id="clusterissuer-select"
          value={`${selectedClusterIssuer.name}`}
          onChange={handleClusterIssuerChange}
          aria-label={t('Select ClusterIssuer')}
        >
          <FormSelectOption
            key="placeholder"
            value=""
            label={t('Select an ClusterIssuer')}
            isPlaceholder
          />
          {clusterIssuers.map((clusterIssuer, index) => (
            <FormSelectOption
              key={index}
              value={`${clusterIssuer.name}`}
              label={`${clusterIssuer.name}`}
            />
          ))}
        </FormSelect>
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {t(
                'Cluster Issuer: Reference to the cluster issuer for the created certificate. To create an additional ClusterIssuer go to',
              )}{' '}
              <ResourceLink
                groupVersionKind={gvk}
                title="Create an ClusterIssuer"
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

export default ClusterIssuerSelect;
