import * as React from 'react';
import { useNavigate } from 'react-router-dom-v5-compat';
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

const usePlanPolicyActions = (obj: K8sResourceCommon): ExtensionHookResult<Action[]> => {
  const navigate = useNavigate();
  const gvk = obj ? getGroupVersionKindForResource(obj) : undefined;
  const [planPolicyModel] = useK8sModel(
    gvk
      ? { group: gvk.group, version: gvk.version, kind: gvk.kind }
      : { group: '', version: '', kind: '' },
  );
  const launchDeleteModal = useDeleteModal(obj);
  const launchLabelsModal = useLabelsModal(obj);
  const launchAnnotationsModal = useAnnotationsModal(obj);

  const actions = React.useMemo<Action[]>(() => {
    if (!obj || obj.kind !== 'PlanPolicy') return [];
    const namespace = obj.metadata?.namespace || 'default';
    const name = obj.metadata?.name || '';

    const updateAccess: AccessReviewResourceAttributes | undefined = planPolicyModel
      ? {
          group: planPolicyModel.apiGroup,
          resource: planPolicyModel.plural,
          verb: 'update',
          name,
          namespace,
        }
      : undefined;
    const deleteAccess: AccessReviewResourceAttributes | undefined = planPolicyModel
      ? {
          group: planPolicyModel.apiGroup,
          resource: planPolicyModel.plural,
          verb: 'delete',
          name,
          namespace,
        }
      : undefined;

    const actionsList: Action[] = [
      {
        id: 'edit-labels-planpolicy',
        label: 'Edit labels',
        cta: launchLabelsModal,
        accessReview: updateAccess,
      },
      {
        id: 'edit-annotations-planpolicy',
        label: 'Edit annotations',
        cta: launchAnnotationsModal,
        accessReview: updateAccess,
      },
      {
        id: 'kuadrant-plan-policy-edit-form',
        label: 'Edit',
        description: 'Edit via form',
        cta: () =>
          navigate({
            pathname: `/k8s/ns/${namespace}/planpolicy/name/${name}/edit`,
          }),
        insertBefore: 'edit-yaml',
        accessReview: updateAccess,
      },
      {
        id: 'delete-planpolicy',
        label: 'Delete',
        cta: launchDeleteModal,
        accessReview: deleteAccess,
      },
    ];

    return actionsList;
  }, [
    navigate,
    obj,
    planPolicyModel,
    launchAnnotationsModal,
    launchDeleteModal,
    launchLabelsModal,
  ]);

  return [actions, true, undefined];
};

export default usePlanPolicyActions;
