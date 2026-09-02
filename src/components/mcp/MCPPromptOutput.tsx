import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Content,
  Tab,
  Tabs,
  TabTitleText,
  Title,
} from '@patternfly/react-core';
import { MCPCallExchange, PromptsGetResult } from '../../utils/mcp/client';
import { promptText } from '../../utils/mcp/prompts';
import { CHARACTERS_PER_TOKEN, estimateTokens } from '../../utils/mcp/tokens';
import { MCPCodeBlock, MCPJsonBlock } from './MCPCodeBlocks';

interface MCPPromptOutputProps {
  exchange: MCPCallExchange<PromptsGetResult> | null;
}

const MCPPromptOutput: React.FC<MCPPromptOutputProps> = ({ exchange }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeTab, setActiveTab] = React.useState<string | number>(0);
  const text = exchange ? promptText(exchange.result) : '';

  return (
    <Card isFullHeight className="kuadrant-mcp-inspector-page__output">
      <CardHeader>
        <CardTitle>{t('Output')}</CardTitle>
      </CardHeader>
      <CardBody>
        {exchange && (
          <div className="kuadrant-mcp-inspector-page__request-summary">
            <small>
              {exchange.status} {exchange.statusText}
            </small>
            <small>{exchange.durationMs} ms</small>
          </div>
        )}
        <Tabs
          activeKey={activeTab}
          onSelect={(_event, key) => setActiveTab(key)}
          aria-label={t('Prompt output')}
        >
          <Tab eventKey={0} title={<TabTitleText>{t('Prompt')}</TabTitleText>}>
            {exchange ? (
              <div className="kuadrant-mcp-inspector-page__console">
                {exchange.result.description && (
                  <Content component="p">{exchange.result.description}</Content>
                )}
                <MCPCodeBlock id="mcp-inspector-prompt-text" text={text} />
                <Content component="small" className="kuadrant-mcp-inspector-page__token-estimate">
                  <strong>
                    {t('Token count')}: ~{estimateTokens(text)}
                  </strong>{' '}
                  {t('({{characters}} characters, estimated at {{perToken}} per token)', {
                    characters: text.length,
                    perToken: CHARACTERS_PER_TOKEN,
                  })}
                </Content>
              </div>
            ) : (
              <Content component="p">{t('No results')}</Content>
            )}
          </Tab>
          <Tab eventKey={1} title={<TabTitleText>{t('Console')}</TabTitleText>}>
            {exchange ? (
              <div className="kuadrant-mcp-inspector-page__console">
                <Title headingLevel="h3">{t('JSON-RPC request')}</Title>
                <MCPJsonBlock id="mcp-inspector-prompt-request" value={exchange.request} />
                <Title headingLevel="h3">{t('JSON-RPC response')}</Title>
                <MCPJsonBlock id="mcp-inspector-prompt-response" value={exchange.response} />
              </div>
            ) : (
              <Content component="p">{t('No results')}</Content>
            )}
          </Tab>
        </Tabs>
      </CardBody>
    </Card>
  );
};

export default MCPPromptOutput;
