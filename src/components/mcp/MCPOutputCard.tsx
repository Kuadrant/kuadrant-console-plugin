import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
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
import { MCPCallExchange } from '../../utils/mcp/client';
import { MCPJsonBlock } from './MCPCodeBlocks';

interface MCPOutputCardProps {
  exchange: MCPCallExchange<unknown> | null;
  resultTitle: string;
  outputLabel: string;
  idPrefix: string;
  inputRequired: boolean;
  isError?: boolean;
  children: React.ReactNode;
}

const MCPOutputCard: React.FC<MCPOutputCardProps> = ({
  exchange,
  resultTitle,
  outputLabel,
  idPrefix,
  inputRequired,
  isError = false,
  children,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeTab, setActiveTab] = React.useState<string | number>(0);

  return (
    <Card isFullHeight className="kuadrant-mcp-inspector-page__output">
      <CardHeader>
        <CardTitle>{t('Output')}</CardTitle>
      </CardHeader>
      <CardBody>
        {exchange && (
          <div className="kuadrant-mcp-inspector-page__request-summary">
            <Label color={inputRequired ? 'orange' : isError ? 'red' : 'green'}>
              {inputRequired ? t('Input required') : isError ? t('Error') : t('Success')}
            </Label>
            <small>
              {exchange.status} {exchange.statusText}
            </small>
            <small>{exchange.durationMs} ms</small>
          </div>
        )}
        {inputRequired && (
          <Alert variant="warning" isInline title={t('This request is incomplete.')}>
            {t(
              'The gateway requested a continuation. Interactive continuation is not supported by this inspector; inspect the JSON-RPC response for details.',
            )}
          </Alert>
        )}
        <Tabs
          activeKey={activeTab}
          onSelect={(_event, key) => setActiveTab(key)}
          aria-label={outputLabel}
        >
          <Tab eventKey={0} title={<TabTitleText>{resultTitle}</TabTitleText>}>
            {exchange ? (
              <div className="kuadrant-mcp-inspector-page__console">{children}</div>
            ) : (
              <Content component="p">{t('No results')}</Content>
            )}
          </Tab>
          <Tab eventKey={1} title={<TabTitleText>{t('Console')}</TabTitleText>}>
            {exchange ? (
              <div className="kuadrant-mcp-inspector-page__console">
                <Title headingLevel="h3">{t('JSON-RPC request')}</Title>
                <MCPJsonBlock id={`${idPrefix}-request`} value={exchange.request} />
                <Title headingLevel="h3">{t('JSON-RPC response')}</Title>
                <MCPJsonBlock id={`${idPrefix}-response`} value={exchange.response} />
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

export default MCPOutputCard;
