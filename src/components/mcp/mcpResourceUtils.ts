// Shared helpers for building and parsing MCP resources across the setup wizard
// and the standalone create/edit pages.

import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import {
  MCPWizardFormState,
  MCPGatewayExtension,
  MCPServerRegistration,
  MCPServerFormState,
} from './types';
import { RESOURCES } from '../../utils/resources';

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
    },
    prefix: formState.toolPrefix,
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
