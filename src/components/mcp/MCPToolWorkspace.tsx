import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Checkbox,
  Content,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Label,
  LabelGroup,
  TextArea,
  TextInput,
  Title,
  Tooltip,
} from '@patternfly/react-core';
import { SyncAltIcon, WrenchIcon } from '@patternfly/react-icons';
import { MCPTool } from '../../utils/mcp/client';
import { humanize } from '../../utils/mcp/humanize';
import MCPItemHeader from './MCPItemHeader';
import MCPItemSelect from './MCPItemSelect';

interface JsonSchema {
  type?: string | string[];
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
}

interface MCPToolWorkspaceProps {
  tools: MCPTool[];
  isRunning: boolean;
  isRefreshing: boolean;
  onRefresh: () => Promise<void>;
  onRun: (
    name: string,
    args: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ) => Promise<void>;
  serverNameFor?: (toolName: string) => string | undefined;
}

type FieldValues = Record<string, string | boolean>;
interface MetadataRow {
  id: number;
  key: string;
  value: string;
}

const schemaType = (schema: JsonSchema): string => {
  if (Array.isArray(schema.type)) {
    return schema.type.find((type) => type !== 'null') ?? 'string';
  }
  return schema.type ?? 'string';
};

const initialValues = (tool: MCPTool): FieldValues => {
  const properties = (tool.inputSchema as JsonSchema | undefined)?.properties ?? {};
  return Object.entries(properties).reduce<FieldValues>((values, [name, schema]) => {
    // a null default means no value, the same as no default
    if (schema.default !== undefined && schema.default !== null) {
      values[name] =
        typeof schema.default === 'boolean'
          ? schema.default
          : typeof schema.default === 'string'
          ? schema.default
          : JSON.stringify(schema.default, null, 2);
    } else {
      values[name] = schemaType(schema) === 'boolean' ? false : '';
    }
    return values;
  }, {});
};

const annotationLabels = (tool: MCPTool): string[] => {
  const annotations = tool.annotations ?? {};
  return [
    annotations.readOnlyHint ? 'Read only' : '',
    annotations.destructiveHint ? 'Destructive' : '',
    annotations.idempotentHint ? 'Idempotent' : '',
    annotations.openWorldHint ? 'Open world' : '',
  ].filter(Boolean);
};

const translatedAnnotation = (annotation: string, t: (key: string) => string): string => {
  const translations: Record<string, string> = {
    'Read only': t('Read only'),
    Destructive: t('Destructive'),
    Idempotent: t('Idempotent'),
    'Open world': t('Open world'),
  };
  return translations[annotation] ?? annotation;
};

const MCPToolWorkspace: React.FC<MCPToolWorkspaceProps> = ({
  tools,
  isRunning,
  isRefreshing,
  onRefresh,
  onRun,
  serverNameFor,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [selectedToolName, setSelectedToolName] = React.useState('');
  const [values, setValues] = React.useState<FieldValues>({});
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [validationMessage, setValidationMessage] = React.useState('');
  const [metadataRows, setMetadataRows] = React.useState<MetadataRow[]>([]);
  const nextMetadataId = React.useRef(1);

  const selectedTool = tools.find((tool) => tool.name === selectedToolName);

  const selectTool = (name: string) => {
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool) {
      return;
    }
    setSelectedToolName(tool.name);
    setValues(initialValues(tool));
    setFieldErrors({});
    setValidationMessage('');
    setMetadataRows([]);
  };

  const validate = (): Record<string, unknown> | null => {
    if (!selectedTool) {
      return null;
    }
    const inputSchema = (selectedTool.inputSchema ?? {}) as JsonSchema;
    const properties = inputSchema.properties ?? {};
    const required = new Set(inputSchema.required ?? []);
    const errors: Record<string, string> = {};
    const args: Record<string, unknown> = {};

    Object.entries(properties).forEach(([name, propertySchema]) => {
      const value = values[name];
      const label = propertySchema.title || humanize(name);
      const type = schemaType(propertySchema);
      const isEmpty = value === undefined || value === '';

      if (required.has(name) && isEmpty) {
        errors[name] = t('{{field}} is required', { field: label });
        return;
      }
      if (isEmpty) {
        return;
      }

      if (propertySchema.enum) {
        // the select carries the option as a string; send the schema's own value
        const option = propertySchema.enum.find((candidate) => String(candidate) === String(value));
        if (option === undefined) {
          errors[name] = t('{{field}} must be one of the listed values', { field: label });
          return;
        }
        args[name] = option;
        return;
      }

      if (type === 'number' || type === 'integer') {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || (type === 'integer' && !Number.isInteger(parsed))) {
          errors[name] =
            type === 'integer'
              ? t('{{field}} must be an integer', { field: label })
              : t('{{field}} must be a number', { field: label });
          return;
        }
        args[name] = parsed;
        return;
      }

      if (type === 'object' || type === 'array') {
        try {
          const parsed = JSON.parse(String(value));
          // typeof null is 'object'; only a nullable schema may send null
          const nullable =
            Array.isArray(propertySchema.type) && propertySchema.type.includes('null');
          const valid =
            parsed === null
              ? nullable
              : type === 'array'
              ? Array.isArray(parsed)
              : typeof parsed === 'object' && !Array.isArray(parsed);
          if (!valid) {
            throw new Error('wrong JSON type');
          }
          args[name] = parsed;
        } catch {
          errors[name] = t('{{field}} must be valid JSON', { field: label });
        }
        return;
      }

      args[name] = value;
    });

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setValidationMessage('');
      return null;
    }
    setValidationMessage(t('Input is valid'));
    return args;
  };

  const run = async () => {
    const args = validate();
    if (args && selectedTool) {
      const metadata = metadataRows.reduce<Record<string, unknown>>((result, row) => {
        if (row.key.trim()) {
          result[row.key.trim()] = row.value;
        }
        return result;
      }, {});
      if (Object.keys(metadata).length > 0) {
        await onRun(selectedTool.name, args, metadata);
      } else {
        await onRun(selectedTool.name, args);
      }
    }
  };

  const addMetadata = () => {
    setMetadataRows((current) => [
      ...current,
      { id: nextMetadataId.current++, key: '', value: '' },
    ]);
  };

  const updateMetadata = (id: number, field: 'key' | 'value', value: string) => {
    setMetadataRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  };

  const renderField = (name: string, propertySchema: JsonSchema) => {
    const type = schemaType(propertySchema);
    const label = propertySchema.title || humanize(name);
    const id = `mcp-tool-argument-${name}`;
    const value = values[name] ?? '';
    const setValue = (next: string | boolean) => {
      setValues((current) => ({ ...current, [name]: next }));
      setFieldErrors((current) => ({ ...current, [name]: '' }));
      setValidationMessage('');
    };

    if (propertySchema.enum) {
      return (
        <FormSelect
          id={id}
          value={String(value)}
          onChange={(_event, next) => setValue(next)}
          aria-label={label}
        >
          <FormSelectOption value="" label={t('Select a value...')} isPlaceholder />
          {propertySchema.enum.map((option) => (
            <FormSelectOption key={String(option)} value={String(option)} label={String(option)} />
          ))}
        </FormSelect>
      );
    }

    if (type === 'boolean') {
      return (
        <Checkbox
          id={id}
          label={propertySchema.description || label}
          isChecked={Boolean(value)}
          onChange={(_event, checked) => setValue(checked)}
          aria-label={label}
        />
      );
    }

    if (type === 'object' || type === 'array') {
      return (
        <TextArea
          id={id}
          value={String(value)}
          onChange={(_event, next) => setValue(next)}
          aria-label={label}
          placeholder={type === 'array' ? '[]' : '{}'}
          rows={4}
          validated={fieldErrors[name] ? 'error' : 'default'}
        />
      );
    }

    return (
      <TextInput
        id={id}
        type={type === 'number' || type === 'integer' ? 'number' : 'text'}
        value={String(value)}
        onChange={(_event, next) => setValue(next)}
        aria-label={label}
        validated={fieldErrors[name] ? 'error' : 'default'}
      />
    );
  };

  const inputSchema = (selectedTool?.inputSchema ?? {}) as JsonSchema;
  const properties = inputSchema.properties ?? {};
  const required = new Set(inputSchema.required ?? []);

  return (
    <Card isFullHeight className="kuadrant-mcp-inspector-page__workspace">
      <CardHeader
        actions={{
          actions: (
            <Tooltip content={t('Refresh tools')}>
              <Button
                variant="plain"
                icon={<SyncAltIcon aria-hidden="true" />}
                onClick={() => void onRefresh()}
                isLoading={isRefreshing}
                isDisabled={isRefreshing}
                aria-label={t('Refresh tools')}
              />
            </Tooltip>
          ),
        }}
      >
        <CardTitle>{t('Select a tool')}</CardTitle>
      </CardHeader>
      <CardBody>
        <MCPItemSelect
          items={tools}
          selectedName={selectedToolName}
          onSelect={selectTool}
          onClear={() => setSelectedToolName('')}
          serverNameFor={serverNameFor}
          idPrefix="mcp-inspector-tool"
          searchLabel={t('Search tools')}
          toggleLabel={t('Tool selector')}
          clearLabel={t('Clear tool selection')}
          placeholder={t('Find by name')}
          emptyText={t('No tools found')}
        />
        {selectedTool ? (
          <div className="kuadrant-mcp-inspector-page__selected-item">
            <MCPItemHeader
              icon={<WrenchIcon aria-hidden="true" />}
              name={selectedTool.name}
              serverName={serverNameFor?.(selectedTool.name)}
              description={selectedTool.description}
              copyId="mcp-inspector-copy-tool-name"
              copyLabel={t('Copy tool name')}
            />
            {annotationLabels(selectedTool).length > 0 && (
              <LabelGroup className="kuadrant-mcp-inspector-page__annotations">
                {annotationLabels(selectedTool).map((annotation) => (
                  <Label
                    key={annotation}
                    status={annotation === 'Destructive' ? 'warning' : undefined}
                  >
                    {translatedAnnotation(annotation, t)}
                  </Label>
                ))}
              </LabelGroup>
            )}
            <Form className="kuadrant-mcp-inspector-page__argument-form">
              {Object.entries(properties).map(([name, propertySchema]) => {
                const label = propertySchema.title || humanize(name);
                return (
                  <FormGroup
                    key={name}
                    label={label}
                    fieldId={`mcp-tool-argument-${name}`}
                    isRequired={required.has(name)}
                  >
                    {renderField(name, propertySchema)}
                    {propertySchema.description && schemaType(propertySchema) !== 'boolean' && (
                      <Content component="small">{propertySchema.description}</Content>
                    )}
                    {fieldErrors[name] && (
                      <Content
                        component="small"
                        className="kuadrant-mcp-inspector-page__field-error"
                      >
                        {fieldErrors[name]}
                      </Content>
                    )}
                  </FormGroup>
                );
              })}
              <div className="kuadrant-mcp-inspector-page__metadata">
                <div className="kuadrant-mcp-inspector-page__metadata-heading">
                  <Title headingLevel="h3">{t('Metadata')}</Title>
                  <Button variant="link" onClick={addMetadata} isInline>
                    {t('Add metadata')}
                  </Button>
                </div>
                <Content component="small">
                  {t('Optional key-value metadata is sent with the MCP tool call.')}
                </Content>
                {metadataRows.map((row) => (
                  <div key={row.id} className="kuadrant-mcp-inspector-page__metadata-row">
                    <TextInput
                      value={row.key}
                      onChange={(_event, value) => updateMetadata(row.id, 'key', value)}
                      aria-label={t('Metadata key')}
                      placeholder={t('Key')}
                    />
                    <TextInput
                      value={row.value}
                      onChange={(_event, value) => updateMetadata(row.id, 'value', value)}
                      aria-label={t('Metadata value')}
                      placeholder={t('Value')}
                    />
                    <Button
                      variant="link"
                      onClick={() =>
                        setMetadataRows((current) => current.filter((item) => item.id !== row.id))
                      }
                      aria-label={t('Remove metadata')}
                    >
                      {t('Remove')}
                    </Button>
                  </div>
                ))}
              </div>
              {validationMessage && (
                <Alert variant="success" isInline isPlain title={validationMessage} />
              )}
              <div className="kuadrant-mcp-inspector-page__actions">
                <Button variant="primary" onClick={validate}>
                  {t('Validate only')}
                </Button>
                <Button variant="primary" onClick={run} isLoading={isRunning}>
                  {t('Run tool')}
                </Button>
              </div>
            </Form>
          </div>
        ) : (
          <Content component="p">{t('Select a tool to inspect and run it.')}</Content>
        )}
      </CardBody>
    </Card>
  );
};

export default MCPToolWorkspace;
