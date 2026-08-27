import * as React from 'react';

import {
  FormGroup,
  TextInput,
  FormSelect,
  FormSelectOption,
  FormHelperText,
  HelperText,
  HelperTextItem,
  ValidatedOptions,
} from '@patternfly/react-core';
import { HealthCheck } from './types';
import { useTranslation } from 'react-i18next';
import { validatePort } from '../../utils/validation';

interface HealthCheckProps {
  healthCheck: HealthCheck;
  onChange: (updated: HealthCheck) => void;
}

const HealthCheckField: React.FC<HealthCheckProps> = ({ healthCheck, onChange }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  // Validation state
  const [portError, setPortError] = React.useState<string | null>(null);
  const [portTouched, setPortTouched] = React.useState(false);

  const validateHealthCheckPort = React.useCallback(
    (value: number) => {
      const formatError = validatePort(value);
      if (formatError) return t(formatError);
      return null;
    },
    [t],
  );

  return (
    <>
      <FormGroup label={t('Path')} isRequired fieldId="health-check-path" className="pf-u-mb-md">
        <TextInput
          id="health-check-path"
          value={healthCheck.path}
          onChange={(event) => onChange({ ...healthCheck, path: event.currentTarget.value })}
          isRequired
          placeholder="/"
        />
      </FormGroup>
      <FormGroup
        label={t('Failure Threshold')}
        isRequired
        fieldId="health-check-failure-threshold"
        className="pf-u-mb-md"
      >
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
      <FormGroup label={t('Port')} isRequired fieldId="health-check-port" className="pf-u-mb-md">
        <TextInput
          id="health-check-port"
          type="number"
          value={healthCheck.port}
          onChange={(event) =>
            onChange({ ...healthCheck, port: Number(event.currentTarget.value) })
          }
          onBlur={() => {
            setPortTouched(true);
            setPortError(validateHealthCheckPort(healthCheck.port));
          }}
          validated={portTouched && portError ? ValidatedOptions.error : ValidatedOptions.default}
          isRequired
          min={1}
          placeholder="0"
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant={portTouched && portError ? 'error' : 'default'}>
              {portTouched && portError ? portError : t('Port number for health checks (1-65535)')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
      <FormGroup
        label={t('Protocol')}
        isRequired
        fieldId="health-check-protocol"
        className="pf-u-mb-md"
      >
        <FormSelect
          id="health-check-protocol"
          value={healthCheck.protocol}
          onChange={(event) =>
            onChange({ ...healthCheck, protocol: event.currentTarget.value as 'HTTP' | 'HTTPS' })
          }
          isRequired
          aria-label={t('Select a Protocol')}
        >
          <FormSelectOption key="placeholder" value="" label={t('Select a Protocol')} />
          <FormSelectOption key="HTTP" value="HTTP" label="HTTP" />
          <FormSelectOption key="HTTPS" value="HTTPS" label="HTTPS" />
        </FormSelect>
      </FormGroup>
    </>
  );
};

export default HealthCheckField;
