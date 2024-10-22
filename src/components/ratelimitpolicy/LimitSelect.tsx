import { FormGroup, Title, Button, Modal, Label, LabelGroup } from '@patternfly/react-core';
import * as React from 'react';
import AddLimitModal from './AddLimitModal';
import { LimitConfig } from './types';
import { useTranslation } from 'react-i18next';

interface LimitSelectProps {
  limits: Record<string, LimitConfig>;
  setLimits: React.Dispatch<React.SetStateAction<Record<string, LimitConfig>>>;
}

const LimitSelect: React.FC<LimitSelectProps> = ({ limits, setLimits }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [isAddLimitModalOpen, setIsAddLimitModalOpen] = React.useState(false);
  const [isLimitNameAlertModalOpen, setIsLimitNameAlertModalOpen] = React.useState(false);
  const [newLimit, setNewLimit] = React.useState<LimitConfig>({
    rates: [{ duration: 60, limit: 100, unit: 'minute' }],
  });
  const [rateName, setRateName] = React.useState<string>('');

  const handleOpenModal = () => {
    setNewLimit({ rates: [{ duration: 60, limit: 100, unit: 'minute' }] });
    setRateName('');
    setIsAddLimitModalOpen(true);
  };

  const handleCloseModal = () => setIsAddLimitModalOpen(false);

  const onAddLimit = () => {
    if (!rateName) {
      setIsLimitNameAlertModalOpen(true);
      return;
    }

    setLimits((prevLimits) => ({
      ...prevLimits,
      [rateName]: newLimit,
    }));

    handleCloseModal();
  };

  const handleRemoveLimit = (name: string) => {
    setLimits((prevLimits) => {
      const updatedLimits = { ...prevLimits };
      delete updatedLimits[name];
      return updatedLimits;
    });
  };

  return (
    <>
      <FormGroup>
        <Title headingLevel="h2" size="lg" className="kuadrant-limits-header">
          {t('Configured Limits')}
        </Title>
        <LabelGroup numLabels={5}>
          {Object.keys(limits).length > 0 ? (
            Object.entries(limits).map(([name, limitConfig], index) => (
              <Label key={index} color="blue" onClose={() => handleRemoveLimit(name)}>
                <strong>{name}</strong>: {limitConfig.rates?.[0]?.limit} requests per{' '}
                {limitConfig.rates?.[0]?.duration} {limitConfig.rates?.[0]?.unit}(s)
              </Label>
            ))
          ) : (
            <p>{t('No limits configured yet')}</p>
          )}
        </LabelGroup>
        <Button variant="primary" onClick={handleOpenModal} className="kuadrant-limits-button">
          {t('Add Limit')}
        </Button>
      </FormGroup>
      {/* Modal to add a new limit */}
      <AddLimitModal
        isOpen={isAddLimitModalOpen}
        onClose={handleCloseModal}
        newLimit={newLimit}
        setNewLimit={setNewLimit}
        rateName={rateName}
        setRateName={setRateName}
        handleSave={onAddLimit}
      />
      <Modal
        title="Validation Error"
        isOpen={isLimitNameAlertModalOpen}
        onClose={() => setIsLimitNameAlertModalOpen(false)}
        variant="small"
        aria-label="Rate Name is required error"
      >
        <p>{t('Limit Name is required!')}</p>
        <Button variant="primary" onClick={() => setIsLimitNameAlertModalOpen(false)}>
          {t('OK')}
        </Button>
      </Modal>
    </>
  );
};

export default LimitSelect;
