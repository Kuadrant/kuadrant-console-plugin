import * as React from 'react';

import {
  k8sCreate,
  K8sModel,
  K8sResourceCommon,
  k8sUpdate,
} from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import { Button, AlertVariant, Alert, AlertGroup } from '@patternfly/react-core';
import { History } from 'history';

interface GenericPolicyForm {
  model: K8sModel;
  resource: K8sResourceCommon;
  policyType: string;
  history: History;
  validation: boolean;
}

const KuadrantCreateUpdate: React.FC<GenericPolicyForm> = ({
  model,
  resource,
  policyType,
  history,
  validation,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [errorAlertMsg, setErrorAlertMsg] = React.useState('');
  const update = !!resource.metadata.creationTimestamp;

  const handleCreateUpdate = async () => {
    if (!validation) return; // Early return if form is not valid
    setErrorAlertMsg('');

    try {
      if (update == true) {
        const response = await k8sUpdate({
          model: model,
          data: resource,
        });
        console.log(`${policyType} updated successfully:`, response);
        history.push(`/kuadrant/all-namespaces/policies/${policyType}`);
      } else {
        const response = await k8sCreate({
          model: model,
          data: resource,
        });
        console.log(`${policyType} created successfully:`, response);
        history.push(`/kuadrant/all-namespaces/policies/${policyType}`);
      }
    } catch (error) {
      if (update == true) {
        console.error(t(`Cannot update ${policyType}`, error));
        setErrorAlertMsg(error.message);
      }
      {
        console.error(t(`Cannot create ${policyType}`, error));
        setErrorAlertMsg(error.message);
      }
    }
  };
  return (
    <>
      {errorAlertMsg != '' && (
        <AlertGroup className="kuadrant-alert-group">
          <Alert title={t(`Error creating ${policyType}`)} variant={AlertVariant.danger} isInline>
            {errorAlertMsg}
          </Alert>
        </AlertGroup>
      )}
      <Button onClick={handleCreateUpdate} isDisabled={!validation}>
        {update ? t(`Save`) : t(`Create`)}
      </Button>
    </>
  );
};
export default KuadrantCreateUpdate;
