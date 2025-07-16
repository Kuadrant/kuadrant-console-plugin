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

const KuadrantRateLimitPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [selectedNamespace] = useActiveNamespace();
  const [isErrorModalOpen, setIsErrorModalOpen] = React.useState(false);
  const [errorModalMsg] = React.useState('');

  const rateLimitPolicy = {
    apiVersion:
      resourceGVKMapping['RateLimitPolicy'].group +
      '/' +
      resourceGVKMapping['RateLimitPolicy'].version,
    kind: resourceGVKMapping['RateLimitPolicy'].kind,
    metadata: {
      name: 'example-ratelimitpolicy',
      namespace: selectedNamespace,
    },
    spec: {
      targetRef: {
        group: 'gateway.networking.k8s.io',
        kind: 'Gateway',
        name: 'prod-web',
      },
      limits: {
        'toystore-api-per-username': {
          rates: [
            {
              limit: 100,
              window: '1s',
            },
            {
              limit: 1000,
              window: '1m',
            },
          ],
          counters: [{ expression: 'auth.identity.username' }],
        },
      },
    },
  };

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Create RateLimit Policy')}</title>
      </Helmet>

      <ResourceYAMLEditor
        initialResource={rateLimitPolicy}
        header="Create RateLimit Policy"
        create
      />
      <Modal
        isOpen={isErrorModalOpen}
        onClose={() => setIsErrorModalOpen(false)}
        variant={ModalVariant.medium}
        title={t('Error creating Rate Limit Policy')}
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

export default KuadrantRateLimitPolicyCreatePage;
