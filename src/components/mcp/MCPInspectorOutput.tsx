import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Content,
  Label,
  Tab,
  Tabs,
  TabTitleText,
  Title,
} from '@patternfly/react-core';
import { MCPCallExchange, ToolsCallResult } from '../../utils/mcp/client';
import { MCPJsonBlock } from './MCPCodeBlocks';

interface MCPInspectorOutputProps {
  exchange: MCPCallExchange<ToolsCallResult> | null;
}

const renderServerResult = (result: ToolsCallResult): React.ReactNode => {
  if (!result.content?.length) {
    return <pre>{JSON.stringify(result, null, 2)}</pre>;
  }
  return result.content.map((content, index) =>
    content.type === 'text' && content.text ? (
      <pre key={index}>{content.text}</pre>
    ) : (
      <pre key={index}>{JSON.stringify(content, null, 2)}</pre>
    ),
  );
};

const MCPInspectorOutput: React.FC<MCPInspectorOutputProps> = ({ exchange }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeTab, setActiveTab] = React.useState<string | number>(0);
  const succeeded = exchange ? !exchange.result.isError : false;

  return (
    <Card isFullHeight className="kuadrant-mcp-inspector-page__output">
      <CardHeader>
        <CardTitle>{t('Output')}</CardTitle>
      </CardHeader>
      <CardBody>
        {exchange && (
          <div className="kuadrant-mcp-inspector-page__request-summary">
            <Label color={succeeded ? 'green' : 'red'}>
              {succeeded ? t('Success') : t('Error')}
            </Label>
            <small>
              {exchange.status} {exchange.statusText}
            </small>
            <small>{exchange.durationMs} ms</small>
          </div>
        )}
        <Tabs
          activeKey={activeTab}
          onSelect={(_event, key) => setActiveTab(key)}
          aria-label={t('Tool call output')}
        >
          <Tab eventKey={0} title={<TabTitleText>{t('Console')}</TabTitleText>}>
            {exchange ? (
              <div className="kuadrant-mcp-inspector-page__console">
                <Title headingLevel="h3">{t('JSON-RPC request')}</Title>
                <MCPJsonBlock id="mcp-inspector-jsonrpc-request" value={exchange.request} />
                <Title headingLevel="h3">{t('JSON-RPC response')}</Title>
                <MCPJsonBlock id="mcp-inspector-jsonrpc-response" value={exchange.response} />
              </div>
            ) : (
              <Content component="p">{t('No results')}</Content>
            )}
          </Tab>
          <Tab eventKey={1} title={<TabTitleText>{t('Server result')}</TabTitleText>}>
            {exchange ? renderServerResult(exchange.result) : null}
          </Tab>
        </Tabs>
      </CardBody>
    </Card>
  );
};

export default MCPInspectorOutput;
