import * as React from 'react';

import {
  FormGroup,
  TextInput,
  Radio,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import { LoadBalancing } from './types';
import { useTranslation } from 'react-i18next';

interface LoadBalancingProps {
  loadBalancing: LoadBalancing;
  onChange: (updated: LoadBalancing) => void;
  formDisabled: boolean;
}

const LoadBalancingField: React.FC<LoadBalancingProps> = ({
  loadBalancing,
  onChange,
  formDisabled,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  return (
    <>
      <FormGroup
        label={t('Load balancing Weight')}
        isRequired
        fieldId="weight"
        className="pf-u-mb-md"
      >
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
          isDisabled={formDisabled}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {t('Weight value to apply to weighted endpoints default: 120')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
      <FormGroup label={t('Load balancing Geo')} isRequired fieldId="geo" className="pf-u-mb-md">
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
          placeholder={t("Geography Label (e.g. 'EU')")}
          isDisabled={formDisabled}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{t('Geo value to apply to geo endpoints')}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
      <FormGroup
        role="radiogroup"
        hasNoPaddingTop
        fieldId="default-geo"
        label={t('Default Geo')}
        isRequired
        className="pf-u-mb-md"
        aria-labelledby="issuer-label"
      >
        <div className="pf-u-display-flex pf-u-align-items-center">
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
            className="pf-u-mr-md"
            isDisabled={formDisabled}
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
            isDisabled={formDisabled}
          />
        </div>
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{t('Geo value to apply to geo endpoints')}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </>
  );
};

export default LoadBalancingField;
