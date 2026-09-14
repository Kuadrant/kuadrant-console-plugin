import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardCopyButton, Content, Icon, Title } from '@patternfly/react-core';
import { ServerIcon } from '@patternfly/react-icons';

interface MCPItemHeaderProps {
  icon: React.ReactNode;
  name: string;
  serverName?: string;
  description?: string;
  copyId: string;
  copyLabel: string;
}

// name, owning server and description of the selected tool or prompt
const MCPItemHeader: React.FC<MCPItemHeaderProps> = ({
  icon,
  name,
  serverName,
  description,
  copyId,
  copyLabel,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => setCopied(false), [name]);

  return (
    <>
      <div className="kuadrant-mcp-inspector-page__item-header">
        <Title headingLevel="h2">
          <Icon isInline>{icon}</Icon> {name}
        </Title>
        {serverName && (
          <Content component="small" className="kuadrant-mcp-inspector-page__item-server">
            <Icon isInline>
              <ServerIcon aria-hidden="true" />
            </Icon>{' '}
            {serverName}
          </Content>
        )}
      </div>
      <div className="kuadrant-mcp-inspector-page__item-description">
        <Content component="p">{description || t('No description')}</Content>
        <ClipboardCopyButton
          id={copyId}
          textId={`${copyId}-text`}
          variant="plain"
          aria-label={copyLabel}
          onClick={() => {
            void navigator.clipboard?.writeText(name);
            setCopied(true);
          }}
          exitDelay={copied ? 1500 : 600}
          onTooltipHidden={() => setCopied(false)}
        >
          {copied ? t('Copied') : copyLabel}
        </ClipboardCopyButton>
      </div>
    </>
  );
};

export default MCPItemHeader;
