import * as React from 'react';
import {
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  LabelGroup,
  Label,
  Button,
  ToolbarItem,
  Badge,
  Select,
  SelectList,
  SelectOption,
  MenuToggle,
  MenuToggleElement,
  Popover,
} from '@patternfly/react-core';
import { HelpIcon, TimesCircleIcon } from '@patternfly/react-icons';
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

interface FilterLabelsProps {
  id: string;
  category: string;
  labels: string[];
  onDelete: (label: string) => void;
  onClear: () => void;
}

const FilterLabels: React.FC<FilterLabelsProps> = ({ id, category, labels, onDelete, onClear }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  if (labels.length === 0) {
    return null;
  }

  // Render the category ourselves to avoid PF 6.2's generated IDs colliding with the console.
  return (
    <ToolbarItem variant="label-group">
      <div className="pf-v6-c-label-group pf-m-category">
        <div className="pf-v6-c-label-group__main">
          <span id={id} className="pf-v6-c-label-group__label" aria-hidden="true">
            {category}
          </span>
          <LabelGroup aria-labelledby={id}>
            {labels.map((label) => (
              <Label key={label} variant="outline" onClose={() => onDelete(label)}>
                {label}
              </Label>
            ))}
          </LabelGroup>
        </div>
        <div className="pf-v6-c-label-group__close">
          <Button
            variant="plain"
            hasNoPadding
            aria-label={t('Close label group {{category}}', { category })}
            onClick={onClear}
            icon={<TimesCircleIcon />}
          />
        </div>
      </div>
    </ToolbarItem>
  );
};

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

  // Dedupe for label chips, badge count, and Select value.
  const uniqueSelectedResourceTypes = React.useMemo(
    () => [...new Set(selectedResourceTypes)],
    [selectedResourceTypes],
  );

  const handleSelect = (
    event: React.MouseEvent | React.ChangeEvent | undefined,
    selection: string,
  ) => {
    onSelect(event, selection);
  };

  const showNamespaceFilter = allNamespaces?.length > 0 && !!onNamespaceSelect;
  const namespaceLabels = showNamespaceFilter && selectedNamespace ? [selectedNamespace] : [];
  const filterCount = uniqueSelectedResourceTypes.length + namespaceLabels.length;

  return (
    <Toolbar id="resource-filter-toolbar" className="pf-m-toggle-group-container">
      <ToolbarContent>
        <ToolbarItem variant="label-group">
          <Select
            aria-label="Resource filter"
            role="menu"
            isOpen={isOpen}
            onOpenChange={setIsOpen}
            onSelect={handleSelect}
            selected={uniqueSelectedResourceTypes}
            toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
              <MenuToggle ref={toggleRef} onClick={() => setIsOpen(!isOpen)} isExpanded={isOpen}>
                Resource{' '}
                {uniqueSelectedResourceTypes.length > 0 && (
                  <Badge isRead>{uniqueSelectedResourceTypes.length}</Badge>
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
                  isSelected={uniqueSelectedResourceTypes.includes(type)}
                >
                  {type}
                </SelectOption>
              ))}
            </SelectList>
          </Select>
        </ToolbarItem>
        {showNamespaceFilter && (
          <ToolbarItem variant="label-group">
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
      {filterCount > 0 && (
        <div className="pf-v6-c-toolbar__content">
          <ToolbarGroup visibility={{ default: 'hidden', xl: 'visible' }}>
            <FilterLabels
              id="kuadrant-topology-resource-label"
              category={t('Resource')}
              labels={uniqueSelectedResourceTypes}
              onDelete={(label) => onDeleteFilter('Resource', label)}
              onClear={onDeleteGroup}
            />
            <FilterLabels
              id="kuadrant-topology-namespace-label"
              category={t('Namespace')}
              labels={namespaceLabels}
              onDelete={() => onDeleteNamespace?.()}
              onClear={() => onDeleteNamespace?.()}
            />
          </ToolbarGroup>
          <ToolbarGroup variant="action-group-inline">
            <ToolbarItem visibility={{ default: 'visible', xl: 'hidden' }}>
              {t('{{count}} filters applied', { count: filterCount })}
            </ToolbarItem>
            <ToolbarItem>
              <Button variant="link" isInline onClick={onClearAll}>
                {t('Reset Filters')}
              </Button>
            </ToolbarItem>
          </ToolbarGroup>
        </div>
      )}
    </Toolbar>
  );
};
