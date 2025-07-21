import * as React from 'react';
import { EllipsisVIcon } from '@patternfly/react-icons';
import {
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
  Button,
  ButtonVariant,
  Tooltip,
  Modal /* data-codemods */,
  ModalBody /* data-codemods */,
  ModalFooter /* data-codemods */,
  ModalHeader /* data-codemods */,
} from '@patternfly/react-core';

import { k8sDelete, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import { useHistory } from 'react-router-dom';
import resourceGVKMapping from '../utils/latest';
import useAccessReviews from '../utils/resourceRBAC';
import { getModelFromResource } from '../utils/getModelFromResource';
type DropdownWithKebabProps = {
  obj: K8sResourceCommon;
};

const DropdownWithKebab: React.FC<DropdownWithKebabProps> = ({ obj }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const history = useHistory();
  const model = getModelFromResource(obj);

  const onToggleClick = () => {
    setIsOpen(!isOpen);
  };

  const onDeleteConfirm = async () => {
    try {
      await k8sDelete({ model, resource: obj });
      console.log('Successfully deleted', obj.metadata.name);
    } catch (error) {
      console.error('Failed to delete', obj.metadata.name, error);
    } finally {
      setIsDeleteModalOpen(false);
    }
  };

  const policyType = obj.kind.toLowerCase();

  const resourceGVK: { group: string; kind: string }[] = [
    { group: resourceGVKMapping[obj.kind].group, kind: obj.kind },
  ];
  const { userRBAC } = useAccessReviews(resourceGVK);
  const resourceRBAC = [
    'TLSPolicy',
    'DNSPolicy',
    'RateLimitPolicy',
    'AuthPolicy',
    'Gateway',
    'HTTPRoute',
  ].reduce(
    (acc, resource) => ({
      ...acc,
      [resource]: {
        delete: userRBAC[`${resource}-delete`],
        edit: userRBAC[`${resource}-update`],
      },
    }),
    {} as Record<string, { delete: boolean }>,
  );

  const onEditClick = () => {
    if (
      obj.kind === 'AuthPolicy' ||
      obj.kind === 'RateLimitPolicy' ||
      obj.kind === 'Gateway' ||
      obj.kind === 'HTTPRoute'
    ) {
      history.push({
        pathname: `/k8s/ns/${obj.metadata.namespace}/${obj.apiVersion.replace('/', '~')}~${
          obj.kind
        }/${obj.metadata.name}/yaml`,
      });
    } else {
      history.push({
        pathname: `/k8s/ns/${obj.metadata.namespace}/${policyType}/name/${obj.metadata.name}/edit`,
      });
    }
  };

  const onDeleteClick = () => {
    setIsDeleteModalOpen(true);
  };

  const onSelect = (
    _event: React.MouseEvent<Element, MouseEvent> | undefined,
    value: string | number | undefined,
  ) => {
    setIsOpen(false);
    if (value === 'delete') {
      onDeleteClick();
    }
  };

  return (
    <>
      <Dropdown
        isOpen={isOpen}
        onSelect={onSelect}
        onOpenChange={(isOpen: boolean) => setIsOpen(isOpen)}
        toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
          <MenuToggle
            ref={toggleRef}
            aria-label="kebab dropdown toggle"
            variant="plain"
            onClick={onToggleClick}
            isExpanded={isOpen}
          >
            <EllipsisVIcon />
          </MenuToggle>
        )}
        shouldFocusToggleOnSelect
      >
        <DropdownList>
          {resourceRBAC[obj.kind]['edit'] == true ? (
            <DropdownItem value="edit" key="edit" onClick={onEditClick}>
              Edit
            </DropdownItem>
          ) : (
            <Tooltip content={`You do not have permission to edit the ${obj.kind}`}>
              <DropdownItem
                value="edit"
                key="edit"
                onClick={onEditClick}
                isAriaDisabled={!resourceRBAC[obj.kind]['edit']}
              >
                Edit
              </DropdownItem>
            </Tooltip>
          )}
          {resourceRBAC[obj.kind]['delete'] == true ? (
            <DropdownItem value="delete" key="delete">
              Delete
            </DropdownItem>
          ) : (
            <Tooltip content={`You do not have permission to delete the ${obj.kind}`}>
              <DropdownItem
                value="delete"
                key="delete"
                isAriaDisabled={!resourceRBAC[obj.kind]['delete']}
              >
                Delete
              </DropdownItem>
            </Tooltip>
          )}
        </DropdownList>
      </Dropdown>
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        aria-labelledby="delete-modal-title"
        aria-describedby="delete-modal-body"
        variant="medium"
      >
        <ModalHeader title="Confirm Delete" />
        <ModalBody>
          Are you sure you want to delete the resource <b>{obj.metadata.name}</b>?
        </ModalBody>
        <ModalFooter>
          <Button key="confirm" variant={ButtonVariant.danger} onClick={onDeleteConfirm}>
            Delete
          </Button>
          <Button
            key="cancel"
            variant={ButtonVariant.link}
            onClick={() => setIsDeleteModalOpen(false)}
          >
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default DropdownWithKebab;
