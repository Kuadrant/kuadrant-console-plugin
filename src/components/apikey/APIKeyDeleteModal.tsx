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
import '../kuadrant.css';

interface APIKeyDeleteModalProps {
  isOpen: boolean;
  apiKeyName: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  error?: string;
}

const APIKeyDeleteModal: React.FC<APIKeyDeleteModalProps> = ({
  isOpen,
  apiKeyName,
  onConfirm,
  onCancel,
  error,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [confirmDeleteName, setConfirmDeleteName] = React.useState<string>('');

  // Reset confirmation name when modal opens/closes
  React.useEffect(() => {
    if (!isOpen) {
      setConfirmDeleteName('');
    }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onCancel} variant={ModalVariant.small}>
      <ModalHeader title={t('Delete API Key?')} />
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
          {t('This action cannot be undone. Type')} <strong>{apiKeyName}</strong>{' '}
          {t('to confirm deletion.')}
        </p>
        <FormGroup style={{ marginTop: '16px' }}>
          <TextInput
            type="text"
            id="confirm-delete-name"
            value={confirmDeleteName}
            onChange={(_event, value) => setConfirmDeleteName(value)}
            placeholder={t('Enter API key name')}
            aria-label={t('Confirm API key name')}
          />
        </FormGroup>
      </ModalBody>
      <ModalFooter>
        <Button
          key="confirm"
          variant={ButtonVariant.danger}
          onClick={onConfirm}
          isDisabled={confirmDeleteName !== apiKeyName}
        >
          {t('Delete')}
        </Button>
        <Button key="cancel" variant={ButtonVariant.link} onClick={onCancel}>
          {t('Cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default APIKeyDeleteModal;
