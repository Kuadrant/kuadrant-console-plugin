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
} from '@patternfly/react-core';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core/next';
import { k8sDelete, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import getModelFromResource from '../utils/getModelFromResource'; // Assume you have a utility for getting the model from the resource
type DropdownWithKebabProps = {
  obj: K8sResourceCommon;
};
import { useHistory } from 'react-router-dom';

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

  let policyType = obj.kind.toLowerCase();

  const onEditClick = () => {
    history.push({
      pathname: `/k8s/ns/${obj.metadata.namespace}/${policyType}/name/${obj.metadata.name}/edit`,
    })
  }
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
          <DropdownItem value="edit" key="edit" onClick={onEditClick}>
            Edit
          </DropdownItem>
          <DropdownItem value="delete" key="delete">
            Delete
          </DropdownItem>
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
