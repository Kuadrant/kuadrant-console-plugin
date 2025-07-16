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
import { ResourceYAMLEditor, useActiveNamespace } from '@openshift-console/dynamic-plugin-sdk';
import resourceGVKMapping from '../utils/latest';

const KuadrantAuthPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [selectedNamespace] = useActiveNamespace();

  const yamlResource = {
    apiVersion:
      resourceGVKMapping['AuthPolicy'].group + '/' + resourceGVKMapping['AuthPolicy'].version,
    kind: resourceGVKMapping['AuthPolicy'].kind,
    metadata: {
      name: 'example-authpolicy',
      namespace: selectedNamespace,
    },
    spec: {
      rules: {
        authorization: {
          denyAll: {
            opa: {
              rego: 'allow = false',
            },
          },
        },
        response: {
          unauthorized: {
            body: {
              value: JSON.stringify(
                {
                  error: 'Forbidden',
                  message: 'Access denied by default. Create a specific auth policy for the route.',
                },
                null,
                2,
              ),
            },
            headers: {
              'content-type': {
                value: 'application/json',
              },
            },
          },
        },
      },
      targetRef: {
        group: 'gateway.networking.k8s.io',
        kind: 'Gateway',
        name: 'prod-web',
      },
    },
  };

  const [isErrorModalOpen, setIsErrorModalOpen] = React.useState(false);
  const [errorModalMsg] = React.useState('');

  return (
    <>
      <Helmet>
        <title>{t('Create AuthPolicy')}</title>
      </Helmet>

      <ResourceYAMLEditor initialResource={yamlResource} header="Create AuthPolicy" create={true} />

      <Modal
        isOpen={isErrorModalOpen}
        onClose={() => setIsErrorModalOpen(false)}
        variant={ModalVariant.medium}
        title={t('Error creating AuthPolicy')}
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

export default KuadrantAuthPolicyCreatePage;
