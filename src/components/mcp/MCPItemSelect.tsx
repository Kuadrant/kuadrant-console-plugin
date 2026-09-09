import * as React from 'react';
import {
  Button,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
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

// typeahead over tools or prompts, each option subtitled with its server
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
  // inputValue is what the toggle shows, filterValue only what was typed
  const [inputValue, setInputValue] = React.useState(selectedName);
  const [filterValue, setFilterValue] = React.useState('');
  const [focusedIndex, setFocusedIndex] = React.useState<number | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setInputValue(selectedName);
    setFilterValue('');
    setFocusedIndex(null);
  }, [selectedName]);

  const term = filterValue.trim().toLowerCase();
  const filtered = items.filter(
    (item) =>
      !term ||
      item.name.toLowerCase().includes(term) ||
      (item.description ?? '').toLowerCase().includes(term),
  );

  const choose = (item: MCPSelectableItem) => {
    setInputValue(item.name);
    setFilterValue('');
    setFocusedIndex(null);
    setIsOpen(false);
    onSelect(item.name);
  };

  const clear = () => {
    setInputValue('');
    setFilterValue('');
    setFocusedIndex(null);
    onClear();
    inputRef.current?.focus();
  };

  const onToggleClick = () => {
    setIsOpen((open) => !open);
    inputRef.current?.focus();
  };

  const onInputChange = (_event: React.FormEvent<HTMLInputElement>, value: string) => {
    setInputValue(value);
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
        break;
      default:
        break;
    }
  };

  const toggle = (toggleRef: React.Ref<HTMLButtonElement>) => (
    <MenuToggle
      ref={toggleRef}
      variant="typeahead"
      onClick={onToggleClick}
      isExpanded={isOpen}
      isFullWidth
      aria-label={toggleLabel}
    >
      <TextInputGroup isPlain>
        <TextInputGroupMain
          value={inputValue}
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
        {inputValue && (
          <TextInputGroupUtilities>
            <Button
              variant="plain"
              onClick={clear}
              aria-label={clearLabel}
              icon={<TimesIcon aria-hidden="true" />}
            />
          </TextInputGroupUtilities>
        )}
      </TextInputGroup>
    </MenuToggle>
  );

  return (
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
      toggle={toggle}
      shouldFocusFirstItemOnOpen={false}
      isScrollable
      maxMenuHeight="18rem"
    >
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
  );
};

export default MCPItemSelect;
