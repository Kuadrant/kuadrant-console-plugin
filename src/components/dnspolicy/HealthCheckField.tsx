import * as React from 'react';

import { FormGroup, TextInput, FormSelect, FormSelectOption } from '@patternfly/react-core';
import { HealthCheck } from './types';
import { useTranslation } from 'react-i18next';

interface HealthCheckProps {
  healthCheck: HealthCheck;
  onChange: (updated: HealthCheck) => void;
}

const HealthCheckField: React.FC<HealthCheckProps> = ({ healthCheck, onChange }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  return (
    <>
      <FormGroup label={t('Endpoint')} isRequired fieldId="health-check-endpoint">
        <TextInput
          id="health-check-endpoint"
          value={healthCheck.endpoint}
          onChange={(event) => onChange({ ...healthCheck, endpoint: event.currentTarget.value })}
          isRequired
          placeholder="/"
        />
      </FormGroup>
      <FormGroup label={t('Failure Threshold')} isRequired fieldId="health-check-failure-threshold">
        <TextInput
          id="health-check-failure-threshold"
          type="number"
          value={healthCheck.failureThreshold}
          onChange={(event) =>
            onChange({ ...healthCheck, failureThreshold: Number(event.currentTarget.value) })
          }
          isRequired
          min={1}
          placeholder="0"
        />
      </FormGroup>
      <FormGroup label={t('Port')} isRequired fieldId="health-check-port">
        <TextInput
          id="health-check-port"
          type="number"
          value={healthCheck.port}
          onChange={(event) =>
            onChange({ ...healthCheck, port: Number(event.currentTarget.value) })
          }
          isRequired
          min={1}
          placeholder="0"
        />
      </FormGroup>
      <FormGroup label={t('Protocol')} isRequired fieldId="health-check-protocol">
        <FormSelect
          id="health-check-protocol"
          value={healthCheck.protocol}
          onChange={(event) =>
            onChange({ ...healthCheck, protocol: event.currentTarget.value as 'HTTP' | 'HTTPS' })
          }
          isRequired
          aria-label={t('Select a Protocol')}
        >
          <FormSelectOption key="placeholder" value="" label={t('Select a Protocol')} isDisabled />
          <FormSelectOption key="HTTP" value="HTTP" label="HTTP" />
          <FormSelectOption key="HTTPS" value="HTTPS" label="HTTPS" />
        </FormSelect>
      </FormGroup>
    </>
  );
};

export default HealthCheckField;
