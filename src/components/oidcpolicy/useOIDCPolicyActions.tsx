import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ExtensionHookResult } from '@openshift-console/dynamic-plugin-sdk/lib/api/common-types';
import { Action } from '@openshift-console/dynamic-plugin-sdk/lib/extensions/actions';
import {
  K8sResourceCommon,
  useK8sModel,
  getGroupVersionKindForResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { AccessReviewResourceAttributes } from '@openshift-console/dynamic-plugin-sdk/lib/extensions/console-types';
import {
  useAnnotationsModal,
  useDeleteModal,
  useLabelsModal,
} from '@openshift-console/dynamic-plugin-sdk';

const useOIDCPolicyActions = (obj: K8sResourceCommon): ExtensionHookResult<Action[]> => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const navigate = useNavigate();
  const gvk = obj ? getGroupVersionKindForResource(obj) : undefined;
  const [oidcPolicyModel] = useK8sModel(
    gvk
      ? { group: gvk.group, version: gvk.version, kind: gvk.kind }
      : { group: '', version: '', kind: '' },
  );
  const launchDeleteModal = useDeleteModal(obj);
  const launchLabelsModal = useLabelsModal(obj);
  const launchAnnotationsModal = useAnnotationsModal(obj);

  const actions = React.useMemo<Action[]>(() => {
    if (!obj || obj.kind !== 'OIDCPolicy') return [];
    const namespace = obj.metadata?.namespace || 'default';
    const name = obj.metadata?.name || '';

    const updateAccess: AccessReviewResourceAttributes | undefined = oidcPolicyModel
      ? {
          group: oidcPolicyModel.apiGroup,
          resource: oidcPolicyModel.plural,
          verb: 'update',
          name,
          namespace,
        }
      : undefined;
    const deleteAccess: AccessReviewResourceAttributes | undefined = oidcPolicyModel
      ? {
          group: oidcPolicyModel.apiGroup,
          resource: oidcPolicyModel.plural,
          verb: 'delete',
          name,
          namespace,
        }
      : undefined;

    const actionsList: Action[] = [
      {
        id: 'edit-labels-oidcpolicy',
        label: t('Edit labels'),
        cta: launchLabelsModal,
        accessReview: updateAccess,
      },
      {
        id: 'edit-annotations-oidcpolicy',
        label: t('Edit annotations'),
        cta: launchAnnotationsModal,
        accessReview: updateAccess,
      },
      {
        id: 'kuadrant-oidc-policy-edit-form',
        label: t('Edit'),
        description: t('Edit via form'),
        cta: () =>
          navigate({
            pathname: `/k8s/ns/${namespace}/oidcpolicy/name/${name}/edit`,
          }),
        insertBefore: 'edit-yaml',
        accessReview: updateAccess,
      },
      {
        id: 'delete-oidcpolicy',
        label: t('Delete'),
        cta: launchDeleteModal,
        accessReview: deleteAccess,
      },
    ];

    return actionsList;
  }, [
    navigate,
    obj,
    oidcPolicyModel,
    launchAnnotationsModal,
    launchDeleteModal,
    launchLabelsModal,
    t,
  ]);

  return [actions, true, undefined];
};

export default useOIDCPolicyActions;
