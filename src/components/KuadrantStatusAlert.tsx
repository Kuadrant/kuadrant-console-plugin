import {K8sGroupVersionKind, K8sResourceCommon, useK8sWatchResource} from '@openshift-console/dynamic-plugin-sdk';
import { Alert } from '@patternfly/react-core';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

interface KuadrantResource extends K8sResourceCommon {
    status: {
      conditions: {
        type: string;
        message: string;
        reason: string;
        status?: string;
      };
    };
}

export const KuadrantStatusAlert: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const kuadrantGVK: K8sGroupVersionKind = { group: 'kuadrant.io', version: 'v1beta1', kind: 'Kuadrant'};
  
  const [kuadrantResource, loaded, err] = useK8sWatchResource<KuadrantResource>({
    groupVersionKind: kuadrantGVK,
    isList: false,
  });

  if (!err) {
    if(loaded) {
      const reason = kuadrantResource?.status?.conditions?.[0]?.reason;

      let variant: 'success' | 'warning';
      let ouiaId: 'WarningAlert' | 'SuccessAlert';
      
      if (reason === 'MissingDependency') {
        ouiaId = "WarningAlert";
        variant = 'warning';
      } else if (reason === 'Ready') {
        ouiaId = "SuccessAlert"; 
        variant = 'success';
      }
      
      return (
        <Alert title={t('Kuadrant Status')} variant={variant} ouiaId={ouiaId}>
          <div>{kuadrantResource?.status?.conditions?.[0]?.message}</div>
          <div>{kuadrantResource?.status?.conditions?.[0]?.reason}</div>
        </Alert>
      )
    }
    else {
      return <div>{t('Kuadrant Status Loading...')}</div>
    }
  }
  else {
    return (
      <Alert title={t('Kuadrant Status')} variant="warning">
        <div>{t(err.toString())}</div>
      </Alert>
    )
  }

};