import * as React from 'react';
import {
  Button,
  MenuSearch,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  TextInputGroup,
  TextInputGroupMain,
} from '@patternfly/react-core';
import { TimesIcon } from '@patternfly/react-icons';

export interface MCPSelectableItem {
  name: string;
  description?: string;
}

interface MCPItemSelectProps {
  items: MCPSelectableItem[];
  selectedName: string;
  onSelect: (name: string) => void;
  onClear: () => void;
  serverNameFor?: (name: string) => string | undefined;
  idPrefix: string;
  searchLabel: string;
  toggleLabel: string;
  clearLabel: string;
  placeholder: string;
  emptyText: string;
}

// Searchable tools/prompts menu, each option subtitled with its server.
const MCPItemSelect: React.FC<MCPItemSelectProps> = ({
  items,
  selectedName,
  onSelect,
  onClear,
  serverNameFor,
  idPrefix,
  searchLabel,
  toggleLabel,
  clearLabel,
  placeholder,
  emptyText,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [filterValue, setFilterValue] = React.useState('');
  const [focusedIndex, setFocusedIndex] = React.useState<number | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const toggleRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    setFilterValue('');
    setFocusedIndex(null);
  }, [selectedName]);

  React.useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const term = filterValue.trim().toLowerCase();
  const filtered = items.filter(
    (item) =>
      !term ||
      item.name.toLowerCase().includes(term) ||
      (item.description ?? '').toLowerCase().includes(term),
  );

  const choose = (item: MCPSelectableItem) => {
    setFilterValue('');
    setFocusedIndex(null);
    setIsOpen(false);
    onSelect(item.name);
    toggleRef.current?.focus();
  };

  const clear = () => {
    setFilterValue('');
    setFocusedIndex(null);
    onClear();
    setIsOpen(false);
    toggleRef.current?.focus();
  };

  const onToggleClick = () => {
    setIsOpen((open) => !open);
    setFilterValue('');
    setFocusedIndex(null);
  };

  const onInputChange = (_event: React.FormEvent<HTMLInputElement>, value: string) => {
    setFilterValue(value);
    setFocusedIndex(null);
    setIsOpen(true);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'Enter': {
        event.preventDefault();
        const target = filtered[focusedIndex ?? 0];
        if (isOpen && target) {
          choose(target);
        } else {
          setIsOpen(true);
        }
        break;
      }
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        setIsOpen(true);
        if (filtered.length === 0) {
          break;
        }
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setFocusedIndex((current) => {
          const start = current ?? (step === 1 ? -1 : filtered.length);
          return (start + step + filtered.length) % filtered.length;
        });
        break;
      }
      case 'Escape':
        setIsOpen(false);
        toggleRef.current?.focus();
        break;
      default:
        break;
    }
  };

  const toggle = (
    <MenuToggle
      ref={toggleRef}
      onClick={onToggleClick}
      isExpanded={isOpen}
      isFullWidth
      aria-label={toggleLabel}
    >
      {selectedName || placeholder}
    </MenuToggle>
  );

  return (
    <div className="kuadrant-mcp-inspector-page__item-select">
      <Select
        id={`${idPrefix}-select`}
        isOpen={isOpen}
        selected={selectedName}
        onSelect={(_event, value) => {
          const item = items.find((candidate) => candidate.name === value);
          if (item) {
            choose(item);
          }
        }}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) {
            setFocusedIndex(null);
          }
        }}
        toggle={{ toggleNode: toggle, toggleRef }}
        shouldFocusFirstItemOnOpen={false}
        shouldFocusToggleOnSelect
        isScrollable
        maxMenuHeight="18rem"
      >
        <MenuSearch>
          <TextInputGroup>
            <TextInputGroupMain
              value={filterValue}
              onChange={onInputChange}
              onKeyDown={onInputKeyDown}
              id={`${idPrefix}-search`}
              autoComplete="off"
              innerRef={inputRef}
              placeholder={placeholder}
              role="combobox"
              isExpanded={isOpen}
              aria-controls={`${idPrefix}-options`}
              aria-label={searchLabel}
              {...(focusedIndex !== null && {
                'aria-activedescendant': `${idPrefix}-option-${focusedIndex}`,
              })}
            />
          </TextInputGroup>
        </MenuSearch>
        <SelectList id={`${idPrefix}-options`}>
          {filtered.map((item, index) => (
            <SelectOption
              key={item.name}
              id={`${idPrefix}-option-${index}`}
              value={item.name}
              description={serverNameFor?.(item.name)}
              isFocused={focusedIndex === index}
            >
              {item.name}
            </SelectOption>
          ))}
          {filtered.length === 0 && (
            <SelectOption value="" isDisabled>
              {emptyText}
            </SelectOption>
          )}
        </SelectList>
      </Select>
      {selectedName && (
        <Button
          variant="plain"
          onClick={clear}
          aria-label={clearLabel}
          icon={<TimesIcon aria-hidden="true" />}
        />
      )}
    </div>
  );
};

export default MCPItemSelect;
