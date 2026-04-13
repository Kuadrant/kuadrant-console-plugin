import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  PageSection,
  Title,
  EmptyState,
  EmptyStateBody,
  Spinner,
} from '@patternfly/react-core';
import { CubesIcon } from '@patternfly/react-icons';
import { useAPIManagementRBAC } from '../../utils/apiManagementRBAC';
import NoPermissionsView from '../NoPermissionsView';

/**
 * Placeholder page for APIKey list (consumer workflow).
 *
 * This page will display the consumer's API keys for accessing published APIs.
 * Demonstrates RBAC pattern: only consumers and admins can access this view.
 */
const APIKeyListPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const { persona, permissions, loading } = useAPIManagementRBAC();

  // Show loading state while checking permissions
  if (loading) {
    return (
      <PageSection variant="secondary">
        <Spinner size="lg" />
      </PageSection>
    );
  }

  // RBAC gate: only consumers and admins can view their API keys
  const canViewAPIKeys = permissions.apikeys.canList;
  if (!canViewAPIKeys) {
    return (
      <NoPermissionsView primaryMessage={t('You do not have permission to view API Keys')} />
    );
  }

  return (
    <PageSection variant="secondary">
      <Title headingLevel="h1">{t('API Keys')}</Title>
      <EmptyState icon={CubesIcon} titleText={t('Coming Soon')}>
        <EmptyStateBody>
          {t('API Key management for consumers will be implemented here.')}
          <br />
          {t('Current persona: {{persona}}', { persona: persona || 'unknown' })}
        </EmptyStateBody>
      </EmptyState>
    </PageSection>
  );
};

export default APIKeyListPage;
