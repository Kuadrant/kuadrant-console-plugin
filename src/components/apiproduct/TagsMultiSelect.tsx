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

  // Predefined common tags
  const commonTags = ['public', 'internal', 'beta', 'v1', 'v2', 'deprecated'];

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
      const newTag = searchValue.trim();
      if (!selectedTags.includes(newTag)) {
        onChange([...selectedTags, newTag]);
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
        <Menu onSelect={(_event, itemId) => handleSelect(itemId as string)}>
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
