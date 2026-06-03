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
  Radio,
  Alert,
} from '@patternfly/react-core';
import { k8sUpdate } from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import { getModelFromResource } from '../../utils/getModelFromResource';
import { APIProduct, PublishStatus } from './types';

interface PublishStatusEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  resource: APIProduct;
  onUpdate?: () => void;
}

const PublishStatusEditModal: React.FC<PublishStatusEditModalProps> = ({
  isOpen,
  onClose,
  resource,
  onUpdate,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [publishStatus, setPublishStatus] = React.useState<PublishStatus>(
    resource.spec.publishStatus || 'Draft',
  );
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (isOpen) {
      setPublishStatus(resource.spec.publishStatus || 'Draft');
      setError('');
    }
  }, [isOpen, resource]);

  const handleUpdate = async () => {
    setIsUpdating(true);
    setError('');

    try {
      const model = getModelFromResource(resource);
      const updatedResource: APIProduct = {
        ...resource,
        spec: {
          ...resource.spec,
          publishStatus,
        },
      };

      await k8sUpdate({
        model,
        data: updatedResource,
      });

      onUpdate?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to update publish status'));
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
      aria-labelledby="edit-publish-status-modal-title"
    >
      <ModalHeader title={t('Edit Publish Status')} />
      <ModalBody>
        {error && (
          <Alert variant="danger" isInline title={t('Error updating publish status')}>
            {error}
          </Alert>
        )}
        <Form onSubmit={handleFormSubmit}>
          <FormGroup label={t('Publish Status')} fieldId="publish-status">
            <Radio
              id="status-draft"
              name="publish-status"
              label={t('Draft')}
              isChecked={publishStatus === 'Draft'}
              onChange={() => setPublishStatus('Draft')}
            />
            <Radio
              id="status-published"
              name="publish-status"
              label={t('Published')}
              isChecked={publishStatus === 'Published'}
              onChange={() => setPublishStatus('Published')}
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

export default PublishStatusEditModal;
