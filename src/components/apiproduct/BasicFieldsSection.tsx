import {
  FormGroup,
  FormHelperText,
  TextInput,
  TextArea,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

interface BasicFieldsSectionProps {
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  resourceName: string;
  onResourceNameChange: (name: string) => void;
  onResourceNameManualEdit: () => void;
  description: string;
  onDescriptionChange: (desc: string) => void;
  owner: string;
  onOwnerChange: (owner: string) => void;
  isEditMode: boolean;
}

const BasicFieldsSection: React.FC<BasicFieldsSectionProps> = ({
  displayName,
  onDisplayNameChange,
  resourceName,
  onResourceNameChange,
  onResourceNameManualEdit,
  description,
  onDescriptionChange,
  owner,
  onOwnerChange,
  isEditMode,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  const handleDisplayNameChange = (_event: React.FormEvent<HTMLInputElement>, value: string) => {
    onDisplayNameChange(value);
  };

  const handleResourceNameChange = (_event: React.FormEvent<HTMLInputElement>, value: string) => {
    onResourceNameManualEdit();
    onResourceNameChange(value);
  };

  const handleDescriptionChange = (_event: React.FormEvent<HTMLTextAreaElement>, value: string) => {
    onDescriptionChange(value);
  };

  const handleOwnerChange = (_event: React.FormEvent<HTMLInputElement>, value: string) => {
    onOwnerChange(value);
  };

  return (
    <>
      <FormGroup label={t('Display Name')} isRequired fieldId="display-name">
        <TextInput
          isRequired
          type="text"
          id="display-name"
          name="display-name"
          value={displayName}
          onChange={handleDisplayNameChange}
          placeholder={t('My API Product')}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{t('Human-readable name shown in the API catalog')}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <FormGroup label={t('Resource Name')} isRequired fieldId="resource-name">
        <TextInput
          isRequired
          type="text"
          id="resource-name"
          name="resource-name"
          value={resourceName}
          onChange={handleResourceNameChange}
          isDisabled={isEditMode}
          placeholder={t('my-api-product')}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {isEditMode
                ? t('Kubernetes resource name (immutable)')
                : t('Kubernetes resource name (auto-generated from display name, editable)')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <FormGroup label={t('Description')} fieldId="description">
        <TextArea
          id="description"
          name="description"
          value={description}
          onChange={handleDescriptionChange}
          placeholder={t('Describe what this API does...')}
          rows={4}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{t('Optional description for API consumers')}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <FormGroup label={t('Owner')} isRequired fieldId="owner">
        <TextInput
          isRequired
          type="text"
          id="owner"
          name="owner"
          value={owner}
          onChange={handleOwnerChange}
          placeholder={t('api-team')}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {t('Team or individual responsible for this API product')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </>
  );
};

export default BasicFieldsSection;
