import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  PageSection,
  Title,
  EmptyState,
  EmptyStateBody,
  Spinner,
} from '@patternfly/react-core';
import { CheckCircleIcon } from '@patternfly/react-icons';
import { useAPIManagementRBAC } from '../../utils/apiManagementRBAC';
import NoPermissionsView from '../NoPermissionsView';

/**
 * Placeholder page for APIKeyApproval workflow (owner workflow).
 *
 * This page will allow API owners to approve/reject consumer API key requests.
 * Demonstrates RBAC pattern: only owners and admins can access this view.
 */
const APIKeyApprovalPage: React.FC = () => {
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

  // RBAC gate: only owners and admins can approve API keys
  const canApprove = permissions.apikeyapprovals.canCreate;
  if (!canApprove) {
    return (
      <NoPermissionsView
        primaryMessage={t('You do not have permission to approve API Keys')}
      />
    );
  }

  return (
    <PageSection variant="secondary">
      <Title headingLevel="h1">{t('API Key Approvals')}</Title>
      <EmptyState icon={CheckCircleIcon} titleText={t('Coming Soon')}>
        <EmptyStateBody>
          {t('API Key approval workflow for owners will be implemented here.')}
          <br />
          {t('Current persona: {{persona}}', { persona: persona || 'unknown' })}
        </EmptyStateBody>
      </EmptyState>
    </PageSection>
  );
};

export default APIKeyApprovalPage;
