import * as React from 'react';
import {
  Button,
  ButtonVariant,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Form,
  FormGroup,
  Alert,
} from '@patternfly/react-core';
import { k8sUpdate } from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import { getModelFromResource } from '../../utils/getModelFromResource';
import { APIProduct } from './types';
import TagsMultiSelect from './TagsMultiSelect';

interface TagsEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  resource: APIProduct;
  onUpdate?: () => void;
}

const TagsEditModal: React.FC<TagsEditModalProps> = ({ isOpen, onClose, resource, onUpdate }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [tags, setTags] = React.useState<string[]>(resource.spec.tags || []);
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (isOpen) {
      setTags(resource.spec.tags || []);
      setError('');
    }
  }, [isOpen, resource]);

  const handleUpdate = async () => {
    setIsUpdating(true);
    setError('');

    try {
      const model = getModelFromResource(resource);
      const updatedResource: APIProduct = {
        ...resource,
        spec: {
          ...resource.spec,
          tags: tags.length > 0 ? tags : undefined,
        },
      };

      await k8sUpdate({
        model,
        data: updatedResource,
      });

      onUpdate?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to update tags'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isUpdating) {
      handleUpdate();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      variant="small"
      aria-labelledby="edit-tags-modal-title"
    >
      <ModalHeader title={t('Edit Tags')} />
      <ModalBody>
        {error && (
          <Alert variant="danger" isInline title={t('Error updating tags')}>
            {error}
          </Alert>
        )}
        <Form onSubmit={handleFormSubmit}>
          <FormGroup label={t('Tags')} fieldId="tags">
            <TagsMultiSelect selectedTags={tags} onChange={setTags} />
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          key="update"
          variant={ButtonVariant.primary}
          onClick={handleUpdate}
          isDisabled={isUpdating}
          isLoading={isUpdating}
        >
          {t('Save')}
        </Button>
        <Button key="cancel" variant={ButtonVariant.link} onClick={handleClose}>
          {t('Cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default TagsEditModal;
