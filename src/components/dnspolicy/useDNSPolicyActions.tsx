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

const useDNSPolicyActions = (obj: K8sResourceCommon): ExtensionHookResult<Action[]> => {
  const history = useHistory();
  const gvk = obj ? getGroupVersionKindForResource(obj) : undefined;
  const [dnsPolicyModel] = useK8sModel(
    gvk
      ? { group: gvk.group, version: gvk.version, kind: gvk.kind }
      : { group: '', version: '', kind: '' },
  );
  const launchDeleteModal = useDeleteModal(obj);
  const launchLabelsModal = useLabelsModal(obj);
  const launchAnnotationsModal = useAnnotationsModal(obj);

  const actions = React.useMemo<Action[]>(() => {
    if (!obj || obj.kind !== 'DNSPolicy') return [];
    const namespace = obj.metadata?.namespace || 'default';
    const name = obj.metadata?.name || '';

    const updateAccess: AccessReviewResourceAttributes | undefined = dnsPolicyModel
      ? {
          group: dnsPolicyModel.apiGroup,
          resource: dnsPolicyModel.plural,
          verb: 'update',
          name,
          namespace,
        }
      : undefined;
    const deleteAccess: AccessReviewResourceAttributes | undefined = dnsPolicyModel
      ? {
          group: dnsPolicyModel.apiGroup,
          resource: dnsPolicyModel.plural,
          verb: 'delete',
          name,
          namespace,
        }
      : undefined;

    const actionsList: Action[] = [
      {
        id: 'edit-labels-dnspolicy',
        label: 'Edit labels',
        cta: launchLabelsModal,
        accessReview: updateAccess,
      },
      {
        id: 'edit-annotations-dnspolicy',
        label: 'Edit annotations',
        cta: launchAnnotationsModal,
        accessReview: updateAccess,
      },
      {
        id: 'kuadrant-dns-policy-edit-form',
        label: 'Edit',
        description: 'Edit via form',
        cta: () =>
          history.push({
            pathname: `/k8s/ns/${namespace}/dnspolicy/name/${name}/edit`,
          }),
        insertBefore: 'edit-yaml',
        accessReview: updateAccess,
      },
      {
        id: 'delete-dnspolicy',
        label: 'Delete',
        cta: launchDeleteModal,
        accessReview: deleteAccess,
      },
    ];

    return actionsList;
  }, [history, obj, dnsPolicyModel, launchAnnotationsModal, launchDeleteModal, launchLabelsModal]);

  return [actions, true, undefined];
};

export default useDNSPolicyActions;
