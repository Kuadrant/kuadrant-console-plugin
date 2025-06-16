import * as React from 'react';
import { Title, Bullseye, EmptyState, EmptyStateBody, Content } from '@patternfly/react-core';
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
      <EmptyState
        titleText={
          <Title headingLevel="h4" size="lg">
            {effectiveHeading}
          </Title>
        }
        icon={LockIcon}
      >
        <EmptyStateBody>
          <Content component="p">{primaryMessage}</Content>
          {secondaryMessage && <Content component="p">{secondaryMessage}</Content>}
        </EmptyStateBody>
      </EmptyState>
    </Bullseye>
  );
};

export default NoPermissionsView;
