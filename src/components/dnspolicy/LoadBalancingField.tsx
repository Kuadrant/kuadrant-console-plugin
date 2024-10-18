import * as React from 'react';

import {
  FormGroup,
  TextInput,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Radio,
} from '@patternfly/react-core';
import { LoadBalancing } from './types';
import { useTranslation } from 'react-i18next';

interface LoadBalancingProps {
  loadBalancing: LoadBalancing;
  onChange: (updated: LoadBalancing) => void;
}

const LoadBalancingField: React.FC<LoadBalancingProps> = ({ loadBalancing, onChange }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

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
          type="number"
          placeholder="0"
        />
        <FormGroup label={t('Geo')} isRequired fieldId="geo">
          <TextInput
            id="geo"
            value={loadBalancing.geo}
            onChange={(event) =>
              onChange({
                ...loadBalancing,
                geo: String(event.currentTarget.value),
              })
            }
            isRequired
            placeholder={t("Geography Label (e.g. 'eu')")}
          />
        </FormGroup>
        <FormGroup
          role="radiogroup"
          isInline
          fieldId="default-geo"
          label={t('Default Geo')}
          isRequired
          aria-labelledby="issuer-label"
        >
          <Radio
            label={t('Enabled')}
            isChecked={loadBalancing.defaultGeo === true}
            onChange={() =>
              onChange({
                ...loadBalancing,
                defaultGeo: true,
              })
            }
            id="default-geo-enabled"
            name="default-geo"
          />
          <Radio
            label={t('Disabled')}
            isChecked={loadBalancing.defaultGeo === false}
            onChange={() =>
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
