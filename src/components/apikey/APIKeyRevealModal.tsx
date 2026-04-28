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
} from '@patternfly/react-core';
import { EyeIcon, ExclamationTriangleIcon, EyeSlashIcon } from '@patternfly/react-icons';
import {
  K8sResourceCommon,
  k8sGet,
  useK8sModel,
  k8sPatch,
} from '@openshift-console/dynamic-plugin-sdk';
import { APIKey } from '../../utils/resources';
import '../kuadrant.css';

interface Secret extends K8sResourceCommon {
  data?: {
    [key: string]: string;
  };
}

interface APIKeyRevealModalProps {
  apiKeyObj: APIKey;
}

const APIKeyRevealModal: React.FC<APIKeyRevealModalProps> = ({ apiKeyObj }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [isWarningModalOpen, setIsWarningModalOpen] = React.useState(false);
  const [isRevealModalOpen, setIsRevealModalOpen] = React.useState(false);
  const [apiKey, setApiKey] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>('');
  const [confirmed, setConfirmed] = React.useState(false);
  const [alreadyViewed, setAlreadyViewed] = React.useState(false);

  const secretName = apiKeyObj.status?.secretRef?.name || '';
  const namespace = apiKeyObj.metadata.namespace || '';

  // Get the Secret model from the cluster
  const [secretModel] = useK8sModel({ version: 'v1', kind: 'Secret' });

  // Check if secret has been viewed on mount
  React.useEffect(() => {
    const checkViewed = async () => {
      if (!secretModel || !secretName || !namespace) return;

      try {
        const secret = await k8sGet<Secret>({
          model: secretModel,
          name: secretName,
          ns: namespace,
        });

        const viewed =
          secret.metadata?.annotations?.['devportal.kuadrant.io/apikey-viewed'] === 'true';
        setAlreadyViewed(viewed);
      } catch (err) {
        console.error('Error checking secret viewed status:', err);
      }
    };

    checkViewed();
  }, [secretModel, secretName, namespace]);

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
          await k8sPatch({
            model: secretModel,
            resource: secret,
            data: [
              {
                op: 'add',
                path: '/metadata/annotations/devportal.kuadrant.io~1apikey-viewed',
                value: 'true',
              },
            ],
          });
          setAlreadyViewed(true);
        } catch (patchErr) {
          console.error('Failed to update apikey-viewed annotation:', patchErr);
          // Continue showing the key even if annotation update fails
        }

        setIsWarningModalOpen(false);
        setIsRevealModalOpen(true);
      } else {
        setError(t('API key not found in secret'));
      }
    } catch (err) {
      setError(t('Failed to fetch API key'));
      console.error('Error fetching secret:', err);
    } finally {
      setLoading(false);
    }
  }, [secretModel, secretName, namespace, t]);

  const handleRevealClick = () => {
    setIsWarningModalOpen(true);
  };

  const handleWarningConfirm = () => {
    fetchSecret();
  };

  const handleWarningCancel = () => {
    setIsWarningModalOpen(false);
  };

  const handleRevealModalClose = () => {
    if (confirmed) {
      setIsRevealModalOpen(false);
      setConfirmed(false);
    }
  };

  const renderTrigger = () => {
    if (error) {
      return <span style={{ color: 'var(--pf-v6-global--danger-color--100)' }}>{error}</span>;
    }

    if (alreadyViewed && !isRevealModalOpen) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--pf-v6-global--disabled-color--100)',
          }}
        >
          <EyeSlashIcon />
          <span>{t('Already viewed')}</span>
        </div>
      );
    }

    return (
      <div
        onClick={handleRevealClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleRevealClick();
          }
        }}
        aria-label={t('Reveal API key')}
      >
        <span style={{ fontFamily: 'monospace' }}>••••••••••••••••</span>
        <EyeIcon style={{ color: 'var(--pf-v6-global--primary-color--100)' }} />
      </div>
    );
  };

  return (
    <>
      {renderTrigger()}

      {/* Warning Modal */}
      <Modal isOpen={isWarningModalOpen} onClose={handleWarningCancel} variant={ModalVariant.small}>
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

      {/* Reveal Modal */}
      <Modal
        isOpen={isRevealModalOpen}
        onClose={handleRevealModalClose}
        variant={ModalVariant.small}
        disableFocusTrap={false}
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
          <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>{t('API key')}</div>
          <ClipboardCopy isReadOnly hoverTip={t('Copy')} clickTip={t('Copied')}>
            {apiKey}
          </ClipboardCopy>
          <div style={{ marginTop: '16px' }}>
            <Checkbox
              id="confirm-copied"
              label={t("I've copied the key and I'm aware that it's only shown once.")}
              isChecked={confirmed}
              onChange={(_event, checked) => setConfirmed(checked)}
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
    </>
  );
};

export default APIKeyRevealModal;
