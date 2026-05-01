import * as React from 'react';
import {
  Button,
  ButtonVariant,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  FormGroup,
  TextArea,
  Alert,
} from '@patternfly/react-core';
import { Table, Thead, Tr, Th, Tbody, Td } from '@patternfly/react-table';
import { useTranslation } from 'react-i18next';
import { APIKeyRequest } from './types';
import { TrashIcon } from '@patternfly/react-icons';
import './RejectionModal.css';

interface RejectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  requests: APIKeyRequest[];
  onReject: (requests: APIKeyRequest[], reason?: string) => Promise<void>;
}

const RejectionModal: React.FC<RejectionModalProps> = ({
  isOpen,
  onClose,
  requests: initialRequests,
  onReject,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [requests, setRequests] = React.useState(initialRequests);
  const [reason, setReason] = React.useState('');
  const [isRejecting, setIsRejecting] = React.useState(false);
  const [error, setError] = React.useState('');

  // Sync state when prop changes
  React.useEffect(() => {
    setRequests(initialRequests);
  }, [initialRequests]);

  const isBulk = requests.length > 1;
  const title =
    requests.length === 1
      ? t('Reject API Key')
      : t('Reject {{count}} API keys', { count: requests.length });

  const handleRemove = (requestName: string) => {
    const updated = requests.filter((r) => r.metadata?.name !== requestName);
    setRequests(updated);

    // Auto-close modal if last item removed
    if (updated.length === 0) {
      onClose();
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    setError('');

    try {
      await onReject(requests, reason || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject API keys');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleClose = () => {
    setReason('');
    setError('');
    setRequests(initialRequests);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      variant="medium"
      aria-labelledby="rejection-modal-title"
    >
      <ModalHeader title={title} />
      <ModalBody>
        {error && (
          <Alert variant="danger" isInline title={t('Error rejecting API keys')}>
            {error}
          </Alert>
        )}

        {isBulk ? (
          <div className="kuadrant-rejection-modal__table-container">
            <Table variant="compact">
              <Thead className="kuadrant-rejection-modal__sticky-header">
                <Tr>
                  <Th>{t('Requester')}</Th>
                  <Th>{t('API Product')}</Th>
                  <Th>{t('Plan')}</Th>
                  <Th width={10}></Th>
                </Tr>
              </Thead>
              <Tbody>
                {requests.map((req) => (
                  <Tr key={req.metadata?.name || req.metadata?.uid}>
                    <Td dataLabel={t('Requester')}>{req.spec.requestedBy.email}</Td>
                    <Td dataLabel={t('API Product')}>{req.spec.apiProductRef.name}</Td>
                    <Td dataLabel={t('Plan')}>{req.spec.planTier}</Td>
                    <Td>
                      <Button
                        variant="plain"
                        onClick={() => handleRemove(req.metadata?.name || '')}
                        aria-label={t('Remove')}
                      >
                        <TrashIcon />
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        ) : (
          <div className="kuadrant-rejection-modal__single-details">
            <p>
              <strong>{t('Requester')}:</strong> {requests[0]?.spec.requestedBy.email}
            </p>
            <p>
              <strong>{t('API Product')}:</strong> {requests[0]?.spec.apiProductRef.name}
            </p>
            <p>
              <strong>{t('Plan')}:</strong> {requests[0]?.spec.planTier}
            </p>
            <p>
              <strong>{t('Use Case')}:</strong> {requests[0]?.spec.useCase}
            </p>
          </div>
        )}

        <FormGroup label={t('Rejection Reason (optional)')} fieldId="rejection-reason">
          <TextArea
            id="rejection-reason"
            value={reason}
            onChange={(_event, value) => setReason(value)}
            aria-label={t('Rejection reason')}
            rows={3}
            placeholder={t('Provide a reason for rejecting this request...')}
          />
        </FormGroup>

        {isBulk && (
          <p className="kuadrant-rejection-modal__bulk-note">
            {t('The rejection reason will apply to all selected requests.')}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <Button
          variant={ButtonVariant.danger}
          onClick={handleReject}
          isDisabled={isRejecting || requests.length === 0}
          isLoading={isRejecting}
        >
          {t('Reject')}
        </Button>
        <Button variant={ButtonVariant.link} onClick={handleClose}>
          {t('Cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default RejectionModal;
