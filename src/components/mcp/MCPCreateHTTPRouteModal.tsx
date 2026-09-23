import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AlertGroup,
  AlertVariant,
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@patternfly/react-core';
import { k8sCreate, useK8sModel } from '@openshift-console/dynamic-plugin-sdk';
import HTTPRouteCreatePage from '../httproute/HTTPRouteCreatePage';
import { HTTPRouteResource } from '../httproute/types';
import { GatewayForSelect } from '../../utils/ParentReferencesSelect';
import { RESOURCES } from '../../utils/resources';

interface MCPCreateHTTPRouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Restricts the parent Gateway dropdown to MCP-enabled Gateways.
  gatewayFilter?: (gateway: GatewayForSelect) => boolean;
}

// Modal that embeds the shared HTTPRouteCreatePage so users can create an HTTPRoute
// directly from the MCP overview, with the parent Gateway options scoped to MCP
// gateways. Creation is driven here (the embedded form hides its own Create button).
const MCPCreateHTTPRouteModal: React.FC<MCPCreateHTTPRouteModalProps> = ({
  isOpen,
  onClose,
  gatewayFilter,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [httpRouteModel] = useK8sModel(RESOURCES.HTTPRoute.gvk);

  const [resource, setResource] = React.useState<HTTPRouteResource | null>(null);
  const [isValid, setIsValid] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  const handleClose = () => {
    setResource(null);
    setIsValid(false);
    setErrorMsg('');
    setIsSaving(false);
    onClose();
  };

  const handleCreate = async () => {
    if (!isValid || !resource || isSaving) return;
    setErrorMsg('');
    setIsSaving(true);
    try {
      await k8sCreate({ model: httpRouteModel, data: resource });
      handleClose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('An error occurred');
      console.error('Cannot create HTTPRoute:', error);
      setErrorMsg(message);
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      variant="large"
      aria-labelledby="mcp-create-httproute-modal-title"
    >
      <ModalHeader
        labelId="mcp-create-httproute-modal-title"
        title={t('Create HTTPRoute')}
        description={t('Create an HTTPRoute attached to an MCP gateway.')}
      />
      <ModalBody>
        {errorMsg !== '' && (
          <AlertGroup className="kuadrant-alert-group">
            <Alert
              title={t('Error creating {{policyType}}', { policyType: 'HTTPRoute' })}
              variant={AlertVariant.danger}
              isInline
            >
              {errorMsg}
            </Alert>
          </AlertGroup>
        )}
        <div className="kuadrant-mcp-embedded-form kuadrant-mcp-create-httproute-modal">
          <HTTPRouteCreatePage
            gatewayFilter={gatewayFilter}
            onFormChange={(built, valid) => {
              setResource(built);
              setIsValid(valid);
            }}
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button
          key="create"
          variant="primary"
          onClick={handleCreate}
          isDisabled={!isValid || isSaving}
          isLoading={isSaving}
          data-test="mcp-create-httproute-submit"
        >
          {t('Create')}
        </Button>
        <Button key="cancel" variant="link" onClick={handleClose}>
          {t('Cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default MCPCreateHTTPRouteModal;
