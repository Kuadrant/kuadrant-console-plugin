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

type ContactField = 'team' | 'email' | 'slack' | 'url';

interface ContactInfoEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  resource: APIProduct;
  field: ContactField;
  onUpdate?: () => void;
}

const ContactInfoEditModal: React.FC<ContactInfoEditModalProps> = ({
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
      setValue(resource.spec.contact?.[field] || '');
      setError('');
    }
  }, [isOpen, resource, field]);

  const getFieldLabel = (): string => {
    switch (field) {
      case 'team':
        return t('Contact Team');
      case 'email':
        return t('Contact Email');
      case 'slack':
        return t('Contact Slack');
      case 'url':
        return t('Contact URL');
    }
  };

  const getFieldPlaceholder = (): string | undefined => {
    switch (field) {
      case 'slack':
        return t('e.g., #team-channel or @username');
      case 'url':
        return t('e.g., https://team.example.com');
      default:
        return undefined;
    }
  };

  const getInputType = (): 'text' | 'email' | 'url' => {
    switch (field) {
      case 'email':
        return 'email';
      case 'url':
        return 'url';
      default:
        return 'text';
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
          contact: {
            ...resource.spec.contact,
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
      setError(err instanceof Error ? err.message : t('Failed to update contact information'));
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
      aria-labelledby="edit-contact-field-modal-title"
    >
      <ModalHeader title={t('Edit {{field}}', { field: getFieldLabel() })} />
      <ModalBody>
        {error && (
          <Alert variant="danger" isInline title={t('Error updating contact information')}>
            {error}
          </Alert>
        )}
        <Form onSubmit={handleFormSubmit}>
          <FormGroup label={getFieldLabel()} fieldId={`contact-${field}`}>
            <TextInput
              type={getInputType()}
              id={`contact-${field}`}
              value={value}
              onChange={(_event, val) => setValue(val)}
              placeholder={getFieldPlaceholder()}
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

export default ContactInfoEditModal;
