import * as React from 'react';
import { useHistory } from 'react-router-dom';
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

const useTLSPolicyActions = (obj: K8sResourceCommon): ExtensionHookResult<Action[]> => {
  const history = useHistory();
  const gvk = obj ? getGroupVersionKindForResource(obj) : undefined;
  const [tlsPolicyModel] = useK8sModel(
    gvk
      ? { group: gvk.group, version: gvk.version, kind: gvk.kind }
      : { group: '', version: '', kind: '' },
  );
  const launchDeleteModal = useDeleteModal(obj);
  const launchLabelsModal = useLabelsModal(obj);
  const launchAnnotationsModal = useAnnotationsModal(obj);

  const actions = React.useMemo<Action[]>(() => {
    if (!obj || obj.kind !== 'TLSPolicy') return [];
    const namespace = obj.metadata?.namespace || 'default';
    const name = obj.metadata?.name || '';

    const updateAccess: AccessReviewResourceAttributes | undefined = tlsPolicyModel
      ? {
          group: tlsPolicyModel.apiGroup,
          resource: tlsPolicyModel.plural,
          verb: 'update',
          name,
          namespace,
        }
      : undefined;
    const deleteAccess: AccessReviewResourceAttributes | undefined = tlsPolicyModel
      ? {
          group: tlsPolicyModel.apiGroup,
          resource: tlsPolicyModel.plural,
          verb: 'delete',
          name,
          namespace,
        }
      : undefined;

    const actionsList: Action[] = [
      {
        id: 'edit-labels-tlspolicy',
        label: 'Edit labels',
        cta: launchLabelsModal,
        accessReview: updateAccess,
      },
      {
        id: 'edit-annotations-tlspolicy',
        label: 'Edit annotations',
        cta: launchAnnotationsModal,
        accessReview: updateAccess,
      },
      {
        id: 'kuadrant-tls-policy-edit-form',
        label: 'Edit',
        description: 'Edit via form',
        cta: () =>
          history.push({
            pathname: `/k8s/ns/${namespace}/tlspolicy/name/${name}/edit`,
          }),
        insertBefore: 'edit-yaml',
        accessReview: updateAccess,
      },
      {
        id: 'delete-tlspolicy',
        label: 'Delete',
        cta: launchDeleteModal,
        accessReview: deleteAccess,
      },
    ];

    return actionsList;
  }, [history, obj, tlsPolicyModel, launchAnnotationsModal, launchDeleteModal, launchLabelsModal]);

  return [actions, true, undefined];
};

export default useTLSPolicyActions;
