import { FormSelect, FormSelectOption } from '@patternfly/react-core';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { PublishStatus } from './types';

interface LifecycleStatusSelectorProps {
  status: PublishStatus;
  onChange: (status: PublishStatus) => void;
}

const LifecycleStatusSelector: React.FC<LifecycleStatusSelectorProps> = ({ status, onChange }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  const handleChange = (event: React.FormEvent<HTMLSelectElement>) => {
    onChange(event.currentTarget.value as PublishStatus);
  };

  const statusOptions: Array<{ value: PublishStatus; label: string; disabled: boolean }> = [
    { value: 'Draft', label: t('Draft'), disabled: false },
    { value: 'Published', label: t('Published'), disabled: false },
    { value: 'Deprecated', label: t('Deprecated'), disabled: true },
    { value: 'Retired', label: t('Retired'), disabled: true },
  ];

  return (
    <FormSelect
      id="lifecycle-status"
      value={status}
      onChange={handleChange}
      aria-label={t('Select lifecycle status')}
    >
      {statusOptions.map((option) => (
        <FormSelectOption
          key={option.value}
          value={option.value}
          label={option.label}
          isDisabled={option.disabled}
        />
      ))}
    </FormSelect>
  );
};

export default LifecycleStatusSelector;
