import { FormGroup, Title, Button, Label, LabelGroup } from '@patternfly/react-core';
import * as React from 'react';
import AddLimitModal from './AddLimitModal';
import { LimitConfig } from './types';
import { useTranslation } from 'react-i18next';

interface LimitSelectProps {
  limits: Record<string, LimitConfig>;
  setLimits: React.Dispatch<React.SetStateAction<Record<string, LimitConfig>>>;
}

const emptyLimit = (): LimitConfig => ({
  rates: [],
  counters: [],
  when: [],
});

const LimitSelect: React.FC<LimitSelectProps> = ({ limits, setLimits }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [isAddLimitModalOpen, setIsAddLimitModalOpen] = React.useState(false);
  const [newLimit, setNewLimit] = React.useState<LimitConfig>(emptyLimit());
  const [rateName, setRateName] = React.useState<string>('');

  const formatLimitLabel = React.useCallback(
    (limitConfig: LimitConfig): string => {
      const rateText = (limitConfig.rates || []).map((r) => `${r.limit}/${r.window}`).join(', ');
      const counterText =
        limitConfig.counters && limitConfig.counters.length > 0
          ? ` · ${t('counters: {{expressions}}', {
              expressions: limitConfig.counters.map((c) => c.expression).join(', '),
            })}`
          : '';
      const whenText =
        limitConfig.when && limitConfig.when.length > 0
          ? ` · ${t('when: {{predicates}}', {
              predicates: limitConfig.when.map((w) => w.predicate).join(', '),
            })}`
          : '';
      return `${rateText}${counterText}${whenText}`;
    },
    [t],
  );

  const handleOpenModal = () => {
    setNewLimit(emptyLimit());
    setRateName('');
    setIsAddLimitModalOpen(true);
  };

  const handleCloseModal = () => setIsAddLimitModalOpen(false);

  const onAddLimit = () => {
    if (!rateName || !newLimit.rates || newLimit.rates.length === 0) {
      return;
    }
    if (limits[rateName]) {
      return;
    }

    const cleaned: LimitConfig = {
      rates: newLimit.rates,
      ...(newLimit.counters && newLimit.counters.length > 0 ? { counters: newLimit.counters } : {}),
      ...(newLimit.when && newLimit.when.length > 0 ? { when: newLimit.when } : {}),
    };

    setLimits((prevLimits) => ({
      ...prevLimits,
      [rateName]: cleaned,
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
        <LabelGroup numLabels={5} className="kuadrant-rate-limit-label-group">
          {Object.keys(limits).length > 0 ? (
            Object.entries(limits).map(([name, limitConfig], index) => (
              <Label key={index} color="blue" onClose={() => handleRemoveLimit(name)}>
                <strong>{name}</strong>: {formatLimitLabel(limitConfig)}
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
      <AddLimitModal
        isOpen={isAddLimitModalOpen}
        onClose={handleCloseModal}
        newLimit={newLimit}
        setNewLimit={setNewLimit}
        rateName={rateName}
        setRateName={setRateName}
        handleSave={onAddLimit}
        existingLimitNames={Object.keys(limits)}
      />
    </>
  );
};

export default LimitSelect;
