import * as React from 'react';

import {  FormGroup, TextInput, FormHelperText, HelperText, HelperTextItem, Radio } from '@patternfly/react-core';
import { LoadBalancing } from './types';
import { useTranslation } from 'react-i18next';

interface LoadBalancingProps {
  loadBalancing: LoadBalancing;
  onChange: (updated: LoadBalancing) => void;
}

const LoadBalancingField: React.FC<LoadBalancingProps> = ({ loadBalancing, onChange }) => {
  const { t } = useTranslation('plugin__console-plugin-template');

  return (
    <>
      <FormHelperText>
        <HelperText>
          <HelperTextItem>{t('Load balancing options:.')}</HelperTextItem>
        </HelperText>
      </FormHelperText>


      <FormGroup label={t('Weight')} isRequired fieldId="weight">
        <TextInput
          id="weight"
          value={loadBalancing.weight}
          onChange={(event) =>
            onChange({
              ...loadBalancing,
              weight: Number(event.currentTarget.value),
            })
          }
          isRequired
        />
        <FormGroup label={t('Geo')} isRequired fieldId="geo">
          <TextInput
            id="weight"
            value={loadBalancing.geo}
            onChange={(event) =>
              onChange({
                ...loadBalancing,
                geo: String(event.currentTarget.value),
              })
            }
            isRequired
          />
        </FormGroup>
        <FormGroup role="radiogroup" isInline fieldId='default-geo' label={t('Default Geo')} isRequired aria-labelledby="issuer-label">
          <Radio
            label={t("Enabled")}
            isChecked={loadBalancing.defaultGeo === true}
            onChange={(event) =>
              onChange({
                ...loadBalancing,
                defaultGeo: true,
              })
            }
            id="default-geo-enabled"
            name="default-geo"
          />
          <Radio
            label={t("Disabled")}
            isChecked={loadBalancing.defaultGeo === false}
            onChange={(event) =>
              onChange({
                ...loadBalancing,
                defaultGeo: false,
              })
            }
            id="default-geo-disabled"
            name="default-geo"
          />
        </FormGroup>
      </FormGroup>

    </>
  );
};

export default LoadBalancingField;