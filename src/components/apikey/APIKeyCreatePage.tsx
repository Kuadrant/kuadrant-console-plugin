import * as React from 'react';
import Helmet from 'react-helmet';
import { PageSection, Title, Alert, AlertGroup, ActionGroup, Button } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { useActiveNamespace, NamespaceBar, k8sCreate } from '@openshift-console/dynamic-plugin-sdk';
import { useNavigate } from 'react-router-dom-v5-compat';
import { APIKeyForm } from './APIKeyForm';
import { APIKeyKind } from './types';
import { getModelFromResource } from '../../utils/getModelFromResource';
import '../kuadrant.css';

const APIKeyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [selectedNamespace] = useActiveNamespace();
  const navigate = useNavigate();
  const [error, setError] = React.useState<string>('');
  const [inProgress, setInProgress] = React.useState(false);

  const [formData, setFormData] = React.useState<APIKeyKind>({
    apiVersion: 'devportal.kuadrant.io/v1alpha1',
    kind: 'APIKey',
    metadata: {
      name: '',
      namespace: selectedNamespace,
    },
    spec: {
      apiProductRef: {
        name: '',
        namespace: '',
      },
      secretRef: {
        name: '',
      },
      planTier: '',
      requestedBy: {
        userId: '',
        email: '',
      },
      useCase: '',
    },
  });

  // Update namespace in formData when selectedNamespace changes
  React.useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        namespace: selectedNamespace,
      },
    }));
  }, [selectedNamespace]);

  const handleNamespaceChange = (namespace: string) => {
    if (namespace !== '#ALL_NS#') {
      navigate(`/kuadrant/apikeys/ns/${namespace}/~new`, { replace: true });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.metadata?.name) {
      setError(t('Name is required'));
      return;
    }
    if (!formData.metadata?.namespace) {
      setError(t('Namespace is required'));
      return;
    }
    if (!formData.spec?.apiProductRef?.name) {
      setError(t('APIProduct is required'));
      return;
    }
    if (!formData.spec?.apiProductRef?.namespace) {
      setError(t('APIProduct namespace is required'));
      return;
    }
    if (!formData.spec?.planTier) {
      setError(t('Plan is required'));
      return;
    }
    if (!formData.spec?.requestedBy?.userId) {
      setError(t('User ID is required'));
      return;
    }
    if (!formData.spec?.requestedBy?.email) {
      setError(t('Email is required'));
      return;
    }
    if (!formData.spec?.useCase) {
      setError(t('Use case is required'));
      return;
    }

    setInProgress(true);

    try {
      const created = await k8sCreate<APIKeyKind>({
        model: getModelFromResource(formData),
        data: formData,
      });

      // Navigate back to list page
      navigate(`/kuadrant/apikeys/ns/${created.metadata?.namespace}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : t('Failed to create APIKey');
      setError(errorMessage);
      setInProgress(false);
    }
  };

  const handleCancel = () => {
    navigate(`/kuadrant/apikeys/ns/${selectedNamespace}`);
  };

  return (
    <>
      <Helmet>
        <title data-test="apikey-create-page-title">{t('Request API Key')}</title>
      </Helmet>
      <NamespaceBar onNamespaceChange={handleNamespaceChange} />
      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h1">{t('Request API Key')}</Title>
      </PageSection>
      <PageSection>
        {error && (
          <AlertGroup className="kuadrant-alert-group">
            <Alert variant="danger" isInline title={t('Error')}>
              {error}
            </Alert>
          </AlertGroup>
        )}
        <APIKeyForm obj={formData} onChange={setFormData} />
        <ActionGroup>
          <Button
            type="submit"
            onClick={handleSubmit}
            isDisabled={inProgress}
            isLoading={inProgress}
          >
            {t('Create')}
          </Button>
          <Button variant="link" onClick={handleCancel} isDisabled={inProgress}>
            {t('Cancel')}
          </Button>
        </ActionGroup>
      </PageSection>
    </>
  );
};

export default APIKeyCreatePage;
