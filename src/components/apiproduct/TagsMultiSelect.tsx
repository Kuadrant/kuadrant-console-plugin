import {
  MenuToggle,
  Menu,
  MenuContent,
  MenuList,
  MenuItem,
  SearchInput,
  Divider,
  LabelGroup,
  Label,
} from '@patternfly/react-core';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

interface TagsMultiSelectProps {
  selectedTags: string[];
  onChange: (tags: string[]) => void;
}

const TagsMultiSelect: React.FC<TagsMultiSelectProps> = ({ selectedTags, onChange }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState('');
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Predefined common tags
  const commonTags = ['public', 'internal', 'beta', 'v1', 'v2', 'deprecated'];

  // Close menu on outside click
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleSelect = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onChange(selectedTags.filter((t) => t !== tag));
    } else {
      onChange([...selectedTags, tag]);
    }
  };

  const handleSearchChange = (_event: React.FormEvent<HTMLInputElement>, value: string) => {
    setSearchValue(value);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && searchValue.trim() !== '') {
      event.preventDefault();
      event.stopPropagation();

      // Check if there's a matching tag in the filtered list
      const matchingTag = filteredTags.find(
        (tag) => tag.toLowerCase() === searchValue.trim().toLowerCase(),
      );

      const tagToAdd = matchingTag || searchValue.trim();
      const tagLower = tagToAdd.toLowerCase();

      // Case-insensitive duplicate check
      if (!selectedTags.some((t) => t.toLowerCase() === tagLower)) {
        onChange([...selectedTags, tagToAdd]);
      }
      setSearchValue('');
    }
  };

  const filteredTags = commonTags.filter((tag) =>
    tag.toLowerCase().includes(searchValue.toLowerCase()),
  );

  const handleRemoveTag = (tagToRemove: string) => {
    onChange(selectedTags.filter((tag) => tag !== tagToRemove));
  };

  return (
    <>
      <MenuToggle onClick={handleToggle} isExpanded={isOpen}>
        {selectedTags.length === 0
          ? t('Select tags')
          : t('{{count}} tags selected', { count: selectedTags.length })}
      </MenuToggle>
      {isOpen && (
        <Menu ref={menuRef} onSelect={(_event, itemId) => handleSelect(itemId as string)}>
          <MenuContent>
            <SearchInput
              value={searchValue}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              placeholder={t('Search or create tag')}
              style={{ padding: '8px' }}
            />
            <Divider />
            <MenuList>
              {filteredTags.length > 0 ? (
                filteredTags.map((tag) => (
                  <MenuItem key={tag} itemId={tag} isSelected={selectedTags.includes(tag)}>
                    {tag}
                  </MenuItem>
                ))
              ) : (
                <MenuItem isDisabled>
                  {searchValue
                    ? t('Press Enter to create "{{tag}}"', { tag: searchValue })
                    : t('Type to search or create tags')}
                </MenuItem>
              )}
            </MenuList>
          </MenuContent>
        </Menu>
      )}
      {selectedTags.length > 0 && (
        <LabelGroup style={{ marginTop: '8px' }}>
          {selectedTags.map((tag) => (
            <Label key={tag} color="blue" onClose={() => handleRemoveTag(tag)}>
              {tag}
            </Label>
          ))}
        </LabelGroup>
      )}
    </>
  );
};

export default TagsMultiSelect;
