import { useK8sWatchResource, useActiveNamespace } from '@openshift-console/dynamic-plugin-sdk';
import { MenuToggle, Menu, MenuContent, MenuList, MenuItem, Divider } from '@patternfly/react-core';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom-v5-compat';
import { RESOURCES } from '../../utils/resources';

interface HTTPRouteSelectProps {
  selectedRoute: { name: string; namespace: string };
  onChange: (route: { name: string; namespace: string }) => void;
  isDisabled?: boolean;
}

const HTTPRouteSelect: React.FC<HTTPRouteSelectProps> = ({
  selectedRoute,
  onChange,
  isDisabled = false,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const navigate = useNavigate();
  const [routes, setRoutes] = React.useState<Array<{ name: string; namespace: string }>>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeNamespace] = useActiveNamespace();
  const gvk = RESOURCES.HTTPRoute.gvk;

  // Map #ALL_NS# sentinel to undefined for cluster-wide watch
  const resolvedNamespace = activeNamespace === '#ALL_NS#' ? undefined : activeNamespace;

  const routeResource = {
    groupVersionKind: gvk,
    isList: true,
    namespace: resolvedNamespace,
  };

  const [routeData, routeLoaded, routeError] = useK8sWatchResource(routeResource);

  React.useEffect(() => {
    if (routeLoaded && !routeError && Array.isArray(routeData)) {
      setRoutes(
        routeData.map((route) => ({
          name: route.metadata.name,
          namespace: route.metadata.namespace,
        })),
      );
    }
  }, [routeData, routeLoaded, routeError]);

  const handleToggle = () => {
    if (!isDisabled) {
      setIsOpen(!isOpen);
    }
  };

  const handleSelect = (_event: React.MouseEvent | undefined, itemId: string | number) => {
    if (itemId === 'create-new') {
      // Action item clicked - don't close menu, ResourceLink will handle navigation
      return;
    }

    const value = itemId as string;
    if (!value || value === 'placeholder') {
      onChange({ name: '', namespace: '' });
    } else {
      const [namespace, name] = value.split('/');
      onChange({ name, namespace });
    }
    setIsOpen(false);
  };

  const selectedLabel =
    selectedRoute.name && selectedRoute.namespace
      ? `${selectedRoute.namespace}/${selectedRoute.name}`
      : t('Select an HTTPRoute');

  return (
    <>
      <MenuToggle
        id="httproute-select"
        onClick={handleToggle}
        isExpanded={isOpen}
        isDisabled={isDisabled}
        style={{ width: '100%' }}
      >
        {selectedLabel}
      </MenuToggle>
      {isOpen && (
        <Menu onSelect={handleSelect} selected={`${selectedRoute.namespace}/${selectedRoute.name}`}>
          <MenuContent>
            <MenuList>
              {routes.length === 0 ? (
                <MenuItem isDisabled>{t('No HTTPRoutes available')}</MenuItem>
              ) : (
                routes.map((route) => (
                  <MenuItem
                    key={`${route.namespace}/${route.name}`}
                    itemId={`${route.namespace}/${route.name}`}
                  >
                    {route.namespace}/{route.name}
                  </MenuItem>
                ))
              )}
              <Divider />
              <MenuItem
                itemId="create-new"
                onClick={() => {
                  const createNamespace = resolvedNamespace || 'default';
                  navigate(
                    `/k8s/ns/${createNamespace}/gateway.networking.k8s.io~v1~HTTPRoute/~new`,
                  );
                  setIsOpen(false);
                }}
              >
                {t('Create new HTTPRoute')}
              </MenuItem>
            </MenuList>
          </MenuContent>
        </Menu>
      )}
    </>
  );
};

export default HTTPRouteSelect;
