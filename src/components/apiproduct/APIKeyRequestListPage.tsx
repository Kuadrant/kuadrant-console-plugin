import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { PageSection, Title, EmptyState, EmptyStateBody, Spinner } from '@patternfly/react-core';
import { ListIcon } from '@patternfly/react-icons';
import { useAPIManagementRBAC } from '../../utils/apiManagementRBAC';
import NoPermissionsView from '../NoPermissionsView';

/**
 * Placeholder page for APIKeyRequest list (owner workflow).
 *
 * This page will display pending API key requests for products the owner manages.
 * Demonstrates RBAC pattern: only owners and admins can access this view.
 */
const APIKeyRequestListPage: React.FC = () => {
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

  // RBAC gate: only owners and admins can view API key requests
  const canViewRequests = permissions.apikeyrequests.canList;
  if (!canViewRequests) {
    return (
      <NoPermissionsView
        primaryMessage={t('You do not have permission to view API Key Requests')}
      />
    );
  }

  return (
    <PageSection variant="secondary">
      <Title headingLevel="h1">{t('API Key Requests')}</Title>
      <EmptyState icon={ListIcon} titleText={t('Coming Soon')}>
        <EmptyStateBody>
          {t('API Key request management for owners will be implemented here.')}
          <br />
          {t('Current persona: {{persona}}', { persona: persona || 'unknown' })}
        </EmptyStateBody>
      </EmptyState>
    </PageSection>
  );
};

export default APIKeyRequestListPage;
