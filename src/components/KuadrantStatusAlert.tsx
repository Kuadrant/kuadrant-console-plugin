import {
  K8sGroupVersionKind,
  K8sResourceCommon,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { Icon } from '@patternfly/react-core';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircleIcon, ExclamationTriangleIcon } from '@patternfly/react-icons';
import { resourceGVKMapping } from '../utils/resources';
import { Tooltip } from '@patternfly/react-core';
import { InfoCircleIcon, ExclamationCircleIcon } from '@patternfly/react-icons';

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

export const KuadrantStatusAlert: React.FC = React.memo(() => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const kuadrantGVK: K8sGroupVersionKind = resourceGVKMapping.Kuadrant;

  const [kuadrantList, listLoaded, listErr] = useK8sWatchResource<KuadrantResource[]>({
    groupVersionKind: kuadrantGVK,
    isList: true,
  });

  const kuadrantItem = listLoaded && !listErr && kuadrantList?.length > 0 ? kuadrantList[0] : null;

  const [kuadrantResource, loaded, err] = useK8sWatchResource<KuadrantResource>(
    kuadrantItem
      ? {
          groupVersionKind: kuadrantGVK,
          name: kuadrantItem.metadata.name,
          namespace: kuadrantItem.metadata.namespace,
        }
      : { groupVersionKind: kuadrantGVK },
  );

  if (!listLoaded || listErr || !kuadrantItem) {
    return null;
  }

  const conditions = kuadrantResource?.status?.conditions ?? [];
  const missingDependency = conditions.filter((c) => c.reason === 'MissingDependency');
  const success = conditions.filter((c) => c.reason === 'Ready');

  if (err) {
    return (
      <div style={{ display: 'flex' }}>
        <Tooltip position="top" content={t(err.toString())}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Icon status="danger">
              <ExclamationCircleIcon />
            </Icon>
            <div>{t('Kuadrant Status')}</div>
          </div>
        </Tooltip>
      </div>
    );
  }

  if (!loaded) {
    return <div>{t('Kuadrant Status Loading...')}</div>;
  }

  if (conditions.length === 0) {
    return (
      <div style={{ display: 'flex' }}>
        <Tooltip position="top" content={t('Checking Kuadrant Status...')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Icon status="info">
              <InfoCircleIcon />
            </Icon>
            <div>{t('Kuadrant Status')}</div>
          </div>
        </Tooltip>
      </div>
    );
  }

  if (missingDependency.length > 0) {
    return (
      <div style={{ display: 'flex' }}>
        <Tooltip
          position="top"
          content={
            <div>
              <div>{t(missingDependency[0].message)}</div>
              <div>
                {t('Reason: ')} {missingDependency[0].reason}
              </div>
              <div>
                {t('Status: ')}
                <Icon status="warning">
                  <ExclamationTriangleIcon />
                </Icon>
              </div>
            </div>
          }
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Icon status="warning">
              <ExclamationTriangleIcon />
            </Icon>
            <div>{t('Kuadrant Status')}</div>
          </div>
        </Tooltip>
      </div>
    );
  }

  if (success.length > 0) {
    return (
      <div style={{ display: 'flex' }}>
        <Tooltip
          position="top"
          content={
            <div>
              <div>{t(success[0].message)}</div>
              <div>
                {t('Reason: ')} {success[0].reason}
              </div>
              <div>
                {t('Status: ')}
                <Icon status="success">
                  <CheckCircleIcon />
                </Icon>
              </div>
            </div>
          }
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Icon status="success">
              <CheckCircleIcon />
            </Icon>
            <div>{t('Kuadrant Status')}</div>
          </div>
        </Tooltip>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex' }}>
      <Tooltip position="top" content={t('Kuadrant status unavailable.')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Icon status="warning">
            <ExclamationTriangleIcon />
          </Icon>
          <div>{t('Kuadrant status unavailable.')}</div>
        </div>
      </Tooltip>
    </div>
  );
});

KuadrantStatusAlert.displayName = 'KuadrantStatusAlert';
