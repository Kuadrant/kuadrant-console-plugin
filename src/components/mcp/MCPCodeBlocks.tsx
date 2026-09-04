import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipboardCopyButton,
  CodeBlock,
  CodeBlockAction,
  CodeBlockCode,
} from '@patternfly/react-core';

interface MCPCodeBlockProps {
  id: string;
  text: string;
}

export const MCPCodeBlock: React.FC<MCPCodeBlockProps> = ({ id, text }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [copied, setCopied] = React.useState(false);

  return (
    <CodeBlock
      actions={
        <CodeBlockAction>
          <ClipboardCopyButton
            id={`${id}-copy`}
            textId={id}
            variant="plain"
            aria-label={t('Copy to clipboard')}
            onClick={() => {
              void navigator.clipboard?.writeText(text);
              setCopied(true);
            }}
            exitDelay={copied ? 1500 : 600}
            onTooltipHidden={() => setCopied(false)}
          >
            {copied ? t('Copied') : t('Copy to clipboard')}
          </ClipboardCopyButton>
        </CodeBlockAction>
      }
    >
      <CodeBlockCode id={id}>{text}</CodeBlockCode>
    </CodeBlock>
  );
};

interface MCPJsonBlockProps {
  id: string;
  value: unknown;
}

export const MCPJsonBlock: React.FC<MCPJsonBlockProps> = ({ id, value }) => (
  <MCPCodeBlock id={id} text={JSON.stringify(value, null, 2)} />
);
