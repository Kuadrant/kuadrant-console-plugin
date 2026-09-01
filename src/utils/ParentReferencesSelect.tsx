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
}

const ParentReferencesSelect: React.FC<ParentReferencesSelectProps> = ({
  parentRefs,
  onChange,
  isDisabled = false,
  extraGateways = [],
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [availableGateways, setAvailableGateways] = React.useState<GatewayForSelect[]>([]);
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

  React.useEffect(() => {
    const watched = gatewayLoaded && !gatewayError && Array.isArray(gatewayData) ? gatewayData : [];
    // Merge in any draft Gateways, deduped by namespace/name. A real Gateway from
    // the watch takes precedence over a draft with the same key.
    const keyOf = (gw: GatewayForSelect) => `${gw.metadata?.namespace}/${gw.metadata?.name}`;
    const watchedKeys = new Set(watched.map(keyOf));
    const drafts = extraGateways.filter((gw) => !watchedKeys.has(keyOf(gw)));
    setAvailableGateways([...watched, ...drafts]);
  }, [gatewayData, gatewayLoaded, gatewayError, extraGateways]);

  // Reconcile parentRefs against the available Gateways when draft Gateways are in
  // play (wizard context only). If a selected Gateway disappears — e.g. a draft
  // Gateway is renamed in an earlier wizard step — clear the stale selection so the
  // form can't emit an HTTPRoute pointing at a Gateway that no longer exists.
  // Gated on extraGateways so the standalone Create/Edit HTTPRoute page is untouched.
  React.useEffect(() => {
    if (extraGateways.length === 0 || !gatewayLoaded) return;
    const validNames = new Set(availableGateways.map((gw) => gw.metadata?.name));
    let changed = false;
    const reconciled = parentRefs.map((ref) => {
      if (ref.gatewayName && !validNames.has(ref.gatewayName)) {
        changed = true;
        return { ...ref, gatewayName: '', gatewayNamespace: '', sectionName: '', port: 0 };
      }
      return ref;
    });
    if (changed) onChange(reconciled);
  }, [availableGateways, gatewayLoaded, extraGateways.length, parentRefs, onChange]);

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
    return [...availableGateways].sort((a, b) => {
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

  // Update parent reference
  const updateParentReference = (
    id: string,
    field: keyof ParentReference,
    value: string | number,
  ) => {
    const updatedRefs = parentRefs.map((ref) => {
      if (ref.id === id) {
        const updatedRef = { ...ref, [field]: value };

        // If Gateway is changed, automatically update namespace and reset section
        if (field === 'gatewayName') {
          const selectedGateway = availableGateways.find((gw) => gw.metadata.name === value);
          if (selectedGateway) {
            updatedRef.gatewayNamespace = selectedGateway.metadata.namespace;
            updatedRef.sectionName = '';
            updatedRef.port = 80;
          }
        }

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
      label={
        <span>
          {t('Parent references')}{' '}
          <span style={{ color: 'var(--pf-v6-global--danger-color--100)' }}>*</span>
        </span>
      }
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
                    value={parentRef.gatewayName}
                    onChange={(_, value) =>
                      updateParentReference(parentRef.id, 'gatewayName', value)
                    }
                    aria-label={t('Select Gateway')}
                    isDisabled={isDisabled}
                  >
                    <FormSelectOption key="empty" value="" label={t('Select Gateway')} />
                    {getSortedGateways().map((gateway) => {
                      const restriction = validateGateway(gateway);

                      return (
                        <FormSelectOption
                          key={`${gateway.metadata.name}-${gateway.metadata.namespace}`}
                          value={gateway.metadata.name}
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
