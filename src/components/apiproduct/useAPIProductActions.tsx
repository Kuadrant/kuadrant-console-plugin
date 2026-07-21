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
  useLabelsModal,
  useModal,
} from '@openshift-console/dynamic-plugin-sdk';
import APIProductDeleteModal from './APIProductDeleteModal';

const APIProductDeleteModalWrapper: React.FC<{
  closeModal: () => void;
  resource: K8sResourceCommon;
}> = ({ closeModal, resource }) => {
  const navigate = useNavigate();

  return (
    <APIProductDeleteModal
      isOpen={true}
      onClose={closeModal}
      onDeleteSuccess={() => {
        const namespace = resource.metadata?.namespace || 'default';
        closeModal();
        navigate(`/kuadrant/apiproducts/ns/${namespace}`);
      }}
      resource={resource}
    />
  );
};

const useAPIProductActions = (obj: K8sResourceCommon): ExtensionHookResult<Action[]> => {
  const navigate = useNavigate();
  const gvk = obj ? getGroupVersionKindForResource(obj) : undefined;
  const [apiProductModel] = useK8sModel(
    gvk
      ? { group: gvk.group, version: gvk.version, kind: gvk.kind }
      : { group: '', version: '', kind: '' },
  );
  const launchModal = useModal();
  const launchLabelsModal = useLabelsModal(obj);
  const launchAnnotationsModal = useAnnotationsModal(obj);

  const actions = React.useMemo<Action[]>(() => {
    if (!obj || obj.kind !== 'APIProduct') return [];
    const namespace = obj.metadata?.namespace || 'default';
    const name = obj.metadata?.name || '';

    const updateAccess: AccessReviewResourceAttributes | undefined = apiProductModel
      ? {
          group: apiProductModel.apiGroup,
          resource: apiProductModel.plural,
          verb: 'update',
          name,
          namespace,
        }
      : undefined;
    const deleteAccess: AccessReviewResourceAttributes | undefined = apiProductModel
      ? {
          group: apiProductModel.apiGroup,
          resource: apiProductModel.plural,
          verb: 'delete',
          name,
          namespace,
        }
      : undefined;

    const actionsList: Action[] = [
      {
        id: 'edit-labels-apiproduct',
        label: 'Edit labels',
        cta: launchLabelsModal,
        accessReview: updateAccess,
      },
      {
        id: 'edit-annotations-apiproduct',
        label: 'Edit annotations',
        cta: launchAnnotationsModal,
        accessReview: updateAccess,
      },
      {
        id: 'kuadrant-apiproduct-edit-form',
        label: 'Edit APIProduct',
        description: 'Edit via form',
        cta: () =>
          navigate({
            pathname: `/kuadrant/apiproducts/ns/${namespace}/${name}/edit`,
          }),
        insertBefore: 'edit-yaml',
        accessReview: updateAccess,
      },
      {
        id: 'delete-apiproduct',
        label: 'Delete APIProduct',
        cta: () => launchModal(APIProductDeleteModalWrapper, { resource: obj }),
        accessReview: deleteAccess,
      },
    ];

    return actionsList;
  }, [navigate, obj, apiProductModel, launchAnnotationsModal, launchModal, launchLabelsModal]);

  return [actions, true, undefined];
};

export default useAPIProductActions;
