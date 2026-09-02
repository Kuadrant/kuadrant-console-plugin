import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Content,
  Form,
  FormGroup,
  TextInput,
  Tooltip,
} from '@patternfly/react-core';
import { MagicIcon, SyncAltIcon } from '@patternfly/react-icons';
import { MCPPrompt } from '../../utils/mcp/client';
import { humanize } from '../../utils/mcp/humanize';
import MCPItemHeader from './MCPItemHeader';
import MCPItemSelect from './MCPItemSelect';

interface MCPPromptWorkspaceProps {
  prompts: MCPPrompt[];
  isGenerating: boolean;
  isRefreshing: boolean;
  onRefresh: () => Promise<void>;
  onGenerate: (name: string, args: Record<string, string>) => Promise<void>;
  serverNameFor?: (promptName: string) => string | undefined;
}

const emptyValues = (prompt: MCPPrompt): Record<string, string> =>
  (prompt.arguments ?? []).reduce<Record<string, string>>((values, argument) => {
    values[argument.name] = '';
    return values;
  }, {});

const MCPPromptWorkspace: React.FC<MCPPromptWorkspaceProps> = ({
  prompts,
  isGenerating,
  isRefreshing,
  onRefresh,
  onGenerate,
  serverNameFor,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [selectedPromptName, setSelectedPromptName] = React.useState('');
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const selectedPrompt = prompts.find((prompt) => prompt.name === selectedPromptName);
  const promptArguments = selectedPrompt?.arguments ?? [];

  const selectPrompt = (name: string) => {
    const prompt = prompts.find((candidate) => candidate.name === name);
    if (!prompt) {
      return;
    }
    setSelectedPromptName(prompt.name);
    setValues(emptyValues(prompt));
    setFieldErrors({});
  };

  const clearFields = () => {
    if (selectedPrompt) {
      setValues(emptyValues(selectedPrompt));
    }
    setFieldErrors({});
  };

  const generate = async () => {
    if (!selectedPrompt) {
      return;
    }
    const errors: Record<string, string> = {};
    const args: Record<string, string> = {};
    promptArguments.forEach((argument) => {
      const value = (values[argument.name] ?? '').trim();
      if (!value) {
        if (argument.required) {
          errors[argument.name] = t('{{field}} is required', { field: humanize(argument.name) });
        }
        return;
      }
      args[argument.name] = value;
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    await onGenerate(selectedPrompt.name, args);
  };

  return (
    <Card isFullHeight className="kuadrant-mcp-inspector-page__workspace">
      <CardHeader
        actions={{
          actions: (
            <Tooltip content={t('Refresh prompts')}>
              <Button
                variant="plain"
                icon={<SyncAltIcon aria-hidden="true" />}
                onClick={() => void onRefresh()}
                isLoading={isRefreshing}
                isDisabled={isRefreshing}
                aria-label={t('Refresh prompts')}
              />
            </Tooltip>
          ),
        }}
      >
        <CardTitle>{t('Select a prompt')}</CardTitle>
      </CardHeader>
      <CardBody>
        <MCPItemSelect
          items={prompts}
          selectedName={selectedPromptName}
          onSelect={selectPrompt}
          onClear={() => setSelectedPromptName('')}
          serverNameFor={serverNameFor}
          idPrefix="mcp-inspector-prompt"
          searchLabel={t('Search prompts')}
          toggleLabel={t('Prompt selector')}
          clearLabel={t('Clear prompt selection')}
          placeholder={t('Find by name')}
          emptyText={t('No prompts found')}
        />
        {selectedPrompt ? (
          <div className="kuadrant-mcp-inspector-page__selected-item">
            <MCPItemHeader
              icon={<MagicIcon aria-hidden="true" />}
              name={selectedPrompt.name}
              serverName={serverNameFor?.(selectedPrompt.name)}
              description={selectedPrompt.description}
              copyId="mcp-inspector-copy-prompt-name"
              copyLabel={t('Copy prompt name')}
            />
            <Form className="kuadrant-mcp-inspector-page__argument-form">
              {promptArguments.map((argument) => {
                const label = humanize(argument.name);
                const id = `mcp-prompt-argument-${argument.name}`;
                return (
                  <FormGroup
                    key={argument.name}
                    label={label}
                    fieldId={id}
                    isRequired={Boolean(argument.required)}
                  >
                    <TextInput
                      id={id}
                      value={values[argument.name] ?? ''}
                      onChange={(_event, next) => {
                        setValues((current) => ({ ...current, [argument.name]: next }));
                        setFieldErrors((current) => ({ ...current, [argument.name]: '' }));
                      }}
                      aria-label={label}
                      validated={fieldErrors[argument.name] ? 'error' : 'default'}
                    />
                    {argument.description && (
                      <Content component="small">{argument.description}</Content>
                    )}
                    {fieldErrors[argument.name] && (
                      <Content
                        component="small"
                        className="kuadrant-mcp-inspector-page__field-error"
                      >
                        {fieldErrors[argument.name]}
                      </Content>
                    )}
                  </FormGroup>
                );
              })}
              {promptArguments.length === 0 && (
                <Content component="small">{t('This prompt takes no arguments.')}</Content>
              )}
              <div className="kuadrant-mcp-inspector-page__actions">
                <Button variant="primary" onClick={generate} isLoading={isGenerating}>
                  {t('Generate prompt')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={clearFields}
                  isDisabled={promptArguments.length === 0}
                >
                  {t('Clear fields')}
                </Button>
              </div>
            </Form>
          </div>
        ) : (
          <Content component="p">{t('Select a prompt to generate it.')}</Content>
        )}
      </CardBody>
    </Card>
  );
};

export default MCPPromptWorkspace;
