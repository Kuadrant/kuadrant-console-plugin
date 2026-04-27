import * as React from 'react';
import {
  Button,
  ButtonVariant,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  FormGroup,
  TextInput,
  Alert,
} from '@patternfly/react-core';
import { k8sDelete, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import { getModelFromResource } from '../../utils/getModelFromResource';

interface APIProductDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  resource: K8sResourceCommon;
}

const APIProductDeleteModal: React.FC<APIProductDeleteModalProps> = ({
  isOpen,
  onClose,
  resource,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [confirmName, setConfirmName] = React.useState('');
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [error, setError] = React.useState('');

  const resourceName = resource.metadata?.name || '';
  const isConfirmValid = confirmName === resourceName;

  const handleDelete = async () => {
    setIsDeleting(true);
    setError('');

    try {
      const model = getModelFromResource(resource);
      await k8sDelete({
        model,
        resource,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete APIProduct');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    setConfirmName('');
    setError('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      variant="medium"
      aria-labelledby="delete-apiproduct-modal-title"
      aria-describedby="delete-apiproduct-modal-body"
    >
      <ModalHeader title={t('Delete API Product')} />
      <ModalBody id="delete-apiproduct-modal-body">
        {error && (
          <Alert variant="danger" isInline title={t('Error deleting APIProduct')}>
            {error}
          </Alert>
        )}
        <p>{t('Warning: This action cannot be undone')}</p>
        <p>
          {t('This will permanently delete the APIProduct')} <strong>{resourceName}</strong>.
        </p>
        <FormGroup
          label={t('Type the APIProduct name to confirm deletion')}
          isRequired
          fieldId="confirm-delete"
        >
          <TextInput
            id="confirm-delete"
            value={confirmName}
            onChange={(_event, value) => setConfirmName(value)}
            aria-label={t('Confirm resource name')}
            placeholder={resourceName}
          />
        </FormGroup>
      </ModalBody>
      <ModalFooter>
        <Button
          key="delete"
          variant={ButtonVariant.danger}
          onClick={handleDelete}
          isDisabled={!isConfirmValid || isDeleting}
          isLoading={isDeleting}
        >
          {t('Delete API Product')}
        </Button>
        <Button key="cancel" variant={ButtonVariant.link} onClick={handleClose}>
          {t('Cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default APIProductDeleteModal;
