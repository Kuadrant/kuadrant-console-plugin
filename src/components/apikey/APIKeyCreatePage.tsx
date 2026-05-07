import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom-v5-compat';
import {
  PageSection,
  Title,
  Form,
  FormGroup,
  TextInput,
  TextArea,
  ActionGroup,
  Button,
  Card,
  CardBody,
  Select,
  SelectOption,
  SelectList,
  MenuToggle,
  MenuToggleElement,
  Alert,
  ClipboardCopy,
} from '@patternfly/react-core';
import {
  useActiveNamespace,
  useK8sWatchResource,
  k8sCreate,
} from '@openshift-console/dynamic-plugin-sdk';
import { RESOURCES } from '../../utils/resources';
import { APIProduct } from '../apiproduct/types';
import { APIKey } from './types';

const APIKeyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const navigate = useNavigate();
  const { ns } = useParams<{ ns: string }>();
  const [activeNamespace] = useActiveNamespace();
  const namespace = ns || activeNamespace;

  const [formData, setFormData] = React.useState({
    name: '',
    apiProduct: { name: '', namespace: '' },
    planTier: '',
    useCase: '',
  });

  const [isProductOpen, setIsProductOpen] = React.useState(false);
  const [generatedKey, setGeneratedKey] = React.useState<string | null>(null);
  const [isKeySaved, setIsKeySaved] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Discovery: Watch all APIProducts cluster-wide
  const [apiProducts, productsLoaded] = useK8sWatchResource<APIProduct[]>({
    groupVersionKind: RESOURCES.APIProduct.gvk,
    isList: true,
  });

  const generateKey = () => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let retVal = '';
    for (let i = 0, n = charset.length; i < 32; ++i) {
      retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    setGeneratedKey(retVal);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isKeySaved) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Create Secret in consumer namespace
      const secret = {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name: `${formData.name}-secret`,
          namespace,
        },
        stringData: {
          api_key: generatedKey,
        },
      };
      await k8sCreate({ model: { version: 'v1', kind: 'Secret' }, data: secret });

      // 2. Create APIKey
      const apiKey: APIKey = {
        apiVersion: `${RESOURCES.APIKey.gvk.group}/${RESOURCES.APIKey.gvk.version}`,
        kind: RESOURCES.APIKey.gvk.kind,
        metadata: {
          name: formData.name,
          namespace,
        },
        spec: {
          apiProductRef: formData.apiProduct,
          secretRef: {
            name: `${formData.name}-secret`,
          },
          planTier: formData.planTier,
          useCase: formData.useCase,
          requestedBy: {
            userId: 'current-user', // Should be fetched from console context if possible
          },
        },
      };
      await k8sCreate({ model: RESOURCES.APIKey.gvk as any, data: apiKey });

      navigate(`/kuadrant/ns/${namespace}/apikeys`);
    } catch (err: any) {
      setError(err.message || t('An error occurred during creation'));
      setIsSubmitting(false);
    }
  };

  if (generatedKey && !isKeySaved) {
    return (
      <PageSection>
        <Title headingLevel="h1">{t('Save your API Key')}</Title>
        <Card style={{ marginTop: '1rem' }}>
          <CardBody>
            <Alert variant="warning" isInline title={t('Important: Copy your API key now')}>
              {t("You won't be able to see this key again once you leave this page.")}
            </Alert>
            <div style={{ marginTop: '1rem' }}>
              <ClipboardCopy isReadOnly hoverTip={t('Copy')} clickTip={t('Copied')}>
                {generatedKey}
              </ClipboardCopy>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <Button variant="primary" onClick={() => setIsKeySaved(true)}>
                {t("I've saved my API key")}
              </Button>
            </div>
          </CardBody>
        </Card>
      </PageSection>
    );
  }

  return (
    <PageSection>
      <Title headingLevel="h1">{t('Request API Key')}</Title>
      <Card style={{ marginTop: '1rem', maxWidth: '800px' }}>
        <CardBody>
          {error && (
            <Alert variant="danger" isInline title={t('Error')} style={{ marginBottom: '1rem' }}>
              {error}
            </Alert>
          )}
          <Form onSubmit={handleSubmit}>
            <FormGroup label={t('Name')} isRequired fieldId="name">
              <TextInput
                isRequired
                type="text"
                id="name"
                value={formData.name}
                onChange={(_evt, value) => setFormData({ ...formData, name: value })}
                placeholder={t('My API Key')}
              />
            </FormGroup>

            <FormGroup label={t('API Product')} isRequired fieldId="api-product">
              <Select
                isOpen={isProductOpen}
                onOpenChange={setIsProductOpen}
                onSelect={(_evt, value) => {
                  const product = apiProducts?.find((p) => p.metadata?.name === value);
                  if (product) {
                    setFormData({
                      ...formData,
                      apiProduct: {
                        name: product.metadata!.name!,
                        namespace: product.metadata!.namespace!,
                      },
                    });
                  }
                  setIsProductOpen(false);
                }}
                toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                  <MenuToggle
                    ref={toggleRef}
                    onClick={() => setIsProductOpen(!isProductOpen)}
                    isExpanded={isProductOpen}
                    isFullWidth
                  >
                    {formData.apiProduct.name
                      ? `${formData.apiProduct.name} (${formData.apiProduct.namespace})`
                      : t('Select an API Product')}
                  </MenuToggle>
                )}
              >
                <SelectList>
                  {productsLoaded &&
                    apiProducts?.map((p) => (
                      <SelectOption key={p.metadata?.uid} value={p.metadata?.name}>
                        {p.metadata?.name} ({p.metadata?.namespace})
                      </SelectOption>
                    ))}
                </SelectList>
              </Select>
            </FormGroup>

            <FormGroup label={t('Plan Tier')} isRequired fieldId="plan-tier">
              <TextInput
                isRequired
                type="text"
                id="plan-tier"
                value={formData.planTier}
                onChange={(_evt, value) => setFormData({ ...formData, planTier: value })}
                placeholder="basic"
              />
            </FormGroup>

            <FormGroup label={t('Use Case')} fieldId="use-case">
              <TextArea
                id="use-case"
                value={formData.useCase}
                onChange={(_evt, value) => setFormData({ ...formData, useCase: value })}
                rows={3}
              />
            </FormGroup>

            <ActionGroup>
              <Button
                variant="primary"
                onClick={generateKey}
                isDisabled={!formData.name || !formData.apiProduct.name || !formData.planTier}
              >
                {t('Generate Key')}
              </Button>
              <Button variant="link" onClick={() => navigate(-1)}>
                {t('Cancel')}
              </Button>
            </ActionGroup>
          </Form>
        </CardBody>
      </Card>
    </PageSection>
  );
};

export default APIKeyCreatePage;
