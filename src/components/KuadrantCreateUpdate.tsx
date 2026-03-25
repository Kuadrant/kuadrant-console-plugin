import * as React from 'react';

import {
  k8sCreate,
  K8sModel,
  K8sResourceCommon,
  k8sUpdate,
} from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import { Button, AlertVariant, Alert, AlertGroup } from '@patternfly/react-core';
import { NavigateFunction } from 'react-router-dom-v5-compat';

interface GenericPolicyForm {
  model: K8sModel;
  resource: K8sResourceCommon;
  policyType: string;
  navigate: NavigateFunction;
  validation: boolean;
}

const KuadrantCreateUpdate: React.FC<GenericPolicyForm> = ({
  model,
  resource,
  policyType,
  navigate,
  validation,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [errorAlertMsg, setErrorAlertMsg] = React.useState('');
  const update = !!resource.metadata.creationTimestamp;

  const handleCreateUpdate = async () => {
    if (!validation) return; // Early return if form is not valid
    setErrorAlertMsg('');

    try {
      if (update) {
        const response = await k8sUpdate({
          model: model,
          data: resource,
        });
        console.log(`${policyType} updated successfully:`, response);
        navigate(`/kuadrant/all-namespaces/policies/${policyType}`);
      } else {
        const response = await k8sCreate({
          model: model,
          data: resource,
        });
        console.log(`${policyType} created successfully:`, response);
        navigate(`/kuadrant/all-namespaces/policies/${policyType}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An error occurred';

      if (update) {
        console.error(`Cannot update ${policyType}:`, error);
      } else {
        console.error(`Cannot create ${policyType}:`, error);
      }
      setErrorAlertMsg(message);
    }
  };
  return (
    <>
      {errorAlertMsg != '' && (
        <AlertGroup className="kuadrant-alert-group">
          <Alert
            title={
              update
                ? t('Error updating {{policyType}}', { policyType })
                : t('Error creating {{policyType}}', { policyType })
            }
            variant={AlertVariant.danger}
            isInline
          >
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
