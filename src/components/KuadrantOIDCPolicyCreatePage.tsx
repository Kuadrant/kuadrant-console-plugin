import * as React from 'react';
import Helmet from 'react-helmet';
import {
  Button,
  ButtonVariant,
  Modal,
  ModalVariant,
  ModalBody,
  ModalFooter,
} from '@patternfly/react-core';

import { useTranslation } from 'react-i18next';
import './kuadrant.css';
import { ResourceYAMLEditor, useActiveNamespace } from '@openshift-console/dynamic-plugin-sdk';
import resourceGVKMapping from '../utils/latest';

const KuadrantOIDCPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [selectedNamespace] = useActiveNamespace();
  const [isErrorModalOpen, setIsErrorModalOpen] = React.useState(false);
  const [errorModalMsg] = React.useState('');

  const oidcPolicy = {
    apiVersion:
      resourceGVKMapping['OIDCPolicy'].group + '/' + resourceGVKMapping['OIDCPolicy'].version,
    kind: resourceGVKMapping['OIDCPolicy'].kind,
    metadata: {
      name: 'example-oidc-policy',
      namespace: selectedNamespace,
    },
    spec: {
      targetRef: {
        group: 'gateway.networking.k8s.io',
        kind: 'Gateway',
        name: 'my-gateway',
      },
      provider: {
        clientID: 'my-client-id',
        issuerURL: 'https://auth.example.com',
      },
    },
  };

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Create OIDC Policy')}</title>
      </Helmet>

      <ResourceYAMLEditor initialResource={oidcPolicy} header="Create OIDC Policy" create />
      <Modal
        isOpen={isErrorModalOpen}
        onClose={() => setIsErrorModalOpen(false)}
        variant={ModalVariant.medium}
        title={t('Error creating OIDC Policy')}
      >
        <ModalBody>
          <b>{errorModalMsg}</b>
        </ModalBody>
        <ModalFooter>
          <Button key="ok" variant={ButtonVariant.link} onClick={() => setIsErrorModalOpen(false)}>
            OK
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default KuadrantOIDCPolicyCreatePage;
