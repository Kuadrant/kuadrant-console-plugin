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
  DatePicker,
} from '@patternfly/react-core';
import {
  useK8sWatchResource,
  useActiveNamespace,
  k8sCreate,
  k8sDelete,
  useK8sModel,
} from '@openshift-console/dynamic-plugin-sdk';
import { RESOURCES, APIKey, Secret } from '../../utils/resources';
import { getModelFromResource } from '../../utils/getModelFromResource';
import { formatLimits } from '../../utils/apiKeyUtils';
import { APIProduct, PlanSpec } from '../apiproduct/types';
import '../kuadrant.css';

interface RequestAPIKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
}

const RequestAPIKeyModal: React.FC<RequestAPIKeyModalProps> = ({ isOpen, onClose, username }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();

  const [selectedAPIProduct, setSelectedAPIProduct] = React.useState<string>('');
  const [isAPIProductSelectOpen, setIsAPIProductSelectOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState<string>('');

  const [selectedTier, setSelectedTier] = React.useState<string>('');
  const [isTierSelectOpen, setIsTierSelectOpen] = React.useState(false);
  const [tierSearchValue, setTierSearchValue] = React.useState<string>('');

  const [apiKeyName, setApiKeyName] = React.useState<string>('');
  const [apiKeyNameTouched, setApiKeyNameTouched] = React.useState(false);
  const [apiKeyNameError, setApiKeyNameError] = React.useState<string>('');

  const [useCase, setUseCase] = React.useState<string>('');

  const [expirationPreset, setExpirationPreset] = React.useState<string>('none');
  const [isExpirationSelectOpen, setIsExpirationSelectOpen] = React.useState(false);
  const [customExpiryDate, setCustomExpiryDate] = React.useState<string>('');

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string>('');

  // Get the Secret model
  const [secretModel] = useK8sModel({ version: 'v1', kind: 'Secret' });

  // Fetch API Products cluster-wide (all namespaces)
  const [apiProducts, apiProductsLoaded] = useK8sWatchResource<APIProduct[]>({
    groupVersionKind: RESOURCES.APIProduct.gvk,
    namespace: undefined,
    isList: true,
  });

  // Fetch existing APIKeys in the active namespace to check for uniqueness
  const effectiveNamespace =
    activeNamespace && activeNamespace !== '#ALL_NS#' ? activeNamespace : undefined;

  const [existingAPIKeys, existingAPIKeysLoaded] = useK8sWatchResource<APIKey[]>({
    groupVersionKind: RESOURCES.APIKey.gvk,
    namespace: effectiveNamespace,
    isList: true,
  });

  // Filter only active API products (not being deleted) that have discovered plans
  const activeAPIProducts = React.useMemo(() => {
    return (Array.isArray(apiProducts) ? apiProducts : []).filter(
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

  const getExpirationPresetLabel = (days: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setUTCHours(12, 0, 0, 0);
    const dateStr = date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return t('{{days}} days ({{date}})', { days, date: dateStr });
  };

  const isCustomDateValid = (): boolean => {
    if (!customExpiryDate) return false;
    // Must match YYYY-MM-DD (full date, not partial like "2026-07")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customExpiryDate)) return false;
    const date = new Date(customExpiryDate);
    if (isNaN(date.getTime())) return false;
    return date >= new Date(new Date().toLocaleDateString('en-CA'));
  };

  const computeExpiresAt = (): string | undefined => {
    if (expirationPreset === 'none') return undefined;
    if (expirationPreset === 'custom') {
      if (!isCustomDateValid()) return undefined;
      return new Date(customExpiryDate).toISOString();
    }
    const days = parseInt(expirationPreset, 10);
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setUTCHours(0, 0, 0, 0);
    return date.toISOString();
  };

  const todayFormatted = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD for DatePicker min

  const handleClose = () => {
    setSelectedAPIProduct('');
    setSearchValue('');
    setIsAPIProductSelectOpen(false);
    setSelectedTier('');
    setTierSearchValue('');
    setIsTierSelectOpen(false);
    setApiKeyName('');
    setApiKeyNameTouched(false);
    setApiKeyNameError('');
    setUseCase('');
    setExpirationPreset('none');
    setIsExpirationSelectOpen(false);
    setCustomExpiryDate('');
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

  const sanitizeUsernameForEmail = (username: string): string => {
    // Replace characters not allowed in email local part with hyphen
    // Email regex allows: [a-zA-Z0-9._%+-]
    return username.replace(/[^a-zA-Z0-9._%+-]/g, '-');
  };

  const generateApiKey = (): string => {
    // Generate a secure random API key (32 bytes = 64 hex characters)
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  };

  const validateApiKeyName = (name: string): string => {
    if (!name) {
      return t('API key name is required');
    }
    // Kubernetes name validation: lowercase alphanumeric or '-', must start/end with alphanumeric
    const validPattern = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
    if (!validPattern.test(name)) {
      return t(
        "Must consist of lowercase alphanumeric characters or '-', and must start and end with an alphanumeric character",
      );
    }
    if (name.length > 63) {
      return t('Must be no more than 63 characters');
    }
    if (!existingAPIKeysLoaded) {
      return '';
    }
    const isDuplicate = (existingAPIKeys || []).some(
      (key) => key.metadata?.name?.toLowerCase() === name.toLowerCase(),
    );
    if (isDuplicate) {
      return t('API key name is already in use');
    }
    return '';
  };

  React.useEffect(() => {
    if (apiKeyName === '') {
      setApiKeyNameError(apiKeyNameTouched ? t('API key name is required') : '');
    } else {
      setApiKeyNameError(validateApiKeyName(apiKeyName));
    }
  }, [apiKeyName, existingAPIKeys, existingAPIKeysLoaded, apiKeyNameTouched]);

  const handleApiKeyNameChange = (_event: React.FormEvent<HTMLInputElement>, value: string) => {
    setApiKeyName(value);
    setApiKeyNameTouched(true);
  };

  const hasNoAPIProducts = apiProductsLoaded && activeAPIProducts.length === 0;
  const isApiKeyNameValid = apiKeyName && !apiKeyNameError;

  const handleSubmit = async () => {
    // Validate required fields
    if (!username || !selectedAPIProduct || !selectedTier || !apiKeyName || !secretModel) {
      return;
    }

    // Check for validation errors
    if (apiKeyNameError || !existingAPIKeysLoaded) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const sanitizedUsername = sanitizeUsernameForEmail(username);
      const secretName = `${apiKeyName}-secret`;

      // Step 1: Generate API key
      const generatedKey = generateApiKey();

      // Step 2: Create the APIKey first so the Secret can reference its uid as owner
      const product = activeAPIProducts.find((p) => p.metadata.name === selectedAPIProduct);

      const expiresAtValue = computeExpiresAt();
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
            namespace: product?.metadata.namespace,
          },
          secretRef: {
            name: secretName,
          },
          planTier: selectedTier,
          requestedBy: {
            userId: username,
            email: `${sanitizedUsername}@example.com`,
          },
          ...(useCase && { useCase }),
          ...(expiresAtValue && { expiresAt: expiresAtValue }),
        },
      };

      const model = getModelFromResource(apiKeyResource);
      const createdAPIKey = await k8sCreate<APIKey>({ model, data: apiKeyResource });

      // Step 3: Create the Secret owned by the APIKey so it is garbage-collected on delete
      const secretResource: Secret = {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name: secretName,
          namespace: activeNamespace,
          ownerReferences: [
            {
              apiVersion: createdAPIKey.apiVersion,
              kind: createdAPIKey.kind,
              name: createdAPIKey.metadata.name,
              uid: createdAPIKey.metadata.uid,
              blockOwnerDeletion: false,
            },
          ],
        },
        type: 'Opaque',
        stringData: {
          api_key: generatedKey,
        },
      };

      try {
        await k8sCreate({ model: secretModel, data: secretResource });
      } catch (secretError: unknown) {
        // Roll back the APIKey so a failed Secret create doesn't leave it dangling
        try {
          await k8sDelete({ model, resource: createdAPIKey });
        } catch (rollbackError) {
          console.error('Failed to roll back APIKey after Secret creation error:', rollbackError);
        }
        throw secretError;
      }

      // Success - close modal
      handleClose();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setSubmitError(errorMessage);
      console.error('Failed to create API Key or Secret:', error);
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
            {t(
              'There are no API Products available to request access. Please contact your administrator.',
            )}
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
                    onChange={(_event, value) => {
                      setSearchValue(value);
                      // Auto-open dropdown when user starts typing
                      if (!isAPIProductSelectOpen) {
                        setIsAPIProductSelectOpen(true);
                      }
                    }}
                    onClick={() => {
                      if (!isAPIProductSelectOpen && apiProductsLoaded && !hasNoAPIProducts) {
                        setIsAPIProductSelectOpen(true);
                      }
                    }}
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
                <HelperTextItem>
                  {t('Each API Key is restricted to a single API product')}
                </HelperTextItem>
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
                    onChange={(_event, value) => {
                      setTierSearchValue(value);
                      // Auto-open dropdown when user starts typing
                      if (!isTierSelectOpen) {
                        setIsTierSelectOpen(true);
                      }
                    }}
                    onClick={() => {
                      if (!isTierSelectOpen && selectedAPIProduct && availablePlans.length > 0) {
                        setIsTierSelectOpen(true);
                      }
                    }}
                    onClear={onClearTierSearch}
                    placeholder={t('Search Tier')}
                    aria-label={t('Search Tier')}
                  />
                </MenuToggle>
              )}
            >
              <SelectList
                id="tier-select-listbox"
                style={{ maxHeight: '168px', overflowY: 'auto' }}
              >
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

          <FormGroup label={t('Expiration')} fieldId="expiration-select">
            <Select
              id="expiration-select"
              isOpen={isExpirationSelectOpen}
              selected={expirationPreset}
              onSelect={(_event, value) => {
                setExpirationPreset(value as string);
                setCustomExpiryDate('');
                setIsExpirationSelectOpen(false);
              }}
              onOpenChange={(isOpen) => setIsExpirationSelectOpen(isOpen)}
              toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                <MenuToggle
                  ref={toggleRef}
                  onClick={() => setIsExpirationSelectOpen(!isExpirationSelectOpen)}
                  isExpanded={isExpirationSelectOpen}
                  isFullWidth
                >
                  {expirationPreset === 'none'
                    ? t('No expiration')
                    : expirationPreset === 'custom'
                    ? t('Custom')
                    : getExpirationPresetLabel(parseInt(expirationPreset, 10))}
                </MenuToggle>
              )}
            >
              <SelectList>
                <SelectOption value="7">{getExpirationPresetLabel(7)}</SelectOption>
                <SelectOption value="30">{getExpirationPresetLabel(30)}</SelectOption>
                <SelectOption value="60">{getExpirationPresetLabel(60)}</SelectOption>
                <SelectOption value="90">{getExpirationPresetLabel(90)}</SelectOption>
                <SelectOption value="custom">{t('Custom')}</SelectOption>
                <SelectOption value="none">{t('No expiration')}</SelectOption>
              </SelectList>
            </Select>
            {expirationPreset === 'custom' && (
              <DatePicker
                style={{ marginTop: '8px' }}
                value={customExpiryDate}
                onChange={(_event, value) => setCustomExpiryDate(value)}
                placeholder={t('Select date')}
                aria-label={t('Custom expiry date')}
                validators={[
                  (date) => {
                    const today = new Date(todayFormatted);
                    return date < today ? t('Date must be today or in the future') : '';
                  },
                ]}
              />
            )}
            <FormHelperText>
              <HelperText>
                <HelperTextItem
                  variant={
                    expirationPreset === 'custom' && customExpiryDate && !isCustomDateValid()
                      ? 'error'
                      : 'default'
                  }
                >
                  {expirationPreset === 'custom' && customExpiryDate && !isCustomDateValid()
                    ? t('Enter a valid date (YYYY-MM-DD) that is today or in the future')
                    : expirationPreset === 'none'
                    ? t('The key will not expire.')
                    : t('The key will be automatically revoked on this date.')}
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
                !selectedAPIProduct ||
                !selectedTier ||
                !apiKeyName ||
                !!apiKeyNameError ||
                isSubmitting ||
                !existingAPIKeysLoaded ||
                (expirationPreset === 'custom' && !isCustomDateValid())
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
