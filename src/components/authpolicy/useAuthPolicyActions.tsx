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

const useAuthPolicyActions = (obj: K8sResourceCommon): ExtensionHookResult<Action[]> => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const navigate = useNavigate();
  const gvk = obj ? getGroupVersionKindForResource(obj) : undefined;
  const [authPolicyModel] = useK8sModel(
    gvk
      ? { group: gvk.group, version: gvk.version, kind: gvk.kind }
      : { group: '', version: '', kind: '' },
  );
  const launchDeleteModal = useDeleteModal(obj);
  const launchLabelsModal = useLabelsModal(obj);
  const launchAnnotationsModal = useAnnotationsModal(obj);

  const actions = React.useMemo<Action[]>(() => {
    if (!obj || obj.kind !== 'AuthPolicy') return [];
    const namespace = obj.metadata?.namespace || 'default';
    const name = obj.metadata?.name || '';

    const updateAccess: AccessReviewResourceAttributes | undefined = authPolicyModel
      ? {
          group: authPolicyModel.apiGroup,
          resource: authPolicyModel.plural,
          verb: 'update',
          name,
          namespace,
        }
      : undefined;
    const deleteAccess: AccessReviewResourceAttributes | undefined = authPolicyModel
      ? {
          group: authPolicyModel.apiGroup,
          resource: authPolicyModel.plural,
          verb: 'delete',
          name,
          namespace,
        }
      : undefined;

    return [
      {
        id: 'edit-labels-authpolicy',
        label: t('Edit labels'),
        cta: launchLabelsModal,
        accessReview: updateAccess,
      },
      {
        id: 'edit-annotations-authpolicy',
        label: t('Edit annotations'),
        cta: launchAnnotationsModal,
        accessReview: updateAccess,
      },
      {
        id: 'kuadrant-auth-policy-edit-form',
        label: t('Edit'),
        description: t('Edit via form'),
        cta: () =>
          navigate({
            pathname: `/k8s/ns/${namespace}/authpolicy/name/${name}/edit`,
          }),
        insertBefore: 'edit-yaml',
        accessReview: updateAccess,
      },
      {
        id: 'delete-authpolicy',
        label: t('Delete'),
        cta: launchDeleteModal,
        accessReview: deleteAccess,
      },
    ];
  }, [
    navigate,
    obj,
    authPolicyModel,
    launchAnnotationsModal,
    launchDeleteModal,
    launchLabelsModal,
    t,
  ]);

  return [actions, true, undefined];
};

export default useAuthPolicyActions;
