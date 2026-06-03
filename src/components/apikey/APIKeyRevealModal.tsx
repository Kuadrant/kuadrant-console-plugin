import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ClipboardCopy,
  Alert,
} from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import { k8sGet, useK8sModel } from '@openshift-console/dynamic-plugin-sdk';
import { APIKey, Secret } from '../../utils/resources';
import '../kuadrant.css';

interface APIKeyRevealModalProps {
  apiKeyObj: APIKey;
  onClose: () => void;
}

const APIKeyRevealModal: React.FC<APIKeyRevealModalProps> = ({ apiKeyObj, onClose }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [showRevealModal, setShowRevealModal] = React.useState(false);
  const [apiKey, setApiKey] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>('');

  const secretName = apiKeyObj.spec?.secretRef?.name || '';
  const namespace = apiKeyObj.metadata.namespace || '';

  // Get the Secret model from the cluster
  const [secretModel] = useK8sModel({ version: 'v1', kind: 'Secret' });

  const fetchSecret = React.useCallback(async () => {
    if (!secretModel) {
      setError(t('Secret model not available'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const secret = await k8sGet<Secret>({
        model: secretModel,
        name: secretName,
        ns: namespace,
      });

      // The API key is typically stored in the 'api_key' or 'key' field
      const encodedKey = secret.data?.api_key || secret.data?.key || '';
      if (encodedKey) {
        // Decode from base64
        const decodedKey = atob(encodedKey);
        setApiKey(decodedKey);
        setShowRevealModal(true);
      } else {
        setError(t('API key not found in secret'));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(t('Failed to fetch API key: {{error}}', { error: errorMessage }));
    } finally {
      setLoading(false);
    }
  }, [secretModel, secretName, namespace, t]);

  const handleWarningConfirm = () => {
    fetchSecret();
  };

  const handleWarningCancel = () => {
    onClose();
  };

  const handleRevealModalClose = () => {
    setShowRevealModal(false);
    onClose();
  };

  return (
    <>
      {/* Warning Modal - shown first */}
      {!showRevealModal && (
        <Modal
          isOpen={true}
          onClose={handleWarningCancel}
          variant={ModalVariant.small}
          appendTo={() => document.body}
        >
          <ModalHeader
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ExclamationTriangleIcon color="#F0AB00" />
                <span>{t('Reveal API Key')}</span>
              </div>
            }
          />
          <ModalBody>
            {t('You are about to reveal the API key. Make sure to copy and store it securely.')}
            {error && (
              <Alert variant="danger" isInline title={t('Error')} style={{ marginTop: '16px' }}>
                {error}
              </Alert>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              key="reveal"
              variant="primary"
              onClick={handleWarningConfirm}
              isLoading={loading}
              isDisabled={loading}
            >
              {t('Reveal')}
            </Button>
            <Button key="cancel" variant="link" onClick={handleWarningCancel} isDisabled={loading}>
              {t('Cancel')}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Reveal Modal - shown after fetching secret */}
      {showRevealModal && (
        <Modal
          isOpen={true}
          onClose={handleRevealModalClose}
          variant={ModalVariant.small}
          appendTo={() => document.body}
        >
          <ModalHeader
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ExclamationTriangleIcon color="#F0AB00" />
                <span>{t('Reveal API Key')}</span>
              </div>
            }
          />
          <ModalBody>
            <div style={{ marginBottom: '16px' }}>
              {t('The key will remain accessible for future viewing if needed.')}
            </div>
            <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>{t('API Key')}</div>
            <ClipboardCopy isReadOnly hoverTip={t('Copy')} clickTip={t('Copied')}>
              {apiKey}
            </ClipboardCopy>
          </ModalBody>
          <ModalFooter>
            <Button key="close" variant="primary" onClick={handleRevealModalClose}>
              {t('Close')}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
};

export default APIKeyRevealModal;
