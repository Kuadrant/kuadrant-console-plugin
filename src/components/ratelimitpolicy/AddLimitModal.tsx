import {
  FormGroup,
  FormSelect,
  FormSelectOption,
  Modal,
  TextInput,
  Wizard,
  WizardStep,
} from '@patternfly/react-core';
import * as React from 'react';
import { LimitConfig } from './types';
import { useTranslation } from 'react-i18next';

const LimitConfigForm: React.FC<{
  newLimit: LimitConfig;
  setNewLimit: (limit: LimitConfig) => void;
  rateName: string;
  setRateName: (name: string) => void;
}> = ({ newLimit, setNewLimit, rateName, setRateName }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  return (
    <>
      <FormGroup label={t('Limit Name')} fieldId="limit-name">
        <TextInput
          value={rateName}
          onChange={(event) => setRateName(event.currentTarget.value)}
          isRequired
        />
      </FormGroup>
      <FormGroup label={t('Limit')} fieldId="limit">
        <TextInput
          type="number"
          value={newLimit.rates?.[0]?.limit || ''}
          onChange={(event) =>
            setNewLimit({
              ...newLimit,
              rates: [{ ...newLimit.rates?.[0], limit: parseInt(event.currentTarget.value, 10) }],
            })
          }
          isRequired
        />
      </FormGroup>
      <FormGroup label={t('Duration')} fieldId="duration">
        <TextInput
          type="number"
          value={newLimit.rates?.[0]?.duration || ''}
          onChange={(event) =>
            setNewLimit({
              ...newLimit,
              rates: [
                { ...newLimit.rates?.[0], duration: parseInt(event.currentTarget.value, 10) },
              ],
            })
          }
          isRequired
        />
      </FormGroup>
      <FormGroup label={t('Unit')} fieldId="unit">
        <FormSelect
          value={newLimit.rates?.[0]?.unit || 'second'}
          onChange={(event) =>
            setNewLimit({
              ...newLimit,
              rates: [
                {
                  ...newLimit.rates?.[0],
                  unit: event.currentTarget.value as 'second' | 'minute' | 'hour' | 'day',
                },
              ],
            })
          }
        >
          <FormSelectOption value="second" label="Second" />
          <FormSelectOption value="minute" label="Minute" />
          <FormSelectOption value="hour" label="Hour" />
          <FormSelectOption value="day" label="Day" />
        </FormSelect>
      </FormGroup>
    </>
  );
};

const AddLimitModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  newLimit: LimitConfig;
  setNewLimit: (limit: LimitConfig) => void;
  rateName: string;
  setRateName: (name: string) => void;
  handleSave: () => void;
}> = ({ isOpen, onClose, newLimit, setNewLimit, rateName, setRateName, handleSave }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('Add Limit')} width="50%">
      <div className="kuadrant-modal-dynamic-height">
        <Wizard height={400} onSave={handleSave} onClose={onClose}>
          <WizardStep
            name={t('Define Rate Limit')}
            id="define-rate-limit"
            footer={{ nextButtonText: t('Add Limit'), isBackHidden: true }}
          >
            <LimitConfigForm
              newLimit={newLimit}
              setNewLimit={setNewLimit}
              rateName={rateName}
              setRateName={setRateName}
            />
          </WizardStep>
        </Wizard>
      </div>
    </Modal>
  );
};

export default AddLimitModal;
