import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { FighterAvailability } from './fighterEligibility';
import { FIGHTER_PORTRAIT_URLS } from './fighterPortraits';
import { FighterPortraitIndex } from './fighterRoster';

interface FighterSelectProps {
  availability: readonly FighterAvailability[] | null;
  onSelect: (portraitIndex: FighterPortraitIndex) => void;
}

const FIGHTER_NAMES = ['Jason', 'Grettel', 'Anton', 'Emma', 'Rachel'] as const;

const FighterSelect: React.FC<FighterSelectProps> = ({ availability, onSelect }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  if (!availability) {
    return (
      <div className="kuadrant-bonus-stage__roster-loading" role="status">
        {t('Auditing fighter eligibility...')}
      </div>
    );
  }

  return (
    <div className="kuadrant-bonus-stage__roster" aria-label={t('Choose your fighter')}>
      {availability.map(({ portraitIndex, isAvailable, lockReason }) => {
        const name = t(FIGHTER_NAMES[portraitIndex]);
        const lockMessage = lockReason === 'after-lunch' ? t('Lunch service has commenced') : '';

        return (
          <button
            type="button"
            className="kuadrant-bonus-stage__fighter-card"
            data-available={isAvailable}
            aria-disabled={!isAvailable}
            aria-label={
              isAvailable ? t('Choose {{fighter}}', { fighter: name }) : `${name}: ${lockMessage}`
            }
            key={portraitIndex}
            onClick={() => {
              if (isAvailable) {
                onSelect(portraitIndex);
              }
            }}
          >
            <img src={FIGHTER_PORTRAIT_URLS[portraitIndex]} alt="" />
            <strong>{name}</strong>
            <span>{isAvailable ? t('Ready') : lockMessage}</span>
          </button>
        );
      })}
    </div>
  );
};

export default FighterSelect;
