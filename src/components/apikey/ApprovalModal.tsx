import * as React from 'react';
import {
  Button,
  ButtonVariant,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Alert,
} from '@patternfly/react-core';
import { Table, Thead, Tr, Th, Tbody, Td } from '@patternfly/react-table';
import { useTranslation } from 'react-i18next';
import { APIKeyRequest } from './types';
import { TrashIcon } from '@patternfly/react-icons';
import './ApprovalModal.css';

interface ApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  requests: APIKeyRequest[];
  onApprove: (requests: APIKeyRequest[]) => Promise<void>;
}

const ApprovalModal: React.FC<ApprovalModalProps> = ({
  isOpen,
  onClose,
  requests: initialRequests,
  onApprove,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [requests, setRequests] = React.useState(initialRequests);
  const [isApproving, setIsApproving] = React.useState(false);
  const [error, setError] = React.useState('');

  // Sync state when prop changes
  React.useEffect(() => {
    setRequests(initialRequests);
  }, [initialRequests]);

  const isBulk = requests.length > 1;
  const title =
    requests.length === 1
      ? t('Approve API Key')
      : t('Approve {{count}} API keys', { count: requests.length });

  const handleRemove = (requestName: string) => {
    const updated = requests.filter((r) => r.metadata?.name !== requestName);
    setRequests(updated);

    // Auto-close modal if last item removed
    if (updated.length === 0) {
      onClose();
    }
  };

  const handleApprove = async () => {
    setIsApproving(true);
    setError('');

    try {
      await onApprove(requests);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve API keys');
    } finally {
      setIsApproving(false);
    }
  };

  const handleClose = () => {
    setError('');
    setRequests(initialRequests);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      variant="medium"
      aria-labelledby="approval-modal-title"
    >
      <ModalHeader title={title} />
      <ModalBody>
        {error && (
          <Alert variant="danger" isInline title={t('Error approving API keys')}>
            {error}
          </Alert>
        )}

        {isBulk ? (
          <div className="kuadrant-approval-modal__table-container">
            <Table variant="compact">
              <Thead className="kuadrant-approval-modal__sticky-header">
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
          <div>
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

        <p className="kuadrant-approval-modal__confirmation-text">
          {t('Are you sure you want to approve {{count}} API key request(s)?', {
            count: requests.length,
          })}
        </p>
      </ModalBody>
      <ModalFooter>
        <Button
          variant={ButtonVariant.primary}
          onClick={handleApprove}
          isDisabled={isApproving || requests.length === 0}
          isLoading={isApproving}
        >
          {t('Approve')}
        </Button>
        <Button variant={ButtonVariant.link} onClick={handleClose}>
          {t('Cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default ApprovalModal;
