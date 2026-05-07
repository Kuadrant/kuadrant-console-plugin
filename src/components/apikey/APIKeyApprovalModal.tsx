import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  ModalVariant,
  Button,
  Form,
  FormGroup,
  TextInput,
  TextArea,
  ActionGroup,
  Alert,
} from '@patternfly/react-core';
import { k8sCreate } from '@openshift-console/dynamic-plugin-sdk';
import { RESOURCES } from '../../utils/resources';
import { APIKeyRequest } from './types';

interface APIKeyApprovalModalProps {
  request: APIKeyRequest;
  isOpen: boolean;
  onClose: () => void;
}

const APIKeyApprovalModal: React.FC<APIKeyApprovalModalProps> = ({ request, isOpen, onClose }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState({
    reason: '',
    message: '',
  });

  const handleAction = async (approved: boolean) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const approval = {
        apiVersion: `${RESOURCES.APIKeyApproval.gvk.group}/${RESOURCES.APIKeyApproval.gvk.version}`,
        kind: RESOURCES.APIKeyApproval.gvk.kind,
        metadata: {
          generateName: `${request.metadata!.name}-approval-`,
          namespace: request.metadata!.namespace,
        },
        spec: {
          apiKeyRequestRef: {
            name: request.metadata!.name,
          },
          approved,
          reviewedBy: 'current-user', // Mock
          reviewedAt: new Date().toISOString(),
          reason: formData.reason,
          message: formData.message,
        },
      };
      await k8sCreate({ model: RESOURCES.APIKeyApproval.gvk as any, data: approval });
      onClose();
    } catch (err: any) {
      setError(err.message || t('An error occurred'));
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      variant={ModalVariant.small}
      title={t('Review Access Request')}
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button
          key="approve"
          variant="primary"
          onClick={() => handleAction(true)}
          isLoading={isSubmitting}
        >
          {t('Approve')}
        </Button>,
        <Button
          key="reject"
          variant="danger"
          onClick={() => handleAction(false)}
          isLoading={isSubmitting}
        >
          {t('Reject')}
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose}>
          {t('Cancel')}
        </Button>,
      ]}
    >
      <Form>
        {error && <Alert variant="danger" isInline title={error} />}
        <FormGroup label={t('Reason')} fieldId="reason">
          <TextInput
            id="reason"
            value={formData.reason}
            onChange={(_evt, value) => setFormData({ ...formData, reason: value })}
            placeholder={t('e.g., Valid use case')}
          />
        </FormGroup>
        <FormGroup label={t('Message')} fieldId="message">
          <TextArea
            id="message"
            value={formData.message}
            onChange={(_evt, value) => setFormData({ ...formData, message: value })}
            placeholder={t('Optional message to the requester')}
          />
        </FormGroup>
      </Form>
    </Modal>
  );
};

export default APIKeyApprovalModal;
