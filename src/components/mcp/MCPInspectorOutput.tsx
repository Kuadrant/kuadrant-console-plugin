import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { MCPCallExchange, ToolsCallResult } from '../../utils/mcp/client';
import { MCPCodeBlock, MCPJsonBlock } from './MCPCodeBlocks';
import MCPOutputCard from './MCPOutputCard';

interface MCPInspectorOutputProps {
  exchange: MCPCallExchange<ToolsCallResult> | null;
}

const renderServerResult = (result: ToolsCallResult): React.ReactNode => {
  if (!result.content?.length) {
    return <MCPJsonBlock id="mcp-inspector-server-result" value={result} />;
  }
  return result.content.map((content, index) => {
    const id = `mcp-inspector-server-result-${index}`;
    return content.type === 'text' && typeof content.text === 'string' ? (
      <MCPCodeBlock key={index} id={id} text={content.text} />
    ) : (
      <MCPJsonBlock key={index} id={id} value={content} />
    );
  });
};

const MCPInspectorOutput: React.FC<MCPInspectorOutputProps> = ({ exchange }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  return (
    <MCPOutputCard
      exchange={exchange}
      resultTitle={t('Server result')}
      outputLabel={t('Tool call output')}
      idPrefix="mcp-inspector-jsonrpc"
      inputRequired={exchange?.result.resultType === 'input_required'}
      isError={exchange?.result.isError}
    >
      {exchange ? renderServerResult(exchange.result) : null}
    </MCPOutputCard>
  );
};

export default MCPInspectorOutput;
