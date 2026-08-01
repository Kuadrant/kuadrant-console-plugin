import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  ButtonVariant,
  FormGroup,
  TextInput,
  Alert,
} from '@patternfly/react-core';
import { k8sDelete, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import { getModelFromResource } from '../../utils/getModelFromResource';
import '../kuadrant.css';

interface APIProductDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleteSuccess?: () => void;
  resource: K8sResourceCommon;
}

const APIProductDeleteModal: React.FC<APIProductDeleteModalProps> = ({
  isOpen,
  onClose,
  onDeleteSuccess,
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
      if (onDeleteSuccess) {
        onDeleteSuccess();
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete APIProduct');
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    setConfirmName('');
    setError('');
    onClose();
  };

  // Reset confirmation name when modal opens/closes
  React.useEffect(() => {
    if (!isOpen) {
      setConfirmName('');
    }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} variant={ModalVariant.small}>
      <ModalHeader title={t('Delete API Product?')} titleIconVariant="warning" />
      <ModalBody>
        {error && (
          <Alert
            variant="danger"
            isInline
            title={t('Delete failed')}
            style={{ marginBottom: '16px' }}
          >
            {error}
          </Alert>
        )}
        <p>
          {t('This action cannot be undone. Type')} <strong>{resourceName}</strong>{' '}
          {t('to confirm deletion.')}
        </p>
        <FormGroup style={{ marginTop: '16px' }}>
          <TextInput
            type="text"
            id="confirm-delete"
            value={confirmName}
            onChange={(_event, value) => setConfirmName(value)}
            placeholder={t('Enter API Product name')}
            aria-label={t('Confirm resource name')}
          />
        </FormGroup>
      </ModalBody>
      <ModalFooter>
        <Button
          key="confirm"
          variant={ButtonVariant.danger}
          onClick={handleDelete}
          isDisabled={!isConfirmValid || isDeleting}
        >
          {t('Delete')}
        </Button>
        <Button key="cancel" variant={ButtonVariant.link} onClick={handleClose}>
          {t('Cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default APIProductDeleteModal;
