import * as React from 'react';
import {
  Toolbar,
  ToolbarContent,
  ToolbarFilter,
  ToolbarItem,
  Badge,
  Select,
  SelectList,
  SelectOption,
  MenuToggle,
  MenuToggleElement,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';

interface ResourceFilterToolbarProps {
  allResourceTypes: string[];
  selectedResourceTypes: string[];
  onSelect: (_event: React.MouseEvent | React.ChangeEvent | undefined, selection: string) => void;
  onDeleteFilter: (_category: string, chip: string) => void;
  onDeleteGroup: () => void;
  onClearAll: () => void;
}

export const ResourceFilterToolbar: React.FC<ResourceFilterToolbarProps> = ({
  allResourceTypes,
  selectedResourceTypes,
  onSelect,
  onDeleteFilter,
  onDeleteGroup,
  onClearAll,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [isOpen, setIsOpen] = React.useState(false);

  const handleSelect = (
    event: React.MouseEvent | React.ChangeEvent | undefined,
    selection: string,
  ) => {
    onSelect(event, selection);
  };

  const handleDeleteLabel = (category: string, chip: string) => {
    if (chip) {
      onDeleteFilter(category, chip);
    }
  };

  return (
    <Toolbar
      id="resource-filter-toolbar"
      className="pf-m-toggle-group-container"
      collapseListedFiltersBreakpoint="xl"
      clearAllFilters={onClearAll}
      clearFiltersButtonText={t('Reset Filters')}
    >
      <ToolbarContent>
        <ToolbarItem variant="label-group">
          <ToolbarFilter
            categoryName="Resource"
            labels={selectedResourceTypes}
            deleteLabel={handleDeleteLabel}
            deleteLabelGroup={onDeleteGroup}
          >
            <Select
              aria-label="Resource filter"
              role="menu"
              isOpen={isOpen}
              onOpenChange={setIsOpen}
              onSelect={handleSelect}
              selected={selectedResourceTypes}
              toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                <MenuToggle ref={toggleRef} onClick={() => setIsOpen(!isOpen)} isExpanded={isOpen}>
                  Resource{' '}
                  {selectedResourceTypes.length > 0 && (
                    <Badge isRead>{selectedResourceTypes.length}</Badge>
                  )}
                </MenuToggle>
              )}
            >
              <SelectList>
                {allResourceTypes.map((type) => (
                  <SelectOption
                    key={type}
                    value={type}
                    hasCheckbox
                    isSelected={selectedResourceTypes.includes(type)}
                  >
                    {type}
                  </SelectOption>
                ))}
              </SelectList>
            </Select>
          </ToolbarFilter>
        </ToolbarItem>
      </ToolbarContent>
    </Toolbar>
  );
};
