import * as React from 'react';
import {
  Button,
  ButtonVariant,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Form,
  FormGroup,
  TextInput,
  Alert,
} from '@patternfly/react-core';
import { k8sUpdate } from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import { getModelFromResource } from '../../utils/getModelFromResource';
import { APIProduct } from './types';

type DocumentationField = 'openAPISpecURL' | 'docsURL';

interface DocumentationEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  resource: APIProduct;
  field: DocumentationField;
  onUpdate?: () => void;
}

const DocumentationEditModal: React.FC<DocumentationEditModalProps> = ({
  isOpen,
  onClose,
  resource,
  field,
  onUpdate,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [value, setValue] = React.useState('');
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (isOpen) {
      setValue(resource.spec.documentation?.[field] || '');
      setError('');
    }
  }, [isOpen, resource, field]);

  const getFieldLabel = (): string => {
    switch (field) {
      case 'openAPISpecURL':
        return t('API Specification');
      case 'docsURL':
        return t('API Documentation');
    }
  };

  const handleUpdate = async () => {
    setIsUpdating(true);
    setError('');

    try {
      const model = getModelFromResource(resource);
      const updatedResource: APIProduct = {
        ...resource,
        spec: {
          ...resource.spec,
          documentation: {
            ...resource.spec.documentation,
            [field]: value || undefined,
          },
        },
      };

      await k8sUpdate({
        model,
        data: updatedResource,
      });

      onUpdate?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to update documentation'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isUpdating) {
      handleUpdate();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      variant="small"
      aria-labelledby="edit-documentation-field-modal-title"
    >
      <ModalHeader title={t('Edit {{field}}', { field: getFieldLabel() })} />
      <ModalBody>
        {error && (
          <Alert variant="danger" isInline title={t('Error updating documentation')}>
            {error}
          </Alert>
        )}
        <Form onSubmit={handleFormSubmit}>
          <FormGroup label={getFieldLabel()} fieldId={`documentation-${field}`}>
            <TextInput
              type="url"
              id={`documentation-${field}`}
              value={value}
              onChange={(_event, val) => setValue(val)}
              placeholder={t('e.g., https://example.com/api/spec')}
            />
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          key="update"
          variant={ButtonVariant.primary}
          onClick={handleUpdate}
          isDisabled={isUpdating}
          isLoading={isUpdating}
        >
          {t('Save')}
        </Button>
        <Button key="cancel" variant={ButtonVariant.link} onClick={handleClose}>
          {t('Cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default DocumentationEditModal;
