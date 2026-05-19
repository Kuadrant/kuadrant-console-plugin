import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircleIcon,
  HourglassStartIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
} from '@patternfly/react-icons';
import { APIKeyPhase } from '../../utils/resources';

interface APIKeyStatusBadgeProps {
  phase: APIKeyPhase;
}

export const APIKeyStatusBadge: React.FC<APIKeyStatusBadgeProps> = ({ phase }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  switch (phase) {
    case 'Approved':
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircleIcon style={{ color: '#3e8635' }} />
          {t('Active')}
        </span>
      );
    case 'Pending':
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HourglassStartIcon style={{ color: '#8476d1' }} />
          {t('Pending')}
        </span>
      );
    case 'Denied':
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ExclamationCircleIcon style={{ color: '#c9190b' }} />
          {t('Denied')}
        </span>
      );
    case 'Failed':
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ExclamationTriangleIcon style={{ color: '#f0ab00' }} />
          {t('Failed')}
        </span>
      );
    default:
      return <>{t('Unknown')}</>;
  }
};
