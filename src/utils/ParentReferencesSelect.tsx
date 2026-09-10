import * as React from 'react';
import {
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  FormSelect,
  FormSelectOption,
  TextInput,
  Button,
  ButtonVariant,
  Alert,
  AlertVariant,
  FormFieldGroupExpandable,
  FormFieldGroupHeader,
} from '@patternfly/react-core';
import { PlusCircleIcon, TrashIcon } from '@patternfly/react-icons';
import { useTranslation } from 'react-i18next';
import {
  useK8sWatchResource,
  useActiveNamespace,
  K8sResourceCommon,
} from '@openshift-console/dynamic-plugin-sdk';

export interface GatewayForSelect extends K8sResourceCommon {
  spec?: {
    listeners?: Array<{
      name: string;
      port: number;
      protocol: string;
      allowedRoutes?: {
        namespaces?: {
          from?: 'All' | 'Same' | 'Selector';
        };
        kinds?: Array<{
          group?: string;
          kind: string;
        }>;
      };
    }>;
  };
  status?: {
    conditions?: Array<{
      type: string;
      status: string;
    }>;
    listeners?: Array<{
      name: string;
      conditions?: Array<{
        type: string;
        status: string;
      }>;
    }>;
  };
}

interface ParentReference {
  id: string;
  gatewayName: string;
  gatewayNamespace: string;
  sectionName: string;
  port: number;
}

interface ParentReferencesSelectProps {
  parentRefs: ParentReference[];
  onChange: (parentRefs: ParentReference[]) => void;
  isDisabled?: boolean;
  // Additional Gateways to include in the selector that aren't yet persisted in
  // the cluster (e.g. a draft Gateway defined earlier in a wizard). Merged with
  // the live watch results, deduped by namespace/name (real Gateways win).
  extraGateways?: GatewayForSelect[];
  // Enable reconciliation of parentRefs against the available Gateways (wizard
  // context only). When a selected Gateway or listener changes upstream — e.g. a
  // draft Gateway from an earlier wizard step is renamed, removed, or has its
  // listeners edited — stale selections are cleared/refreshed. Kept off by default
  // so the standalone Create/Edit HTTPRoute page is untouched. This is an explicit
  // flag rather than `extraGateways.length` so reconciliation still runs when the
  // wizard removes its last draft Gateway.
  reconcileParentRefs?: boolean;
  // Optional predicate to restrict which Gateways are offered in the dropdown.
  // Used e.g. by the MCP overview to suggest only MCP-enabled Gateways.
  gatewayFilter?: (gateway: GatewayForSelect) => boolean;
}

const ParentReferencesSelect: React.FC<ParentReferencesSelectProps> = ({
  parentRefs,
  onChange,
  isDisabled = false,
  extraGateways,
  reconcileParentRefs = false,
  gatewayFilter,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  // Stabilize the optional prop reference. A default `[]` literal would be a new
  // array on every render, so the availableGateways memo below would recompute every
  // render, giving it a fresh reference that re-runs the reconcile effect each render.
  const stableExtraGateways = React.useMemo(() => extraGateways ?? [], [extraGateways]);
  const [activeNamespace] = useActiveNamespace();
  const isAllNamespaces = !activeNamespace || activeNamespace === '#ALL_NS#';
  const selectedNamespace = isAllNamespaces ? undefined : activeNamespace;

  // Load all available Gateways
  const gatewayResource = {
    groupVersionKind: {
      group: 'gateway.networking.k8s.io',
      version: 'v1',
      kind: 'Gateway',
    },
    isList: true,
  };

  const [gatewayData, gatewayLoaded, gatewayError] =
    useK8sWatchResource<GatewayForSelect[]>(gatewayResource);

  // Merge live watch results with any draft Gateways, deduped by namespace/name (a
  // real Gateway from the watch wins). Computed in render (not via state + effect) so
  // it always reflects the current watch synchronously. Otherwise, on the
  // loading→loaded transition, the reconcile effect below could run before a
  // setAvailableGateways update committed and see an empty list, wrongly clearing a
  // persisted parentRef that points at an existing Gateway.
  const availableGateways = React.useMemo<GatewayForSelect[]>(() => {
    const watched = gatewayLoaded && !gatewayError && Array.isArray(gatewayData) ? gatewayData : [];
    const keyOf = (gw: GatewayForSelect) => `${gw.metadata?.namespace}/${gw.metadata?.name}`;
    const watchedKeys = new Set(watched.map(keyOf));
    const drafts = stableExtraGateways.filter((gw) => !watchedKeys.has(keyOf(gw)));
    return [...watched, ...drafts];
  }, [gatewayData, gatewayLoaded, gatewayError, stableExtraGateways]);

  // Reconcile parentRefs against the available Gateways in wizard context. When a
  // draft Gateway from an earlier wizard step changes, stale selections are cleaned
  // up so the form can't emit an HTTPRoute pointing at a Gateway/listener that no
  // longer exists:
  //   - Gateway removed/renamed  → clear the whole selection.
  //   - listener removed         → clear sectionName and port.
  //   - listener port changed    → refresh port.
  // Gated on the explicit reconcileParentRefs flag so the standalone Create/Edit
  // HTTPRoute page is untouched, and so reconciliation still runs even when the
  // wizard has removed its last draft Gateway (draft list empty).
  // Skipped while gatewayError is present: on a transient API/watch failure the
  // merged list collapses to just the draft Gateways (or empty), and reconciling
  // against it would wrongly clear the user's existing selection. Preserve it until
  // the watch recovers.
  React.useEffect(() => {
    if (!reconcileParentRefs || !gatewayLoaded || gatewayError) return;
    let changed = false;
    const reconciled = parentRefs.map((ref) => {
      if (!ref.gatewayName) return ref;
      const gateway = availableGateways.find(
        (gw) =>
          gw.metadata?.name === ref.gatewayName && gw.metadata?.namespace === ref.gatewayNamespace,
      );
      // Gateway no longer available (removed or renamed) → clear the selection.
      if (!gateway) {
        changed = true;
        return { ...ref, gatewayName: '', gatewayNamespace: '', sectionName: '', port: 0 };
      }
      // Reconcile the selected listener against the current Gateway spec.
      if (ref.sectionName) {
        const listener = gateway.spec?.listeners?.find((l) => l.name === ref.sectionName);
        if (!listener) {
          changed = true;
          return { ...ref, sectionName: '', port: 0 };
        }
        if (listener.port !== ref.port) {
          changed = true;
          return { ...ref, port: listener.port };
        }
      }
      return ref;
    });
    if (changed) onChange(reconciled);
  }, [availableGateways, gatewayLoaded, gatewayError, reconcileParentRefs, parentRefs, onChange]);

  // Gateway validation function
  const validateGateway = (gateway: GatewayForSelect): string | null => {
    if (gateway.metadata?.deletionTimestamp) {
      return t('Gateway is terminating.');
    }

    const acceptedCondition = gateway.status?.conditions?.find((c) => c.type === 'Accepted');
    if (acceptedCondition && acceptedCondition.status !== 'True') {
      return t('Gateway is not accepted.');
    }

    const programmedCondition = gateway.status?.conditions?.find((c) => c.type === 'Programmed');
    if (programmedCondition && programmedCondition.status !== 'True') {
      return t('Gateway is not programmed.');
    }

    const supportsHTTPRoute = gateway.spec?.listeners?.some((listener) => {
      const allowedKinds = listener.allowedRoutes?.kinds;
      if (allowedKinds && allowedKinds.length > 0) {
        return allowedKinds.some(
          (kind) =>
            kind.kind === 'HTTPRoute' &&
            (kind.group === 'gateway.networking.k8s.io' || !kind.group),
        );
      }
      return listener.protocol === 'HTTP' || listener.protocol === 'HTTPS';
    });

    if (!supportsHTTPRoute) {
      return t('Only HTTPRoute is supported by this Gateway.');
    }

    const allowsFromNamespace = gateway.spec?.listeners?.some((listener) => {
      const namespacePolicy = listener.allowedRoutes?.namespaces?.from || 'Same';
      if (namespacePolicy === 'All') return true;
      if (isAllNamespaces) return true;
      return namespacePolicy === 'Same' && gateway.metadata?.namespace === selectedNamespace;
    });

    if (!allowsFromNamespace) {
      return t('Not allowed by Gateway settings.');
    }

    return null;
  };

  const validateListener = (gateway: GatewayForSelect, listenerName: string): string | null => {
    const gatewayValidation = validateGateway(gateway);
    if (gatewayValidation) return gatewayValidation;

    const listenerStatus = gateway.status?.listeners?.find((ls) => ls.name === listenerName);
    if (listenerStatus) {
      const accepted = listenerStatus.conditions?.find((c) => c.type === 'Accepted');
      if (accepted && accepted.status !== 'True') {
        return t('Listener is not accepted.');
      }
      const programmed = listenerStatus.conditions?.find((c) => c.type === 'Programmed');
      if (programmed && programmed.status !== 'True') {
        return t('Listener is not programmed.');
      }
    }

    return null;
  };

  // Sort Gateways: available first, then unavailable
  const getSortedGateways = () => {
    const gateways = gatewayFilter ? availableGateways.filter(gatewayFilter) : availableGateways;
    return [...gateways].sort((a, b) => {
      const restrictionA = validateGateway(a);
      const restrictionB = validateGateway(b);

      // Available (without restriction) first
      if (!restrictionA && restrictionB) return -1;
      if (restrictionA && !restrictionB) return 1;

      // Within each group, sort by name
      return a.metadata.name.localeCompare(b.metadata.name);
    });
  };

  // Sort Listeners
  const getSortedSections = (gatewayName: string, gatewayNamespace: string) => {
    const gateway = availableGateways.find(
      (gw) => gw.metadata.name === gatewayName && gw.metadata.namespace === gatewayNamespace,
    );

    if (!gateway) return [];

    return [...(gateway.spec.listeners || [])].sort((a, b) => {
      const restrictionA = validateListener(gateway, a.name);
      const restrictionB = validateListener(gateway, b.name);
      if (!restrictionA && restrictionB) return -1;
      if (restrictionA && !restrictionB) return 1;
      return a.name.localeCompare(b.name);
    });
  };

  // Add new parent reference
  const addParentReference = () => {
    const newParentRef: ParentReference = {
      id: `parent-ref-${Date.now()}`,
      gatewayName: '',
      gatewayNamespace: '',
      sectionName: '',
      port: 0,
    };
    onChange([...parentRefs, newParentRef]);
  };

  // Remove parent reference
  const removeParentReference = (id: string) => {
    const updatedRefs = parentRefs.filter((ref) => ref.id !== id);
    onChange(updatedRefs);
  };

  // Select a Gateway by its composite `namespace/name` key. Gateway names are not
  // unique across namespaces (a draft Gateway from an earlier wizard step can share a
  // name with a live Gateway elsewhere), so the option value carries both fields and
  // both are resolved together — resolving by name alone could write the wrong
  // namespace into the parentRef.
  const updateParentGateway = (id: string, gatewayKey: string) => {
    const selectedGateway = gatewayKey
      ? availableGateways.find(
          (gw) => `${gw.metadata?.namespace}/${gw.metadata?.name}` === gatewayKey,
        )
      : undefined;
    const updatedRefs = parentRefs.map((ref) => {
      if (ref.id !== id) return ref;
      // Empty selection or an unresolved key → clear the whole selection.
      if (!selectedGateway) {
        return { ...ref, gatewayName: '', gatewayNamespace: '', sectionName: '', port: 0 };
      }
      return {
        ...ref,
        gatewayName: selectedGateway.metadata.name,
        gatewayNamespace: selectedGateway.metadata.namespace,
        sectionName: '',
        port: 80,
      };
    });
    onChange(updatedRefs);
  };

  // Update parent reference
  const updateParentReference = (
    id: string,
    field: keyof ParentReference,
    value: string | number,
  ) => {
    const updatedRefs = parentRefs.map((ref) => {
      if (ref.id === id) {
        const updatedRef = { ...ref, [field]: value };

        // If Section is changed, update port
        if (field === 'sectionName') {
          const selectedGateway = availableGateways.find(
            (gw) =>
              gw.metadata.name === ref.gatewayName &&
              gw.metadata.namespace === ref.gatewayNamespace,
          );
          if (selectedGateway) {
            const listener = selectedGateway.spec.listeners?.find((l) => l.name === value);
            if (listener) {
              updatedRef.port = listener.port;
            }
          }
        }

        return updatedRef;
      }
      return ref;
    });
    onChange(updatedRefs);
  };

  // Validation check
  const hasValidParentRef = parentRefs.some((ref) => ref.gatewayName && ref.sectionName);

  return (
    <FormGroup
      label={t('Parent references')}
      isRequired
      fieldId={parentRefs[0] ? 'parent-gateway-0' : 'parent-references'}
    >
      {!hasValidParentRef && (
        <Alert
          variant={AlertVariant.warning}
          isInline
          title={t('At least one parent reference required for the HTTPRoute')}
          style={{ marginBottom: '16px' }}
        />
      )}

      {parentRefs.map((parentRef, index) => {
        const descriptionParts: string[] = [];
        if (parentRef.gatewayNamespace)
          descriptionParts.push(`${t('Namespace')}: ${parentRef.gatewayNamespace}`);
        if (parentRef.sectionName)
          descriptionParts.push(`${t('Section')}: ${parentRef.sectionName}`);
        if (parentRef.port) descriptionParts.push(`${t('Port')}: ${parentRef.port}`);
        const description = descriptionParts.length > 0 ? descriptionParts.join(' | ') : undefined;

        return (
          <FormFieldGroupExpandable
            key={parentRef.id}
            isExpanded
            toggleAriaLabel={t('Parent reference')}
            header={
              <FormFieldGroupHeader
                titleText={{
                  text: parentRef.gatewayName
                    ? `${parentRef.gatewayName}`
                    : `${t('Parent reference')}-${index + 1}`,
                  id: `parent-ref-${parentRef.id}`,
                }}
                titleDescription={description}
                actions={
                  !isDisabled && (
                    <Button
                      variant="plain"
                      onClick={() => removeParentReference(parentRef.id)}
                      aria-label={t('Remove parent reference')}
                      icon={<TrashIcon />}
                    />
                  )
                }
              />
            }
            style={{
              marginBottom: '16px',
              border: '1px solid var(--pf-t--global--border--color--default)',
              borderRadius: '4px',
            }}
          >
            <div style={{ paddingRight: '16px' }}>
              {/* Gateway selection */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '16px',
                  marginBottom: '16px',
                }}
              >
                <FormGroup label={t('Gateway name')} isRequired fieldId={`parent-gateway-${index}`}>
                  <FormSelect
                    id={`parent-gateway-${index}`}
                    value={
                      parentRef.gatewayName
                        ? `${parentRef.gatewayNamespace}/${parentRef.gatewayName}`
                        : ''
                    }
                    onChange={(_, value) => updateParentGateway(parentRef.id, value)}
                    aria-label={t('Select Gateway')}
                    isDisabled={isDisabled}
                  >
                    <FormSelectOption key="empty" value="" label={t('Select Gateway')} />
                    {getSortedGateways().map((gateway) => {
                      const restriction = validateGateway(gateway);
                      const gatewayKey = `${gateway.metadata.namespace}/${gateway.metadata.name}`;

                      return (
                        <FormSelectOption
                          key={gatewayKey}
                          value={gatewayKey}
                          label={
                            restriction
                              ? `${gateway.metadata.name} (${gateway.metadata.namespace}) — ${restriction}`
                              : `${gateway.metadata.name} (${gateway.metadata.namespace})`
                          }
                          isDisabled={!!restriction}
                        />
                      );
                    })}
                  </FormSelect>
                </FormGroup>

                <FormGroup label={t('Namespace')} fieldId={`gateway-namespace-${parentRef.id}`}>
                  <TextInput
                    type="text"
                    id={`gateway-namespace-${parentRef.id}`}
                    value={parentRef.gatewayNamespace}
                    placeholder={t('Gateway Namespace')}
                    isDisabled
                  />
                </FormGroup>
              </div>

              {/* Section and Port */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <FormGroup label={t('Section name')} fieldId={`parent-section-${index}`}>
                  <FormSelect
                    id={`parent-section-${index}`}
                    value={parentRef.sectionName}
                    onChange={(_, value) =>
                      updateParentReference(parentRef.id, 'sectionName', value)
                    }
                    aria-label={t('Select Section')}
                    isDisabled={isDisabled || !parentRef.gatewayName}
                  >
                    <FormSelectOption key="empty" value="" label={t('Select Section')} />
                    {getSortedSections(parentRef.gatewayName, parentRef.gatewayNamespace).map(
                      (listener) => {
                        const gateway = availableGateways.find(
                          (gw) =>
                            gw.metadata.name === parentRef.gatewayName &&
                            gw.metadata.namespace === parentRef.gatewayNamespace,
                        );
                        const restriction = gateway
                          ? validateListener(gateway, listener.name)
                          : null;

                        return (
                          <FormSelectOption
                            key={listener.name}
                            value={listener.name}
                            label={
                              restriction
                                ? `${listener.name} (${listener.protocol}) — ${restriction}`
                                : `${listener.name} (${listener.protocol})`
                            }
                            isDisabled={!!restriction}
                          />
                        );
                      },
                    )}
                  </FormSelect>
                </FormGroup>

                <FormGroup label={t('Port')} fieldId={`port-${parentRef.id}`}>
                  <TextInput
                    type="number"
                    id={`port-${parentRef.id}`}
                    value={parentRef.port.toString()}
                    isDisabled
                  />
                </FormGroup>
              </div>
            </div>
          </FormFieldGroupExpandable>
        );
      })}

      {/* Add button */}
      {!isDisabled && (
        <Button
          variant={ButtonVariant.link}
          icon={<PlusCircleIcon />}
          onClick={addParentReference}
          isInline
          isDisabled={
            parentRefs.length > 0 &&
            (!parentRefs[parentRefs.length - 1]?.gatewayName ||
              !parentRefs[parentRefs.length - 1]?.sectionName)
          }
        >
          {t('Add parent reference')}
        </Button>
      )}

      <FormHelperText>
        <HelperText>
          <HelperTextItem>
            {t('Specifies the Gateway(s) this route should attach to.')}
          </HelperTextItem>
        </HelperText>
      </FormHelperText>
    </FormGroup>
  );
};

export default ParentReferencesSelect;
