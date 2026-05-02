import * as React from 'react';
import { EllipsisVIcon } from '@patternfly/react-icons';
import {
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
} from '@patternfly/react-core';
import { useNavigate } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import type { BackendRow } from './GatewayBackendsPage';

interface BackendActionsMenuProps {
  backend: BackendRow;
}

const BackendActionsMenu: React.FC<BackendActionsMenuProps> = ({ backend }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = React.useState(false);

  if (backend.kind !== 'Service' && backend.kind !== undefined) {
    return null;
  }

  const onToggleClick = () => {
    setIsOpen((open) => !open);
  };

  const onViewService = () => {
    setIsOpen(false);
    navigate(`/k8s/ns/${backend.namespace}/core~v1~Service/${backend.name}`);
  };

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={(open: boolean) => setIsOpen(open)}
      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          aria-label={t('plugin__kuadrant-console-plugin~Backend actions menu')}
          variant="plain"
          onClick={onToggleClick}
          isExpanded={isOpen}
        >
          <EllipsisVIcon />
        </MenuToggle>
      )}
      shouldFocusToggleOnSelect
    >
      <DropdownList>
        <DropdownItem key="view-service" onClick={onViewService}>
          {t('View Service')}
        </DropdownItem>
      </DropdownList>
    </Dropdown>
  );
};

export default BackendActionsMenu;
