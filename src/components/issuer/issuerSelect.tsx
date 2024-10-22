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
import { Issuer } from './types'; // You will need to define this type similarly to Gateway.
import { useTranslation } from 'react-i18next';

interface IssuerSelectProps {
  selectedIssuer: Issuer;
  onChange: (updated: Issuer) => void;
}

const IssuerSelect: React.FC<IssuerSelectProps> = ({ selectedIssuer, onChange }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [issuers, setIssuers] = React.useState([]);
  const gvk = { group: 'cert-manager.io', version: 'v1', kind: 'Issuer' };

  const clusterIssuerResource = {
    groupVersionKind: gvk,
    isList: true,
  };

  const [clusterIssuerData, clusterIssuerLoaded, clusterIssuerError] =
    useK8sWatchResource(clusterIssuerResource);

  React.useEffect(() => {
    if (clusterIssuerLoaded && !clusterIssuerError && Array.isArray(clusterIssuerData)) {
      setIssuers(
        clusterIssuerData.map((clusterIssuer) => ({
          name: clusterIssuer.metadata.name,
          namespace: clusterIssuer.metadata.namespace,
        })),
      );
    }
  }, [clusterIssuerData, clusterIssuerLoaded, clusterIssuerError]);

  const handleIssuerChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const [namespace, name] = event.currentTarget.value.split('/');
    onChange({ ...selectedIssuer, name, namespace });
  };

  return (
    <>
      <FormGroup label={t('Issuer API Target Reference')} isRequired fieldId="clusterissuer-select">
        <FormSelect
          id="clusterissuer-select"
          value={`${selectedIssuer.namespace}/${selectedIssuer.name}`}
          onChange={handleIssuerChange}
          aria-label={t('Select Issuer')}
        >
          <FormSelectOption
            key="placeholder"
            value=""
            label={t('Select an Issuer')}
            isPlaceholder
          />
          {issuers.map((clusterIssuer, index) => (
            <FormSelectOption
              key={index}
              value={`${clusterIssuer.namespace}/${clusterIssuer.name}`}
              label={`${clusterIssuer.namespace}/${clusterIssuer.name}`}
            />
          ))}
        </FormSelect>
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {t(
                'Issuer: Reference to the issuer for the created certificate. To create an additional Issuer go to',
              )}{' '}
              <ResourceLink
                groupVersionKind={gvk}
                title="Create an Issuer"
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

export default IssuerSelect;
