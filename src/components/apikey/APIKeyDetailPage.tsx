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
  Tooltip,
  Breadcrumb,
  BreadcrumbItem,
  Tabs,
  Tab,
  TabTitleText,
} from '@patternfly/react-core';
import {
  ExternalLinkAltIcon,
  CheckCircleIcon,
  HourglassStartIcon,
  ExclamationCircleIcon,
} from '@patternfly/react-icons';
import { Link } from 'react-router-dom-v5-compat';
import { useK8sWatchResource, k8sDelete } from '@openshift-console/dynamic-plugin-sdk';
import { RESOURCES, APIKey } from '../../utils/resources';
import { getModelFromResource, getResourceNameFromKind } from '../../utils/getModelFromResource';
import useAccessReviews from '../../utils/resourceRBAC';
import APIKeyDetailsTab from './APIKeyDetailsTab';
import APIKeyDeleteModal from './APIKeyDeleteModal';
import '../kuadrant.css';

const APIKeyDetailPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const { ns, name } = useParams<{ ns: string; name: string }>();
  const navigate = useNavigate();

  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string>('');
  const [activeTabKey, setActiveTabKey] = React.useState<string | number>(0);

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
      setDeleteError('');
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

  const renderStatus = (phase?: string) => {
    if (phase === 'Approved') {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircleIcon style={{ color: '#3e8635' }} />
          {t('Active')}
        </span>
      );
    } else if (phase === 'Pending') {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HourglassStartIcon style={{ color: '#8476d1' }} />
          {t('Pending')}
        </span>
      );
    } else if (phase === 'Rejected') {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ExclamationCircleIcon style={{ color: '#c9190b' }} />
          {t('Rejected')}
        </span>
      );
    }
    return phase || 'Unknown';
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
        <Breadcrumb>
          <BreadcrumbItem>
            <Link to={`/kuadrant/ns/${ns}/myapikeys`}>{t('My API Keys')}</Link>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{apiKeyToUse.metadata.name}</BreadcrumbItem>
        </Breadcrumb>
      </PageSection>
      <PageSection hasBodyWrapper={false}>
        <Flex
          justifyContent={{ default: 'justifyContentSpaceBetween' }}
          alignItems={{ default: 'alignItemsCenter' }}
        >
          <FlexItem>
            <Flex
              alignItems={{ default: 'alignItemsCenter' }}
              spaceItems={{ default: 'spaceItemsMd' }}
            >
              <FlexItem>
                <Title headingLevel="h1">{apiKeyToUse.metadata.name}</Title>
              </FlexItem>
              <FlexItem>{renderStatus(apiKeyToUse.status?.phase)}</FlexItem>
            </Flex>
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

      <PageSection hasBodyWrapper={false} padding={{ default: 'noPadding' }}>
        <Tabs
          activeKey={activeTabKey}
          onSelect={(_event, tabIndex) => setActiveTabKey(tabIndex)}
          aria-label="APIKey details tabs"
        >
          <Tab eventKey={0} title={<TabTitleText>{t('Details')}</TabTitleText>}>
            <APIKeyDetailsTab apiKey={apiKeyToUse} />
          </Tab>
        </Tabs>
      </PageSection>

      {/* Delete Confirmation Modal */}
      <APIKeyDeleteModal
        isOpen={isDeleteModalOpen}
        apiKeyName={name || ''}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        error={deleteError}
      />
    </>
  );
};

export default APIKeyDetailPage;
