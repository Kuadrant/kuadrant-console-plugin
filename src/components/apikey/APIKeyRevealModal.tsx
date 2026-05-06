import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Checkbox,
  ClipboardCopy,
  Alert,
} from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import { k8sGet, useK8sModel, k8sUpdate } from '@openshift-console/dynamic-plugin-sdk';
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
  const [confirmed, setConfirmed] = React.useState(false);
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

        // Update the Secret annotation to mark it as viewed
        try {
          // Add annotation to the secret
          const updatedSecret = {
            ...secret,
            metadata: {
              ...secret.metadata,
              annotations: {
                ...secret.metadata?.annotations,
                'devportal.kuadrant.io/apikey-viewed': 'true',
              },
            },
          };

          await k8sUpdate({
            model: secretModel,
            data: updatedSecret,
          });
        } catch (updateErr) {
          console.error('Failed to update apikey-viewed annotation:', updateErr);
          // Continue showing the key even if annotation update fails
        }

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
    if (confirmed) {
      setShowRevealModal(false);
      setConfirmed(false);
      onClose();
    }
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
            {t(
              'The API Key can only be viewed once. After you reveal it, you will not be able to retrieve it again.',
            )}
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
              {t('Make sure to copy and store it securely before closing this view.')}
            </div>
            <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>{t('API Key')}</div>
            <ClipboardCopy isReadOnly hoverTip={t('Copy')} clickTip={t('Copied')}>
              {apiKey}
            </ClipboardCopy>
            <div style={{ marginTop: '16px' }}>
              <Checkbox
                id="confirm-copied"
                label={t("I've copied the key and I'm aware that it's only shown once.")}
                isChecked={confirmed}
                onChange={(event, checked) => {
                  event.stopPropagation();
                  setConfirmed(checked);
                }}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              key="close"
              variant="primary"
              onClick={handleRevealModalClose}
              isDisabled={!confirmed}
            >
              {t('Close')}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
};

export default APIKeyRevealModal;
