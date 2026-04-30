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
} from '@patternfly/react-core';
import '../kuadrant.css';

interface RequestAPIKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RequestAPIKeyModal: React.FC<RequestAPIKeyModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  return (
    <Modal isOpen={isOpen} onClose={onClose} variant={ModalVariant.small}>
      <ModalHeader title={t('Request API Key')} />
      <ModalBody>
        <p>{t('API Key request functionality will be available soon.')}</p>
      </ModalBody>
      <ModalFooter>
        <Button key="ok" variant={ButtonVariant.primary} onClick={onClose}>
          {t('OK')}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default RequestAPIKeyModal;
