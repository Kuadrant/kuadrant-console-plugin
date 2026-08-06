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
import { useNavigate } from 'react-router-dom-v5-compat';

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
        <EmptyState
          titleText={
            <Title headingLevel="h2" size="lg">
              {t('Get started')}
            </Title>
          }
          icon={RocketIcon}
        >
          <EmptyStateBody>
            <Content component="p">
              {t(
                'Set up your MCP infrastructure by creating a gateway, route, and MCP extension. Use the setup wizard to get started quickly, or create an MCP server directly.',
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
              <Button
                variant="secondary"
                onClick={() => navigate('/kuadrant/mcp/servers/create')}
                data-test="mcp-create-server-button"
              >
                {t('Create MCP server')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      </PageSection>
    </>
  );
};

export default MCPOverviewPage;
