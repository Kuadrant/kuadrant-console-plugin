// Shared helpers for building and parsing MCP resources across the setup wizard
// and the standalone create/edit pages.

import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import {
  MCPWizardFormState,
  MCPGatewayExtension,
  MCPServerRegistration,
  MCPServerFormState,
  ServiceEntry,
  ServiceEntryFormState,
  DestinationRule,
  DestinationRuleFormState,
  CredentialFormState,
} from './types';
import { HTTPRouteResource } from '../httproute/types';
import { RESOURCES, Secret } from '../../utils/resources';

// Key used within the credential Secret's stringData for the token configured in
// step 4 (Add access credentials) of the external MCP wizard.
export const CREDENTIAL_SECRET_KEY = 'token';

export const parseServiceEntryHosts = (hosts: string): string[] =>
  hosts
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);

// Build an MCPGatewayExtension resource from wizard/page form state.
// When originalMetadata is provided (edit mode) it is preserved so that
// k8sUpdate keeps the resourceVersion and other server-managed fields.
export const buildMCPGatewayExtension = (
  formState: MCPWizardFormState,
  namespace: string,
  originalMetadata?: MCPGatewayExtension['metadata'] | null,
): MCPGatewayExtension => {
  const extensionNamespace = formState.extensionNamespace || namespace;
  const gatewayNamespace = formState.selectedGatewayNamespace || extensionNamespace;

  const resource: MCPGatewayExtension = {
    apiVersion: 'mcp.kuadrant.io/v1',
    kind: 'MCPGatewayExtension',
    metadata: originalMetadata
      ? { ...originalMetadata, name: formState.extensionName }
      : { name: formState.extensionName, namespace: extensionNamespace },
    spec: {
      targetRef: {
        group: 'gateway.networking.k8s.io',
        kind: 'Gateway',
        name: formState.targetGateway,
        namespace: gatewayNamespace,
        sectionName: formState.sectionName,
      },
    },
  };

  if (formState.overrideHostnames) {
    if (formState.publicHost) resource.spec.publicHost = formState.publicHost;
    if (formState.privateHost) resource.spec.privateHost = formState.privateHost;
  }
  if (formState.sessionStorageEnabled && formState.sessionStoreSecretName) {
    resource.spec.sessionStore = { secretName: formState.sessionStoreSecretName };
  }
  if (formState.oauthEnabled && formState.oauthAuthorizationServers) {
    resource.spec.oauthProtectedResource = {
      authorizationServers: formState.oauthAuthorizationServers
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      ...(formState.oauthResourceName ? { resourceName: formState.oauthResourceName } : {}),
    };
  }

  return resource;
};

// Reverse of buildMCPGatewayExtension — populate form state from an existing resource.
export const mcpExtensionToFormState = (
  resource: MCPGatewayExtension,
  namespace: string,
): Partial<MCPWizardFormState> => {
  const spec = resource.spec || ({} as MCPGatewayExtension['spec']);
  const hasPublicHost = !!spec.publicHost;
  const hasPrivateHost = !!spec.privateHost;
  const hasSessionStore = !!spec.sessionStore?.secretName;
  const hasOauth = !!spec.oauthProtectedResource?.authorizationServers?.length;

  return {
    extensionName: resource.metadata?.name || '',
    extensionNamespace: resource.metadata?.namespace || namespace,
    targetGateway: spec.targetRef?.name || '',
    selectedGatewayNamespace:
      spec.targetRef?.namespace || resource.metadata?.namespace || namespace,
    sectionName: spec.targetRef?.sectionName || '',
    overrideHostnames: hasPublicHost || hasPrivateHost,
    publicHost: spec.publicHost || '',
    privateHost: spec.privateHost || '',
    sessionStorageEnabled: hasSessionStore,
    sessionStoreSecretName: spec.sessionStore?.secretName || '',
    oauthEnabled: hasOauth,
    oauthAuthorizationServers: spec.oauthProtectedResource?.authorizationServers?.join(', ') || '',
    oauthResourceName: spec.oauthProtectedResource?.resourceName || '',
  };
};

// Validation shared by the wizard step footer and the standalone create/edit page.
export const isMCPGatewayExtensionValid = (formState: MCPWizardFormState): boolean =>
  !!formState.extensionName.trim() &&
  !!formState.targetGateway.trim() &&
  !!formState.sectionName.trim() &&
  (!formState.sessionStorageEnabled || !!formState.sessionStoreSecretName.trim()) &&
  (!formState.oauthEnabled || !!formState.oauthAuthorizationServers.trim());

// Build an MCPServerRegistration resource from wizard/page form state.
// When originalMetadata is provided (edit mode) it is preserved so that
// k8sUpdate keeps the resourceVersion and other server-managed fields.
// routeNameFallback covers the wizard's YAML preview, where the route chosen in an
// earlier step may not yet be synced into formState.targetHTTPRouteName.
export const buildMCPServerRegistration = (
  formState: MCPServerFormState,
  namespace: string,
  originalMetadata?: MCPServerRegistration['metadata'] | null,
  routeNameFallback?: string,
  routeNamespace?: string,
  credentialName?: string,
): MCPServerRegistration => ({
  apiVersion: `${RESOURCES.MCPServerRegistration.gvk.group}/${RESOURCES.MCPServerRegistration.gvk.version}`,
  kind: RESOURCES.MCPServerRegistration.gvk.kind,
  metadata: originalMetadata
    ? { ...originalMetadata, name: formState.registrationName }
    : { name: formState.registrationName, namespace: formState.namespace || namespace },
  spec: {
    targetRef: {
      group: 'gateway.networking.k8s.io',
      kind: 'HTTPRoute',
      name: formState.targetHTTPRouteName || routeNameFallback || '',
      ...(routeNamespace ? { namespace: routeNamespace } : {}),
    },
    prefix: formState.toolPrefix,
    ...(credentialName
      ? { credentialRef: { name: credentialName, key: CREDENTIAL_SECRET_KEY } }
      : {}),
  },
});

export const wireHTTPRouteToExternalHost = (
  resource: HTTPRouteResource,
  host: string,
  port: number,
): HTTPRouteResource => ({
  ...resource,
  spec: {
    ...resource.spec,
    rules: resource.spec?.rules?.map((rule) => ({
      ...rule,
      backendRefs: [{ group: 'networking.istio.io', kind: 'Hostname', name: host, port }],
    })),
  },
});

// Reverse of buildMCPServerRegistration — populate form state from an existing resource.
export const mcpServerToFormState = (
  resource: MCPServerRegistration,
  namespace: string,
): MCPServerFormState => {
  const spec = resource.spec || ({} as MCPServerRegistration['spec']);
  return {
    registrationName: resource.metadata?.name || '',
    namespace: resource.metadata?.namespace || namespace,
    targetHTTPRouteName: spec.targetRef?.name || '',
    toolPrefix: spec.prefix || '',
  };
};

// Validation shared by the registration wizard step and the standalone create/edit page.
// Mirrors the required-field markings in the form (name, namespace, target HTTPRoute
// and tool prefix — the HTTPRoute target is required for a valid registration).
export const isMCPServerRegistrationValid = (formState: MCPServerFormState): boolean =>
  !!formState.registrationName.trim() &&
  !!formState.namespace.trim() &&
  !!formState.targetHTTPRouteName.trim() &&
  !!formState.toolPrefix.trim();

// Build an Istio ServiceEntry resource from the external MCP wizard's step 1 form state.
// When originalMetadata is provided (edit mode) it is preserved so that
// k8sUpdate keeps the resourceVersion and other server-managed fields.
export const buildServiceEntry = (
  formState: ServiceEntryFormState,
  namespace: string,
  originalMetadata?: ServiceEntry['metadata'] | null,
): ServiceEntry => ({
  apiVersion: `${RESOURCES.ServiceEntry.gvk.group}/${RESOURCES.ServiceEntry.gvk.version}`,
  kind: RESOURCES.ServiceEntry.gvk.kind,
  metadata: originalMetadata
    ? { ...originalMetadata, name: formState.serviceName }
    : { name: formState.serviceName, namespace: formState.namespace || namespace },
  spec: {
    hosts: parseServiceEntryHosts(formState.hosts),
    ports: formState.port
      ? [
          {
            number: Number(formState.port),
            protocol: formState.protocol,
            name: `${formState.protocol.toLowerCase()}-${formState.port}`,
          },
        ]
      : [],
    location: formState.location,
    resolution: formState.resolution,
  },
});

// Reverse of buildServiceEntry — populate form state from an existing resource.
export const serviceEntryToFormState = (
  resource: ServiceEntry,
  namespace: string,
): ServiceEntryFormState => {
  const spec = resource.spec || ({} as ServiceEntry['spec']);
  const port = spec.ports?.[0];
  return {
    serviceName: resource.metadata?.name || '',
    namespace: resource.metadata?.namespace || namespace,
    hosts: (spec.hosts || []).join(', '),
    port: port ? String(port.number) : '',
    protocol: port?.protocol || 'HTTPS',
    location: spec.location || 'MESH_EXTERNAL',
    resolution: spec.resolution || 'DNS',
  };
};

// Validation shared by the wizard step footer and the standalone create/edit page.
export const isServiceEntryValid = (formState: ServiceEntryFormState): boolean => {
  // At least one non-empty host once split/trimmed (rejects "", ",," etc.).
  const hasHost = parseServiceEntryHosts(formState.hosts).length > 0;

  // Port must be an integer in the valid TCP range; rejects "abc", "0", "70000".
  const portNum = Number(formState.port);
  const hasValidPort =
    formState.port.trim() !== '' && Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535;

  return (
    !!formState.serviceName.trim() &&
    !!formState.namespace.trim() &&
    hasHost &&
    hasValidPort &&
    !!formState.protocol.trim() &&
    !!formState.location.trim() &&
    !!formState.resolution.trim()
  );
};

// Build an Istio DestinationRule resource from the external MCP wizard's step 2 form state.
// When originalMetadata is provided (edit mode) it is preserved so that
// k8sUpdate keeps the resourceVersion and other server-managed fields.
export const buildDestinationRule = (
  formState: DestinationRuleFormState,
  namespace: string,
  originalMetadata?: DestinationRule['metadata'] | null,
): DestinationRule => ({
  apiVersion: `${RESOURCES.DestinationRule.gvk.group}/${RESOURCES.DestinationRule.gvk.version}`,
  kind: RESOURCES.DestinationRule.gvk.kind,
  metadata: originalMetadata
    ? { ...originalMetadata, name: formState.destinationName }
    : { name: formState.destinationName, namespace: formState.namespace || namespace },
  spec: {
    host: formState.host,
    trafficPolicy: {
      tls: {
        mode: formState.tlsMode,
        ...(formState.tlsMode !== 'DISABLE' && formState.tlsSni ? { sni: formState.tlsSni } : {}),
      },
    },
  },
});

// Reverse of buildDestinationRule — populate form state from an existing resource.
export const destinationRuleToFormState = (
  resource: DestinationRule,
  namespace: string,
): DestinationRuleFormState => {
  const spec = resource.spec || ({} as DestinationRule['spec']);
  const tls = spec.trafficPolicy?.tls;
  return {
    destinationName: resource.metadata?.name || '',
    namespace: resource.metadata?.namespace || namespace,
    host: spec.host || '',
    tlsMode: tls?.mode || 'SIMPLE',
    tlsSni: tls?.sni || '',
  };
};

// Validation shared by the wizard step footer and the standalone create/edit page.
export const isDestinationRuleValid = (formState: DestinationRuleFormState): boolean =>
  !!formState.destinationName.trim() &&
  !!formState.namespace.trim() &&
  !!formState.host.trim() &&
  !!formState.tlsMode.trim();

// Build a Kubernetes Secret resource from the external MCP wizard's step 4 form state.
// When originalMetadata is provided (edit mode) it is preserved so that
// k8sUpdate keeps the resourceVersion and other server-managed fields.
export const buildCredentialSecret = (
  formState: CredentialFormState,
  namespace: string,
  originalMetadata?: Secret['metadata'] | null,
): Secret => ({
  apiVersion: 'v1',
  kind: 'Secret',
  metadata: originalMetadata
    ? {
        ...originalMetadata,
        name: formState.credentialName,
        labels: { ...originalMetadata.labels, 'mcp.kuadrant.io/secret': 'true' },
      }
    : {
        name: formState.credentialName,
        namespace: formState.namespace || namespace,
        labels: { 'mcp.kuadrant.io/secret': 'true' },
      },
  type: formState.type,
  stringData: {
    [CREDENTIAL_SECRET_KEY]: formState.tokenString,
  },
});

// Reverse of buildCredentialSecret — populate form state from an existing resource.
// The token itself is never round-tripped back into the form (Secrets don't return
// stringData/data on read in a way that's safe to display), so it's left blank.
export const credentialSecretToFormState = (
  resource: Secret,
  namespace: string,
): CredentialFormState => ({
  credentialName: resource.metadata?.name || '',
  namespace: resource.metadata?.namespace || namespace,
  type: resource.type || 'Opaque',
  tokenString: '',
});

// Validation shared by the wizard step footer and the standalone create/edit page.
export const isCredentialValid = (formState: CredentialFormState): boolean =>
  !!formState.credentialName.trim() &&
  !!formState.namespace.trim() &&
  !!formState.type.trim() &&
  !!formState.tokenString.trim();

// Pre-populated MCPServerRegistration template for the YAML editor on the
// standalone create page.
export const buildMCPServerRegistrationTemplate = (
  namespace: string,
): MCPServerRegistration & K8sResourceCommon => ({
  apiVersion: 'mcp.kuadrant.io/v1',
  kind: 'MCPServerRegistration',
  metadata: {
    name: '',
    namespace,
  },
  spec: {
    targetRef: {
      group: 'gateway.networking.k8s.io',
      kind: 'HTTPRoute',
      name: '',
    },
    prefix: '',
  },
});
