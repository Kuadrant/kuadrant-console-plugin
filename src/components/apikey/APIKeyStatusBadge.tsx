import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircleIcon,
  HourglassStartIcon,
  ExclamationCircleIcon,
} from '@patternfly/react-icons';

interface APIKeyStatusBadgeProps {
  phase?: string;
}

export const APIKeyStatusBadge: React.FC<APIKeyStatusBadgeProps> = ({ phase }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  if (phase === 'Approved') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <CheckCircleIcon style={{ color: '#3e8635' }} />
        {t('Active')}
      </span>
    );
  } else if (phase === 'Pending') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <HourglassStartIcon style={{ color: '#8476d1' }} />
        {t('Pending')}
      </span>
    );
  } else if (phase === 'Rejected') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ExclamationCircleIcon style={{ color: '#c9190b' }} />
        {t('Rejected')}
      </span>
    );
  }
  return <>{phase || t('Unknown')}</>;
};
