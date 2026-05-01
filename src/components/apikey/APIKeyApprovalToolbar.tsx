import * as React from 'react';
import {
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Button,
  InputGroup,
  TextInput,
  MenuToggle,
  Select,
  SelectOption,
  SelectList,
  MenuToggleElement,
} from '@patternfly/react-core';
import { SearchIcon, FilterIcon } from '@patternfly/react-icons';
import { useTranslation } from 'react-i18next';

export interface FilterState {
  product: string;
  requester: string;
}

interface APIKeyApprovalToolbarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  selectedCount: number;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  productOptions: Array<{ name: string; namespace: string }>;
}

const APIKeyApprovalToolbar: React.FC<APIKeyApprovalToolbarProps> = ({
  filters,
  onFilterChange,
  selectedCount,
  onBulkApprove,
  onBulkReject,
  productOptions,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [isProductSelectOpen, setIsProductSelectOpen] = React.useState(false);

  const handleProductSelect = (
    _event: React.MouseEvent | undefined,
    value: string | number | undefined,
  ) => {
    onFilterChange({ ...filters, product: value as string });
    setIsProductSelectOpen(false);
  };

  const handleRequesterChange = (_event: React.FormEvent<HTMLInputElement>, value: string) => {
    onFilterChange({ ...filters, requester: value });
  };

  const clearFilters = () => {
    onFilterChange({ product: '', requester: '' });
  };

  const hasActiveFilters = filters.product !== '' || filters.requester !== '';

  return (
    <Toolbar>
      <ToolbarContent>
        <ToolbarItem>
          <Select
            isOpen={isProductSelectOpen}
            onOpenChange={(isOpen) => setIsProductSelectOpen(isOpen)}
            onSelect={handleProductSelect}
            selected={filters.product}
            toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
              <MenuToggle
                ref={toggleRef}
                onClick={() => setIsProductSelectOpen(!isProductSelectOpen)}
                icon={<FilterIcon />}
              >
                {filters.product || t('All API Products')}
              </MenuToggle>
            )}
          >
            <SelectList>
              <SelectOption key="all" value="">
                {t('All API Products')}
              </SelectOption>
              {productOptions.map((p) => (
                <SelectOption key={`${p.namespace}/${p.name}`} value={p.name}>
                  {productOptions.filter((opt) => opt.name === p.name).length > 1
                    ? `${p.name} (${p.namespace})`
                    : p.name}
                </SelectOption>
              ))}
            </SelectList>
          </Select>
        </ToolbarItem>

        <ToolbarItem>
          <InputGroup>
            <TextInput
              type="search"
              placeholder={t('Filter by requester...')}
              value={filters.requester}
              onChange={handleRequesterChange}
              aria-label={t('Filter by requester')}
            />
            <Button variant="control" aria-label={t('Search')}>
              <SearchIcon />
            </Button>
          </InputGroup>
        </ToolbarItem>

        {hasActiveFilters && (
          <ToolbarItem>
            <Button variant="link" onClick={clearFilters}>
              {t('Clear filters')}
            </Button>
          </ToolbarItem>
        )}

        {selectedCount > 0 && (
          <>
            <ToolbarItem variant="separator" />
            <ToolbarItem>
              <Button variant="primary" onClick={onBulkApprove}>
                {t('Approve {{count}} selected', { count: selectedCount })}
              </Button>
            </ToolbarItem>
            <ToolbarItem>
              <Button variant="danger" onClick={onBulkReject}>
                {t('Reject {{count}} selected', { count: selectedCount })}
              </Button>
            </ToolbarItem>
          </>
        )}
      </ToolbarContent>
    </Toolbar>
  );
};

export default APIKeyApprovalToolbar;
