import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  ButtonVariant,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Select,
  SelectOption,
  SelectList,
  MenuToggle,
  MenuToggleElement,
  SearchInput,
  Alert,
  Label,
  TextInput,
} from '@patternfly/react-core';
import {
  useK8sWatchResource,
  useActiveNamespace,
  k8sCreate,
} from '@openshift-console/dynamic-plugin-sdk';
import { RESOURCES, APIKey } from '../../utils/resources';
import { getModelFromResource } from '../../utils/getModelFromResource';
import { formatLimits } from '../../utils/apiKeyUtils';
import { APIProduct, PlanSpec } from '../apiproduct/types';
import '../kuadrant.css';

interface RequestAPIKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RequestAPIKeyModal: React.FC<RequestAPIKeyModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();

  const [selectedAPIProduct, setSelectedAPIProduct] = React.useState<string>('');
  const [isAPIProductSelectOpen, setIsAPIProductSelectOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState<string>('');

  const [selectedTier, setSelectedTier] = React.useState<string>('');
  const [isTierSelectOpen, setIsTierSelectOpen] = React.useState(false);
  const [tierSearchValue, setTierSearchValue] = React.useState<string>('');

  const [apiKeyName, setApiKeyName] = React.useState<string>('');
  const [apiKeyNameError, setApiKeyNameError] = React.useState<string>('');

  const [useCase, setUseCase] = React.useState<string>('');

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string>('');

  // Fetch API Products cluster-wide (all namespaces)
  const [apiProducts, apiProductsLoaded] = useK8sWatchResource<APIProduct[]>({
    groupVersionKind: RESOURCES.APIProduct.gvk,
    namespace: undefined,
    isList: true,
  });

  // Filter only active API products (not being deleted) that have discovered plans
  const activeAPIProducts = React.useMemo(() => {
    return apiProducts.filter(
      (product) =>
        !product.metadata?.deletionTimestamp &&
        product.status?.discoveredPlans &&
        product.status.discoveredPlans.length > 0,
    );
  }, [apiProducts]);

  // Filter products based on search value
  const filteredProducts = React.useMemo(() => {
    if (!searchValue) {
      return activeAPIProducts;
    }
    const searchLower = searchValue.toLowerCase();
    return activeAPIProducts.filter((product) => {
      const displayName = product.spec?.displayName || product.metadata.name;
      const description = product.spec?.description || '';
      return (
        displayName.toLowerCase().includes(searchLower) ||
        product.metadata.name.toLowerCase().includes(searchLower) ||
        description.toLowerCase().includes(searchLower)
      );
    });
  }, [activeAPIProducts, searchValue]);

  // Get available plans from selected API product
  const availablePlans = React.useMemo(() => {
    if (!selectedAPIProduct) return [];
    const product = activeAPIProducts.find((p) => p.metadata.name === selectedAPIProduct);
    if (!product?.status?.discoveredPlans) return [];
    return product.status.discoveredPlans as PlanSpec[];
  }, [selectedAPIProduct, activeAPIProducts]);

  // Filter plans based on search value
  const filteredPlans = React.useMemo(() => {
    if (!tierSearchValue) {
      return availablePlans;
    }
    const searchLower = tierSearchValue.toLowerCase();
    return availablePlans.filter((plan) => {
      const limitsText = formatLimits(plan.limits);
      return (
        plan.tier.toLowerCase().includes(searchLower) ||
        (limitsText && limitsText.toLowerCase().includes(searchLower))
      );
    });
  }, [availablePlans, tierSearchValue]);

  const onAPIProductSelect = (
    _event: React.MouseEvent<Element, MouseEvent> | undefined,
    value: string,
  ) => {
    const product = activeAPIProducts.find((p) => p.metadata.name === value);
    if (product) {
      setSelectedAPIProduct(value);
      setSearchValue(product.spec?.displayName || product.metadata.name);
      // Reset tier selection when API product changes
      setSelectedTier('');
      setTierSearchValue('');
    }
    setIsAPIProductSelectOpen(false);
  };

  const onTierSelect = (
    _event: React.MouseEvent<Element, MouseEvent> | undefined,
    value: string,
  ) => {
    const plan = availablePlans.find((p) => p.tier === value);
    if (plan) {
      setSelectedTier(value);
      const limitsText = formatLimits(plan.limits);
      const displayText = limitsText ? `${value} - ${limitsText}` : value;
      setTierSearchValue(displayText);
    }
    setIsTierSelectOpen(false);
  };

  const handleClose = () => {
    setSelectedAPIProduct('');
    setSearchValue('');
    setIsAPIProductSelectOpen(false);
    setSelectedTier('');
    setTierSearchValue('');
    setIsTierSelectOpen(false);
    setApiKeyName('');
    setApiKeyNameError('');
    setUseCase('');
    setIsSubmitting(false);
    setSubmitError('');
    onClose();
  };

  const onClearSearch = () => {
    setSearchValue('');
    setSelectedAPIProduct('');
    // Also reset tier when clearing API product
    setSelectedTier('');
    setTierSearchValue('');
  };

  const onClearTierSearch = () => {
    setTierSearchValue('');
    setSelectedTier('');
  };

  const onToggleClick = () => {
    setIsAPIProductSelectOpen(!isAPIProductSelectOpen);
  };

  const onTierToggleClick = () => {
    setIsTierSelectOpen(!isTierSelectOpen);
  };

  const validateApiKeyName = (name: string): string => {
    if (!name) {
      return t('API key name is required');
    }
    // Kubernetes name validation: lowercase alphanumeric or '-', must start/end with alphanumeric
    const validPattern = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
    if (!validPattern.test(name)) {
      return t(
        'Must consist of lowercase alphanumeric characters or \'-\', and must start and end with an alphanumeric character',
      );
    }
    if (name.length > 253) {
      return t('Must be no more than 253 characters');
    }
    return '';
  };

  const handleApiKeyNameChange = (_event: React.FormEvent<HTMLInputElement>, value: string) => {
    setApiKeyName(value);
    const error = validateApiKeyName(value);
    setApiKeyNameError(error);
  };

  const hasNoAPIProducts = apiProductsLoaded && activeAPIProducts.length === 0;
  const isApiKeyNameValid = apiKeyName && !apiKeyNameError;

  const handleSubmit = async () => {
    // Validate required fields
    if (!selectedAPIProduct || !selectedTier || !apiKeyName) {
      return;
    }

    // Check for validation errors
    if (apiKeyNameError) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const apiKeyResource: APIKey = {
        apiVersion: `${RESOURCES.APIKey.gvk.group}/${RESOURCES.APIKey.gvk.version}`,
        kind: RESOURCES.APIKey.gvk.kind,
        metadata: {
          name: apiKeyName,
          namespace: activeNamespace,
        },
        spec: {
          apiProductRef: {
            name: selectedAPIProduct,
          },
          planTier: selectedTier,
          ...(useCase && { useCase }),
        },
      };

      const model = getModelFromResource(apiKeyResource);
      await k8sCreate({ model, data: apiKeyResource });

      // Success - close modal
      handleClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setSubmitError(errorMessage);
      console.error('Failed to create API Key:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} variant={ModalVariant.small}>
      <ModalHeader title={t('Request API Key')} />
      <ModalBody>
        <p style={{ marginBottom: '16px' }}>
          {t('Provide details to request a new API key for accessing API')}
        </p>
        {hasNoAPIProducts && (
          <Alert
            variant="warning"
            isInline
            title={t('No API Products available')}
            style={{ marginBottom: '16px' }}
          >
            {t('There are no API Products available to request access. Please contact your administrator.')}
          </Alert>
        )}
        <Form>
          <FormGroup label={t('API Product')} isRequired fieldId="api-product-select">
            <Select
              id="api-product-typeahead-select"
              isOpen={isAPIProductSelectOpen}
              selected={selectedAPIProduct}
              onSelect={onAPIProductSelect}
              onOpenChange={(isOpen) => setIsAPIProductSelectOpen(isOpen)}
              toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                <MenuToggle
                  ref={toggleRef}
                  variant="typeahead"
                  onClick={onToggleClick}
                  isExpanded={isAPIProductSelectOpen}
                  isDisabled={!apiProductsLoaded || hasNoAPIProducts}
                  isFullWidth
                >
                  <SearchInput
                    value={searchValue}
                    onChange={(_event, value) => setSearchValue(value)}
                    onClear={onClearSearch}
                    placeholder={t('Search API Product')}
                    aria-label={t('Search API Product')}
                  />
                </MenuToggle>
              )}
            >
              <SelectList
                id="api-product-select-listbox"
                style={{ maxHeight: '168px', overflowY: 'auto' }}
              >
                {filteredProducts.length === 0 ? (
                  <SelectOption isDisabled>{t('No results found')}</SelectOption>
                ) : (
                  filteredProducts.map((product) => (
                    <SelectOption
                      key={product.metadata.name}
                      value={product.metadata.name}
                      description={product.spec?.description}
                    >
                      {product.spec?.displayName || product.metadata.name}
                    </SelectOption>
                  ))
                )}
              </SelectList>
            </Select>
            <FormHelperText>
              <HelperText>
                <HelperTextItem>{t('Each API Key is restricted to a single API product')}</HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label={t('Tier')} isRequired fieldId="tier-select">
            <Select
              id="tier-typeahead-select"
              isOpen={isTierSelectOpen}
              selected={selectedTier}
              onSelect={onTierSelect}
              onOpenChange={(isOpen) => setIsTierSelectOpen(isOpen)}
              toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                <MenuToggle
                  ref={toggleRef}
                  variant="typeahead"
                  onClick={onTierToggleClick}
                  isExpanded={isTierSelectOpen}
                  isDisabled={!selectedAPIProduct || availablePlans.length === 0}
                  isFullWidth
                >
                  <SearchInput
                    value={tierSearchValue}
                    onChange={(_event, value) => setTierSearchValue(value)}
                    onClear={onClearTierSearch}
                    placeholder={t('Search Tier')}
                    aria-label={t('Search Tier')}
                  />
                </MenuToggle>
              )}
            >
              <SelectList id="tier-select-listbox" style={{ maxHeight: '168px', overflowY: 'auto' }}>
                {filteredPlans.length === 0 ? (
                  <SelectOption isDisabled>{t('No results found')}</SelectOption>
                ) : (
                  filteredPlans.map((plan) => {
                    const limitsText = formatLimits(plan.limits);
                    return (
                      <SelectOption key={plan.tier} value={plan.tier}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Label isCompact>{plan.tier}</Label>
                          {limitsText && <span>{limitsText}</span>}
                        </div>
                      </SelectOption>
                    );
                  })
                )}
              </SelectList>
            </Select>
          </FormGroup>

          <FormGroup label={t('API key name')} isRequired fieldId="api-key-name">
            <TextInput
              id="api-key-name"
              type="text"
              value={apiKeyName}
              onChange={handleApiKeyNameChange}
              placeholder={t('Enter API key name')}
              aria-label={t('API key name')}
              validated={apiKeyNameError ? 'error' : isApiKeyNameValid ? 'success' : 'default'}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={apiKeyNameError ? 'error' : 'default'}>
                  {apiKeyNameError || t('The Kubernetes resource name for this API key')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label={t('Use Case')} fieldId="use-case">
            <TextInput
              id="use-case"
              type="text"
              value={useCase}
              onChange={(_event, value) => setUseCase(value)}
              placeholder={t('Enter use case')}
              aria-label={t('Use Case')}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  {t('A brief description of how you intend to use this API key.')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        {submitError && (
          <Alert
            variant="danger"
            isInline
            title={t('Request failed')}
            style={{ marginBottom: '16px' }}
          >
            {submitError}
          </Alert>
        )}
        {hasNoAPIProducts ? (
          <Button key="cancel" variant={ButtonVariant.primary} onClick={handleClose}>
            {t('Cancel')}
          </Button>
        ) : (
          <>
            <Button
              key="request"
              variant={ButtonVariant.primary}
              onClick={handleSubmit}
              isDisabled={
                !selectedAPIProduct || !selectedTier || !apiKeyName || !!apiKeyNameError || isSubmitting
              }
              isLoading={isSubmitting}
            >
              {t('Request')}
            </Button>
            <Button key="cancel" variant={ButtonVariant.link} onClick={handleClose}>
              {t('Cancel')}
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
};

export default RequestAPIKeyModal;
