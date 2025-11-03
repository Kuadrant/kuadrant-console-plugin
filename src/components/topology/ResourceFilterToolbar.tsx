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
  Popover,
} from '@patternfly/react-core';
import { HelpIcon } from '@patternfly/react-icons';
import { useTranslation } from 'react-i18next';

interface ResourceFilterToolbarProps {
  allResourceTypes: string[];
  selectedResourceTypes: string[];
  allNamespaces?: string[];
  selectedNamespace?: string | null;
  onSelect: (_event: React.MouseEvent | React.ChangeEvent | undefined, selection: string) => void;
  onNamespaceSelect?: (
    _event: React.MouseEvent | React.ChangeEvent | undefined,
    selection: string | null,
  ) => void;
  onDeleteFilter: (_category: string, chip: string) => void;
  onDeleteGroup: () => void;
  onDeleteNamespace?: () => void;
  onClearAll: () => void;
}

export const ResourceFilterToolbar: React.FC<ResourceFilterToolbarProps> = ({
  allResourceTypes,
  selectedResourceTypes,
  allNamespaces,
  selectedNamespace,
  onSelect,
  onNamespaceSelect,
  onDeleteFilter,
  onDeleteGroup,
  onDeleteNamespace,
  onClearAll,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [isOpen, setIsOpen] = React.useState(false);
  const [isNamespaceOpen, setIsNamespaceOpen] = React.useState(false);

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
        {allNamespaces && allNamespaces.length > 0 && onNamespaceSelect && (
          <ToolbarItem variant="label-group">
            <ToolbarFilter
              categoryName="Namespace"
              labels={selectedNamespace ? [selectedNamespace] : []}
              deleteLabel={() => onDeleteNamespace?.()}
              deleteLabelGroup={() => onDeleteNamespace?.()}
            >
              <Select
                aria-label="Namespace filter"
                role="menu"
                isOpen={isNamespaceOpen}
                onOpenChange={setIsNamespaceOpen}
                onSelect={(event, selection) => {
                  const ns = selection as string;
                  onNamespaceSelect(event, ns === selectedNamespace ? null : ns);
                  setIsNamespaceOpen(false);
                }}
                selected={selectedNamespace || ''}
                toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                  <MenuToggle
                    ref={toggleRef}
                    onClick={() => setIsNamespaceOpen(!isNamespaceOpen)}
                    isExpanded={isNamespaceOpen}
                  >
                    Namespace {selectedNamespace && <Badge isRead>1</Badge>}
                  </MenuToggle>
                )}
              >
                <SelectList>
                  {allNamespaces.map((ns) => (
                    <SelectOption key={ns} value={ns} isSelected={selectedNamespace === ns}>
                      {ns}
                    </SelectOption>
                  ))}
                </SelectList>
              </Select>
            </ToolbarFilter>
          </ToolbarItem>
        )}
        {allNamespaces && allNamespaces.length > 0 && (
          <ToolbarItem>
            <Popover
              headerContent={t('Namespace filtering')}
              bodyContent={t(
                'Shows resources in the selected namespace and their connected infrastructure (Gateways, Listeners, policies). Cross-namespace connections are preserved.',
              )}
            >
              <button
                type="button"
                aria-label={t('Namespace filter help')}
                onClick={(e) => e.preventDefault()}
                className="pf-v6-c-button pf-m-plain"
                style={{ padding: '0 var(--pf-v6-global--spacer--sm)' }}
              >
                <HelpIcon />
              </button>
            </Popover>
          </ToolbarItem>
        )}
      </ToolbarContent>
    </Toolbar>
  );
};
