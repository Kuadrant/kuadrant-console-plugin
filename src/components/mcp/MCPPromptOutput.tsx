import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Content } from '@patternfly/react-core';
import { MCPCallExchange, PromptsGetResult } from '../../utils/mcp/client';
import { promptText } from '../../utils/mcp/prompts';
import { CHARACTERS_PER_TOKEN, estimateTokens } from '../../utils/mcp/tokens';
import { MCPCodeBlock, MCPJsonBlock } from './MCPCodeBlocks';
import MCPOutputCard from './MCPOutputCard';

interface MCPPromptOutputProps {
  exchange: MCPCallExchange<PromptsGetResult> | null;
}

const MCPPromptOutput: React.FC<MCPPromptOutputProps> = ({ exchange }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const text = exchange ? promptText(exchange.result) : '';
  const inputRequired = exchange?.result.resultType === 'input_required';

  return (
    <MCPOutputCard
      exchange={exchange}
      resultTitle={t('Prompt')}
      outputLabel={t('Prompt output')}
      idPrefix="mcp-inspector-prompt"
      inputRequired={inputRequired}
    >
      {exchange?.result.description && (
        <Content component="p">{exchange.result.description}</Content>
      )}
      {exchange &&
        (inputRequired ? (
          <MCPJsonBlock id="mcp-inspector-prompt-incomplete" value={exchange.result} />
        ) : (
          <MCPCodeBlock id="mcp-inspector-prompt-text" text={text} />
        ))}
      {exchange && !inputRequired && (
        <Content component="small" className="kuadrant-mcp-inspector-page__token-estimate">
          <strong>
            {t('Token count')}: ~{estimateTokens(text)}
          </strong>{' '}
          {t('({{characters}} characters, estimated at {{perToken}} per token)', {
            characters: text.length,
            perToken: CHARACTERS_PER_TOKEN,
          })}
        </Content>
      )}
    </MCPOutputCard>
  );
};

export default MCPPromptOutput;
