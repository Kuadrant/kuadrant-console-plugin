import * as React from 'react';
import Helmet from 'react-helmet';
import {
  PageSection,
  Title,
  EmptyState,
  EmptyStateBody,
  EmptyStateActions,
  EmptyStateFooter,
  Button,
  Content,
} from '@patternfly/react-core';
import { RocketIcon } from '@patternfly/react-icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

const MCPOverviewPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title data-test="mcp-overview-page-title">{t('MCP Management')}</title>
      </Helmet>
      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h1">{t('MCP Management')}</Title>
      </PageSection>
      <PageSection hasBodyWrapper={false}>
        <EmptyState headingLevel="h2" titleText={t('Get started')} icon={RocketIcon}>
          <EmptyStateBody>
            <Content component="p">
              {t(
                'Set up your MCP infrastructure by creating a gateway, route, and MCP extension. Use the setup wizard to get started quickly.',
              )}
            </Content>
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button
                variant="primary"
                onClick={() => navigate('/kuadrant/mcp/setup-wizard')}
                data-test="mcp-setup-wizard-button"
              >
                {t('MCP gateway setup wizard')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      </PageSection>
    </>
  );
};

export default MCPOverviewPage;
