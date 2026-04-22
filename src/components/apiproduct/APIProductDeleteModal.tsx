import { k8sDelete } from '@openshift-console/dynamic-plugin-sdk';
import {
  Modal,
  ModalVariant,
  Button,
  TextInput,
  Alert,
  Form,
  FormGroup,
} from '@patternfly/react-core';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { APIProduct } from './types';
import { getModelFromResource } from '../../utils/getModelFromResource';

interface APIProductDeleteModalProps {
  isOpen: boolean;
  apiProduct: APIProduct;
  onClose: () => void;
  onSuccess: () => void;
}

const APIProductDeleteModal: React.FC<APIProductDeleteModalProps> = ({
  isOpen,
  apiProduct,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [confirmName, setConfirmName] = React.useState('');
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');

  const isConfirmValid = confirmName === apiProduct.metadata.name;

  const handleConfirmChange = (_event: React.FormEvent<HTMLInputElement>, value: string) => {
    setConfirmName(value);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setErrorMsg('');

    try {
      const model = getModelFromResource(apiProduct);
      await k8sDelete({
        model,
        resource: apiProduct,
      });
      onSuccess();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      setErrorMsg(message);
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    setConfirmName('');
    setErrorMsg('');
    onClose();
  };

  return (
    <Modal
      variant={ModalVariant.medium}
      title={t('Delete API Product')}
      isOpen={isOpen}
      onClose={handleClose}
    >
      <Alert
        variant="warning"
        isInline
        title={t('Warning: This action cannot be undone')}
        style={{ marginBottom: '16px' }}
      />

      <p>
        {t('Are you sure you want to delete "{{displayName}}"?', {
          displayName: apiProduct.spec?.displayName || apiProduct.metadata.name,
        })}
      </p>

      <p style={{ marginTop: '16px' }}>{t('This action cannot be undone.')}</p>

      <Form>
        <FormGroup
          label={t('Type "{{name}}" to confirm:', { name: apiProduct.metadata.name })}
          fieldId="confirm-delete"
        >
          <TextInput
            id="confirm-delete"
            value={confirmName}
            onChange={handleConfirmChange}
            validated={confirmName && !isConfirmValid ? 'error' : 'default'}
            placeholder={apiProduct.metadata.name}
          />
        </FormGroup>
      </Form>

      {errorMsg && (
        <Alert
          variant="danger"
          isInline
          title={t('Error deleting API Product')}
          style={{ marginTop: '16px' }}
        >
          {errorMsg}
        </Alert>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
        <Button
          key="delete"
          variant="danger"
          onClick={handleDelete}
          isDisabled={!isConfirmValid || isDeleting}
          isLoading={isDeleting}
        >
          {t('Delete API Product')}
        </Button>
        <Button key="cancel" variant="link" onClick={handleClose} isDisabled={isDeleting}>
          {t('Cancel')}
        </Button>
      </div>
    </Modal>
  );
};

export default APIProductDeleteModal;
