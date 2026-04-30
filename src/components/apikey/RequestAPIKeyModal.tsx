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
  Select,
  SelectOption,
  SelectList,
  MenuToggle,
  MenuToggleElement,
  SearchInput,
  Alert,
} from '@patternfly/react-core';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { RESOURCES } from '../../utils/resources';
import { APIProduct } from '../apiproduct/types';
import '../kuadrant.css';

interface RequestAPIKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RequestAPIKeyModal: React.FC<RequestAPIKeyModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  const [selectedAPIProduct, setSelectedAPIProduct] = React.useState<string>('');
  const [isAPIProductSelectOpen, setIsAPIProductSelectOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState<string>('');

  // Fetch API Products cluster-wide (all namespaces)
  const [apiProducts, apiProductsLoaded] = useK8sWatchResource<APIProduct[]>({
    groupVersionKind: RESOURCES.APIProduct.gvk,
    namespace: undefined,
    isList: true,
  });

  // Filter only active API products (not being deleted)
  const activeAPIProducts = React.useMemo(() => {
    return apiProducts.filter((product) => !product.metadata?.deletionTimestamp);
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

  const onAPIProductSelect = (
    _event: React.MouseEvent<Element, MouseEvent> | undefined,
    value: string,
  ) => {
    const product = activeAPIProducts.find((p) => p.metadata.name === value);
    if (product) {
      setSelectedAPIProduct(value);
      setSearchValue(product.spec?.displayName || product.metadata.name);
    }
    setIsAPIProductSelectOpen(false);
  };

  const handleClose = () => {
    setSelectedAPIProduct('');
    setSearchValue('');
    setIsAPIProductSelectOpen(false);
    onClose();
  };

  const onClearSearch = () => {
    setSearchValue('');
    setSelectedAPIProduct('');
  };

  const onToggleClick = () => {
    setIsAPIProductSelectOpen(!isAPIProductSelectOpen);
  };

  const hasNoAPIProducts = apiProductsLoaded && activeAPIProducts.length === 0;

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
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        {hasNoAPIProducts ? (
          <Button key="cancel" variant={ButtonVariant.primary} onClick={handleClose}>
            {t('Cancel')}
          </Button>
        ) : (
          <Button key="ok" variant={ButtonVariant.primary} onClick={handleClose}>
            {t('OK')}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
};

export default RequestAPIKeyModal;
