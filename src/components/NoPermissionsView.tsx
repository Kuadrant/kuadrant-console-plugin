import * as React from 'react';
import {
  Title,
  Bullseye,
  EmptyState,
  EmptyStateIcon,
  EmptyStateBody,
  Text,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { LockIcon } from '@patternfly/react-icons';

const NoPermissionsView: React.FC<{
  heading?: React.ReactNode;
  primaryMessage: React.ReactNode;
  secondaryMessage?: React.ReactNode;
}> = ({ heading, primaryMessage, secondaryMessage }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const effectiveHeading = heading || t('Access Denied');
  return (
    <Bullseye>
      <EmptyState>
        <EmptyStateIcon icon={LockIcon} />
        <Title headingLevel="h4" size="lg">
          {effectiveHeading}
        </Title>
        <EmptyStateBody>
          <Text component="p">{primaryMessage}</Text>
          {secondaryMessage && <Text component="p">{secondaryMessage}</Text>}
        </EmptyStateBody>
      </EmptyState>
    </Bullseye>
  );
};

export default NoPermissionsView;
