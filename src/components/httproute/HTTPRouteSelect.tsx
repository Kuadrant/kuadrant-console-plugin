import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import {
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  MenuToggle,
  Menu,
  MenuContent,
  MenuList,
  MenuItem,
  Divider,
  MenuContainer,
} from '@patternfly/react-core';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { RESOURCES, ResourceKind } from '../../utils/resources';

export type RouteKind = 'HTTPRoute' | 'GRPCRoute';

interface HTTPRouteSelectProps {
  selectedRoute: { name: string; namespace: string };
  onChange: (route: { name: string; namespace: string }) => void;
  // policy's target namespace - a route from a different namespace can never
  // be saved (targetRef has no namespace field), so the list must be scoped
  // to this namespace rather than watching the whole cluster
  namespace: string;
  isDisabled?: boolean;
  kind?: RouteKind;
  hideLabel?: boolean;
}

const HTTPRouteSelect: React.FC<HTTPRouteSelectProps> = ({
  selectedRoute,
  onChange,
  namespace,
  isDisabled = false,
  kind = 'HTTPRoute',
  hideLabel = false,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const navigate = useNavigate();
  const [routes, setRoutes] = React.useState<Array<{ name: string; namespace: string }>>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const toggleRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const resourceKey = kind as ResourceKind;
  const gvk = RESOURCES[resourceKey].gvk;
  const isAllNamespaces = !namespace || namespace === '#ALL_NS#';

  // Map #ALL_NS# sentinel to undefined for cluster-wide watch
  const resolvedNamespace = isAllNamespaces ? undefined : namespace;

  const routeResource = isAllNamespaces
    ? null
    : {
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
    } else if (isAllNamespaces) {
      setRoutes([]);
    }
  }, [routeData, routeLoaded, routeError, isAllNamespaces]);

  // A route selected in one namespace is never valid in another - the watch
  // above re-scopes automatically, but the controlled selection must be
  // cleared too or the old name gets silently resubmitted against the new
  // namespace's route list.
  const prevNamespaceRef = React.useRef(namespace);
  React.useEffect(() => {
    if (prevNamespaceRef.current !== namespace) {
      prevNamespaceRef.current = namespace;
      if (!isDisabled && selectedRoute.name) {
        onChange({ name: '', namespace: '' });
      }
    }
  }, [namespace]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleSelect = (_event: React.MouseEvent | undefined, itemId: string | number) => {
    if (itemId === 'create-new') {
      // Action item clicked - create-new MenuItem's onClick handles navigation
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

  const selectId = `${kind.toLowerCase()}-select`;
  const selectLabel = kind === 'GRPCRoute' ? t('Select a GRPCRoute') : t('Select an HTTPRoute');
  const emptyLabel =
    kind === 'GRPCRoute' ? t('No GRPCRoutes available') : t('No HTTPRoutes available');
  const createNewLabel =
    kind === 'GRPCRoute' ? t('Create new GRPCRoute') : t('Create new HTTPRoute');

  const selectedLabel =
    selectedRoute.name && selectedRoute.namespace
      ? `${selectedRoute.namespace}/${selectedRoute.name}`
      : selectLabel;

  const menuContainer = (
    <MenuContainer
      isOpen={isOpen}
      onOpenChange={(open) => setIsOpen(open)}
      toggleRef={toggleRef}
      menuRef={menuRef}
      toggle={
        <MenuToggle
          ref={toggleRef}
          id={selectId}
          onClick={handleToggle}
          isExpanded={isOpen}
          isDisabled={isDisabled || isAllNamespaces}
          style={{ width: '100%' }}
        >
          {selectedLabel}
        </MenuToggle>
      }
      menu={
        <Menu
          ref={menuRef}
          onSelect={handleSelect}
          selected={`${selectedRoute.namespace}/${selectedRoute.name}`}
        >
          <MenuContent>
            <MenuList>
              {routes.length === 0 ? (
                <MenuItem isDisabled>{emptyLabel}</MenuItem>
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
                isDisabled={!resolvedNamespace}
                onClick={() => {
                  if (!resolvedNamespace) return;
                  navigate(
                    `/k8s/ns/${resolvedNamespace}/${gvk.group}~${gvk.version}~${gvk.kind}/~new`,
                  );
                  setIsOpen(false);
                }}
                description={!resolvedNamespace ? t('Select a namespace first') : undefined}
              >
                {createNewLabel}
              </MenuItem>
            </MenuList>
          </MenuContent>
        </Menu>
      }
    />
  );

  if (hideLabel) {
    return menuContainer;
  }

  return (
    <FormGroup
      label={
        kind === 'GRPCRoute' ? t('GRPC Route Target Reference') : t('HTTP Route Target Reference')
      }
      isRequired
      fieldId={selectId}
    >
      {menuContainer}
      <FormHelperText>
        <HelperText>
          <HelperTextItem variant={isAllNamespaces ? 'warning' : 'default'}>
            {isAllNamespaces
              ? t('Select a specific namespace to choose a {{kind}}', { kind })
              : kind === 'GRPCRoute'
              ? t('GRPCRoute: Reference to a Kubernetes resource that the policy attaches to.')
              : t('HTTPRoute: Reference to a Kubernetes resource that the policy attaches to.')}
          </HelperTextItem>
        </HelperText>
      </FormHelperText>
    </FormGroup>
  );
};

export default HTTPRouteSelect;
