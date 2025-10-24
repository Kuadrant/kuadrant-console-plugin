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

const KuadrantTokenRateLimitPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [selectedNamespace] = useActiveNamespace();
  const [isErrorModalOpen, setIsErrorModalOpen] = React.useState(false);
  const [errorModalMsg] = React.useState('');

  const tokenRateLimitPolicy = {
    apiVersion:
      resourceGVKMapping['TokenRateLimitPolicy'].group +
      '/' +
      resourceGVKMapping['TokenRateLimitPolicy'].version,
    kind: resourceGVKMapping['TokenRateLimitPolicy'].kind,
    metadata: {
      name: 'basic-token-limit',
      namespace: selectedNamespace,
    },
    spec: {
      targetRef: {
        group: 'gateway.networking.k8s.io',
        kind: 'Gateway',
        name: 'ai-gateway',
      },
      limits: {
        global: {
          rates: [
            {
              limit: 100000,
              window: '1h',
            },
          ],
        },
      },
    },
  };

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Create TokenRateLimit Policy')}</title>
      </Helmet>

      <ResourceYAMLEditor
        initialResource={tokenRateLimitPolicy}
        header="Create TokenRateLimit Policy"
        create
      />
      <Modal
        isOpen={isErrorModalOpen}
        onClose={() => setIsErrorModalOpen(false)}
        variant={ModalVariant.medium}
        title={t('Error creating Token Rate Limit Policy')}
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

export default KuadrantTokenRateLimitPolicyCreatePage;
