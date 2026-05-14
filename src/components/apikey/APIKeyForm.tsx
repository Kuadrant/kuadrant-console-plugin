import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Form,
  FormGroup,
  TextInput,
  FormSelect,
  FormSelectOption,
  TextArea,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { APIProductKind, APIKeyKind, PlanInfo } from './types';

type APIKeyFormProps = {
  obj?: APIKeyKind;
  onChange: (apikey: APIKeyKind) => void;
  namespace?: string;
};

export const APIKeyForm: React.FC<APIKeyFormProps> = ({ obj, onChange }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const isCreate = !obj;
  const [formData, setFormData] = React.useState<APIKeyKind>(
    obj || {
      apiVersion: 'devportal.kuadrant.io/v1alpha1',
      kind: 'APIKey',
      metadata: {
        name: '',
        namespace: '',
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
    },
  );

  // Sync form data when obj prop changes
  React.useEffect(() => {
    if (obj) {
      setFormData(obj);
    }
  }, [obj]);

  // Watch all APIProducts cluster-wide
  const [apiProducts, apiProductsLoaded] = useK8sWatchResource<APIProductKind[]>({
    groupVersionKind: {
      group: 'devportal.kuadrant.io',
      version: 'v1alpha1',
      kind: 'APIProduct',
    },
    isList: true,
  });

  // Extract unique namespaces from APIProducts
  const namespaces = React.useMemo(() => {
    if (!apiProductsLoaded || !apiProducts) return [];
    const nsSet = new Set<string>();
    apiProducts.forEach((ap) => {
      if (ap.metadata?.namespace) {
        nsSet.add(ap.metadata.namespace);
      }
    });
    return Array.from(nsSet).sort();
  }, [apiProducts, apiProductsLoaded]);

  // Filter APIProducts by selected namespace
  const productsInNamespace = React.useMemo(() => {
    if (!apiProductsLoaded || !apiProducts) return [];
    const ns = formData.spec?.apiProductRef?.namespace || formData.metadata?.namespace || '';
    if (!ns) return [];
    return apiProducts.filter((ap) => ap.metadata?.namespace === ns);
  }, [
    apiProducts,
    apiProductsLoaded,
    formData.spec?.apiProductRef?.namespace,
    formData.metadata?.namespace,
  ]);

  // Get plans from selected APIProduct
  const availablePlans = React.useMemo(() => {
    const productName = formData.spec?.apiProductRef?.name;
    if (!productName) return [];
    const product = productsInNamespace.find((p) => p.metadata?.name === productName);
    return product?.status?.discoveredPlans || [];
  }, [productsInNamespace, formData.spec?.apiProductRef?.name]);

  const handleChange = (field: string, value: string) => {
    const updated = { ...formData };

    if (field === 'name') {
      updated.metadata = { ...updated.metadata, name: value };
    } else if (field === 'namespace') {
      updated.metadata = { ...updated.metadata, namespace: value };
      // Reset product and plan when namespace changes
      if (updated.spec) {
        updated.spec.apiProductRef = { name: '', namespace: value };
        updated.spec.planTier = '';
      }
    } else if (field === 'apiProductRef.namespace') {
      if (updated.spec) {
        updated.spec.apiProductRef = { ...updated.spec.apiProductRef, namespace: value };
        // Reset product and plan when namespace changes
        updated.spec.apiProductRef.name = '';
        updated.spec.planTier = '';
      }
    } else if (field === 'apiProductRef.name') {
      if (updated.spec) {
        updated.spec.apiProductRef = { ...updated.spec.apiProductRef, name: value };
        // Reset plan when product changes
        updated.spec.planTier = '';
      }
    } else if (field === 'planTier') {
      if (updated.spec) {
        updated.spec.planTier = value;
      }
    } else if (field === 'secretRef.name') {
      if (updated.spec) {
        updated.spec.secretRef = { name: value };
      }
    } else if (field === 'requestedBy.userId') {
      if (updated.spec) {
        updated.spec.requestedBy = { ...updated.spec.requestedBy, userId: value };
      }
    } else if (field === 'requestedBy.email') {
      if (updated.spec) {
        updated.spec.requestedBy = { ...updated.spec.requestedBy, email: value };
      }
    } else if (field === 'useCase') {
      if (updated.spec) {
        updated.spec.useCase = value;
      }
    }

    setFormData(updated);
    onChange(updated);
  };

  return (
    <Form>
      <FormGroup label={t('Name')} isRequired fieldId="name">
        <TextInput
          isRequired
          type="text"
          id="name"
          name="name"
          value={formData.metadata?.name || ''}
          onChange={(_event, value) => handleChange('name', value)}
          isDisabled={!isCreate}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{t('Unique name for this API key request')}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <FormGroup label={t('Namespace')} isRequired fieldId="namespace">
        <FormSelect
          id="namespace"
          value={formData.metadata?.namespace || ''}
          onChange={(_event, value) => handleChange('namespace', value as string)}
          isDisabled={!isCreate}
        >
          <FormSelectOption key="placeholder" value="" label={t('Select a namespace')} isDisabled />
          {namespaces.map((ns) => (
            <FormSelectOption key={ns} value={ns} label={ns} />
          ))}
        </FormSelect>
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{t('Namespace where the APIKey will be created')}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <FormGroup label={t('APIProduct Namespace')} isRequired fieldId="apiproduct-namespace">
        <FormSelect
          id="apiproduct-namespace"
          value={formData.spec?.apiProductRef?.namespace || formData.metadata?.namespace || ''}
          onChange={(_event, value) => handleChange('apiProductRef.namespace', value as string)}
        >
          <FormSelectOption key="placeholder" value="" label={t('Select a namespace')} isDisabled />
          {namespaces.map((ns) => (
            <FormSelectOption key={ns} value={ns} label={ns} />
          ))}
        </FormSelect>
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {t('Namespace containing the APIProduct to request access to')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <FormGroup label={t('APIProduct')} isRequired fieldId="apiproduct">
        <FormSelect
          id="apiproduct"
          value={formData.spec?.apiProductRef?.name || ''}
          onChange={(_event, value) => handleChange('apiProductRef.name', value as string)}
          isDisabled={!formData.spec?.apiProductRef?.namespace && !formData.metadata?.namespace}
        >
          <FormSelectOption
            key="placeholder"
            value=""
            label={t('Select an APIProduct')}
            isDisabled
          />
          {productsInNamespace.map((product) => (
            <FormSelectOption
              key={product.metadata?.name}
              value={product.metadata?.name || ''}
              label={`${product.metadata?.name} (${product.metadata?.namespace})`}
            />
          ))}
        </FormSelect>
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{t('The API product you want to request access to')}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <FormGroup label={t('Plan')} isRequired fieldId="plan">
        <FormSelect
          id="plan"
          value={formData.spec?.planTier || ''}
          onChange={(_event, value) => handleChange('planTier', value as string)}
          isDisabled={!formData.spec?.apiProductRef?.name}
        >
          <FormSelectOption key="placeholder" value="" label={t('Select a plan')} isDisabled />
          {availablePlans.map((plan: PlanInfo) => (
            <FormSelectOption key={plan.name} value={plan.name} label={plan.name} />
          ))}
        </FormSelect>
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {t('The tier of access you are requesting (e.g., gold, silver, bronze)')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <FormGroup label={t('Secret Name')} fieldId="secret-name">
        <TextInput
          type="text"
          id="secret-name"
          name="secret-name"
          value={formData.spec?.secretRef?.name || ''}
          onChange={(_event, value) => handleChange('secretRef.name', value)}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {t(
                '(Optional) Name of the Secret where the API key will be stored. Auto-generated if not provided.',
              )}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <FormGroup label={t('User ID')} isRequired fieldId="user-id">
        <TextInput
          isRequired
          type="text"
          id="user-id"
          name="user-id"
          value={formData.spec?.requestedBy?.userId || ''}
          onChange={(_event, value) => handleChange('requestedBy.userId', value)}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{t('Your user identifier')}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <FormGroup label={t('Email')} isRequired fieldId="email">
        <TextInput
          isRequired
          type="email"
          id="email"
          name="email"
          value={formData.spec?.requestedBy?.email || ''}
          onChange={(_event, value) => handleChange('requestedBy.email', value)}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{t('Your contact email address')}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <FormGroup label={t('Use Case')} isRequired fieldId="use-case">
        <TextArea
          isRequired
          id="use-case"
          name="use-case"
          value={formData.spec?.useCase || ''}
          onChange={(_event, value) => handleChange('useCase', value)}
          resizeOrientation="vertical"
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {t('Describe how you plan to use this API (required for approval)')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </Form>
  );
};
