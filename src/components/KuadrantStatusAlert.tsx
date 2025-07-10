import {
  K8sGroupVersionKind,
  K8sResourceCommon,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { Alert } from '@patternfly/react-core';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
interface KuadrantResource extends K8sResourceCommon {
  status?: {
    conditions?: {
      message: string;
      reason: string;
      status?: string;
      type?: string;
    }[];
  };
}

export const KuadrantStatusAlert: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const kuadrantGVK: K8sGroupVersionKind = {
    group: 'kuadrant.io',
    version: 'v1beta1',
    kind: 'Kuadrant',
  };

  const [kuadrantResource, loaded, err] = useK8sWatchResource<KuadrantResource>({
    groupVersionKind: kuadrantGVK,
  });

  if (!err) {
    if (!loaded) {
      return <div>{t('Kuadrant Status Loading...')}</div>;
    } else {
      const reason = kuadrantResource?.status?.conditions?.[0]?.reason;

      if (reason === 'MissingDependency') {
        return (
          <Alert title={t('Kuadrant Status')} variant="warning" ouiaId="WarningAlert">
            <div>{kuadrantResource?.status?.conditions?.[0]?.message}</div>
          </Alert>
        );
      } else {
        return (
          <Alert title={t('Kuadrant Status')} variant="success" ouiaId="SuccessAlert">
            <div>{kuadrantResource?.status?.conditions?.[0]?.message}</div>
          </Alert>
        );
      }
    }
  } else {
    return (
      <Alert title={t('Kuadrant Status')} variant="danger">
        <div>{t(err.toString())}</div>
      </Alert>
    );
  }
};
