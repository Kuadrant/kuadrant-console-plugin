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
import { resourceGVKMapping } from '../utils/resources';

const KuadrantPlanPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [selectedNamespace] = useActiveNamespace();
  const [isErrorModalOpen, setIsErrorModalOpen] = React.useState(false);
  const [errorModalMsg] = React.useState('');

  const planPolicy = {
    apiVersion:
      resourceGVKMapping['PlanPolicy'].group + '/' + resourceGVKMapping['PlanPolicy'].version,
    kind: resourceGVKMapping['PlanPolicy'].kind,
    metadata: {
      name: 'example-plan-policy',
      namespace: selectedNamespace,
    },
    spec: {
      targetRef: {
        group: 'gateway.networking.k8s.io',
        kind: 'Gateway',
        name: 'my-gateway',
      },
      plans: [
        {
          tier: 'free',
          predicate: 'auth.identity.tier == "free"',
          limits: {
            daily: 1000,
          },
        },
      ],
    },
  };

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Create Plan Policy')}</title>
      </Helmet>

      <ResourceYAMLEditor initialResource={planPolicy} header="Create Plan Policy" create />
      <Modal
        isOpen={isErrorModalOpen}
        onClose={() => setIsErrorModalOpen(false)}
        variant={ModalVariant.medium}
        title={t('Error creating Plan Policy')}
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

export default KuadrantPlanPolicyCreatePage;
