import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom-v5-compat';
import {
  PageSection,
  Title,
  Content,
  ContentVariants,
  Alert,
  Flex,
  FlexItem,
  Button,
  ButtonVariant,
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Tooltip,
} from '@patternfly/react-core';
import { ExternalLinkAltIcon } from '@patternfly/react-icons';
import {
  useK8sWatchResource,
  K8sResourceCommon,
  k8sDelete,
  Timestamp,
} from '@openshift-console/dynamic-plugin-sdk';
import { RESOURCES } from '../../utils/resources';
import { getModelFromResource, getResourceNameFromKind } from '../../utils/getModelFromResource';
import useAccessReviews from '../../utils/resourceRBAC';
import '../kuadrant.css';

interface APIKey extends K8sResourceCommon {
  spec?: {
    apiProductRef?: {
      name: string;
    };
    planTier?: string;
    requestedBy?: {
      userId: string;
    };
    useCase?: string;
  };
  status?: {
    phase?: 'Pending' | 'Approved' | 'Rejected';
    secretRef?: {
      name: string;
    };
  };
}

const APIKeyDetailPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const { ns, name } = useParams<{ ns: string; name: string }>();
  const navigate = useNavigate();

  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string>('');

  const [apiKey, loaded, loadError] = useK8sWatchResource<APIKey>({
    groupVersionKind: RESOURCES.APIKey.gvk,
    namespace: ns,
    name: name,
    isList: false,
  });

  // Cache the resource to handle watch reconnections
  const [cachedAPIKey, setCachedAPIKey] = React.useState<APIKey | null>(null);

  React.useEffect(() => {
    if (apiKey) {
      setCachedAPIKey(apiKey);
    }
  }, [apiKey]);

  const apiKeyToUse = apiKey || cachedAPIKey;

  // RBAC permission checks
  const resourceName = getResourceNameFromKind('APIKey');
  const resourceGVK: { group: string; kind: string; namespace?: string }[] = [
    {
      group: RESOURCES.APIKey.gvk.group,
      kind: resourceName,
      namespace: ns,
    },
  ];
  const { userRBAC, loading: rbacLoading } = useAccessReviews(resourceGVK);
  const canDelete = userRBAC[`${resourceName}-delete`];

  const handleDeleteClick = () => {
    setIsDeleteModalOpen(true);
    setDeleteError('');
  };

  const handleDeleteConfirm = async () => {
    if (!apiKeyToUse) return;

    try {
      const model = getModelFromResource(apiKeyToUse);
      await k8sDelete({ model, resource: apiKeyToUse });
      setIsDeleteModalOpen(false);
      // Navigate back to list page
      navigate(`/kuadrant/ns/${ns}/myapikeys`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setDeleteError(errorMessage);
      console.error('Failed to delete APIKey:', error);
    }
  };

  const handleDeleteCancel = () => {
    setIsDeleteModalOpen(false);
    setDeleteError('');
  };

  if (loadError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Alert variant="danger" isInline title={t('Error loading API Key')}>
          {loadError.message}
        </Alert>
      </PageSection>
    );
  }

  if (!loaded || !apiKeyToUse) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Content component={ContentVariants.p}>{t('Loading...')}</Content>
      </PageSection>
    );
  }

  const k8sResourceURL = `/k8s/ns/${ns}/devportal.kuadrant.io~v1alpha1~APIKey/${name}`;

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Flex
          justifyContent={{ default: 'justifyContentSpaceBetween' }}
          alignItems={{ default: 'alignItemsCenter' }}
        >
          <FlexItem>
            <Title headingLevel="h1">{apiKeyToUse.metadata.name}</Title>
          </FlexItem>
          <FlexItem>
            <Flex>
              <FlexItem>
                <Button
                  variant={ButtonVariant.secondary}
                  icon={<ExternalLinkAltIcon />}
                  iconPosition="end"
                  component="a"
                  href={k8sResourceURL}
                >
                  {t('View K8s Resource')}
                </Button>
              </FlexItem>
              <FlexItem>
                {!rbacLoading && canDelete ? (
                  <Button variant={ButtonVariant.danger} onClick={handleDeleteClick}>
                    {t('Delete')}
                  </Button>
                ) : (
                  <Tooltip content={t('You do not have permission to delete this API Key')}>
                    <Button variant={ButtonVariant.danger} isAriaDisabled={true}>
                      {t('Delete')}
                    </Button>
                  </Tooltip>
                )}
              </FlexItem>
            </Flex>
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h2" size="lg" style={{ marginBottom: '16px' }}>
          {t('Details')}
        </Title>
        <DescriptionList isHorizontal>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Name')}</DescriptionListTerm>
            <DescriptionListDescription>{apiKeyToUse.metadata.name}</DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Namespace')}</DescriptionListTerm>
            <DescriptionListDescription>
              {apiKeyToUse.metadata.namespace || '-'}
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Owner')}</DescriptionListTerm>
            <DescriptionListDescription>
              {apiKeyToUse.spec?.requestedBy?.userId || '-'}
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('API Product')}</DescriptionListTerm>
            <DescriptionListDescription>
              {apiKeyToUse.spec?.apiProductRef?.name || '-'}
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Status')}</DescriptionListTerm>
            <DescriptionListDescription>
              {apiKeyToUse.status?.phase || 'Unknown'}
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Tier')}</DescriptionListTerm>
            <DescriptionListDescription>
              {apiKeyToUse.spec?.planTier || '-'}
            </DescriptionListDescription>
          </DescriptionListGroup>
          {apiKeyToUse.spec?.useCase && (
            <DescriptionListGroup>
              <DescriptionListTerm>{t('Use Case')}</DescriptionListTerm>
              <DescriptionListDescription>{apiKeyToUse.spec.useCase}</DescriptionListDescription>
            </DescriptionListGroup>
          )}
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Requested Time')}</DescriptionListTerm>
            <DescriptionListDescription>
              {apiKeyToUse.metadata.creationTimestamp ? (
                <Timestamp timestamp={apiKeyToUse.metadata.creationTimestamp} />
              ) : (
                '-'
              )}
            </DescriptionListDescription>
          </DescriptionListGroup>
          {apiKeyToUse.status?.secretRef?.name && (
            <DescriptionListGroup>
              <DescriptionListTerm>{t('Secret Reference')}</DescriptionListTerm>
              <DescriptionListDescription>
                {apiKeyToUse.status.secretRef.name}
              </DescriptionListDescription>
            </DescriptionListGroup>
          )}
        </DescriptionList>
      </PageSection>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={isDeleteModalOpen} onClose={handleDeleteCancel} variant={ModalVariant.small}>
        <ModalHeader title={t('Confirm Delete')} />
        <ModalBody>
          {deleteError && (
            <Alert
              variant="danger"
              isInline
              title={t('Delete failed')}
              style={{ marginBottom: '16px' }}
            >
              {deleteError}
            </Alert>
          )}
          {t('Are you sure you want to delete the API Key')} <strong>{name}</strong>?
        </ModalBody>
        <ModalFooter>
          <Button key="confirm" variant={ButtonVariant.danger} onClick={handleDeleteConfirm}>
            {t('Delete')}
          </Button>
          <Button key="cancel" variant={ButtonVariant.link} onClick={handleDeleteCancel}>
            {t('Cancel')}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default APIKeyDetailPage;
