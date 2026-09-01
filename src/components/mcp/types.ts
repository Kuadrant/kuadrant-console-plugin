import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import { Condition } from '../../utils/resources';

export interface MCPGatewayExtensionTargetRef {
  group?: string;
  kind?: string;
  name: string;
  namespace?: string;
  sectionName: string;
}

export interface MCPGatewayExtension extends K8sResourceCommon {
  spec: {
    targetRef: MCPGatewayExtensionTargetRef;
    publicHost?: string;
    privateHost?: string;
    backendPingIntervalSeconds?: number;
    httpRouteManagement?: 'Enabled' | 'Disabled';
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    urlElicitation?: 'Enabled' | 'Disabled';
    sessionStore?: {
      secretName: string;
    };
    oauthProtectedResource?: {
      authorizationServers: string[];
      resourceName?: string;
      resource?: string;
      bearerMethodsSupported?: string[];
      scopesSupported?: string[];
    };
    trustedHeadersKey?: {
      secretName: string;
      generate?: 'Enabled' | 'Disabled';
    };
    caCertBundleRef?: {
      name: string;
      key?: string;
    };
  };
  status?: {
    conditions?: Condition[];
  };
}

export interface MCPServerRegistrationTargetRef {
  group?: string;
  kind?: string;
  name: string;
  namespace?: string;
}

export interface MCPServerRegistration extends K8sResourceCommon {
  spec: {
    targetRef: MCPServerRegistrationTargetRef;
    prefix?: string;
    path?: string;
    state?: 'Enabled' | 'Disabled';
    category?: string[];
    hint?: string;
    tags?: string[];
    userSpecificList?: 'Enabled' | 'Disabled';
    credentialRef?: {
      name: string;
      key?: string;
    };
    caCertSecretRef?: {
      name: string;
      key?: string;
    };
    tokenURLElicitation?: {
      url?: string;
    };
  };
  status?: {
    conditions?: Condition[];
  };
}

// Setup wizard form state for Steps 1-2, consumed in Step 3 for resource creation
export interface MCPWizardFormState {
  // Step 1: Gateway
  gatewayMode: 'existing' | 'new';
  selectedGatewayName: string;
  selectedGatewayNamespace: string;
  newGatewayName: string;

  // Optional HTTPRoute step when automatic HTTPRoute management is disabled
  routeMode: 'existing' | 'new';
  selectedRouteName: string;
  selectedRouteNamespace: string;
  newRouteName: string;

  // MCP Extension
  extensionName: string;
  extensionNamespace: string;
  targetGateway: string;
  sectionName: string;

  // Step 2: Advanced broker settings
  overrideHostnames: boolean;
  publicHost: string;
  privateHost: string;
  sessionStorageEnabled: boolean;
  sessionStoreSecretName: string;
  oauthEnabled: boolean;
  oauthAuthorizationServers: string;
  oauthResourceName: string;
  httpRouteManagementEnabled: boolean;
}

export const initialFormState: MCPWizardFormState = {
  gatewayMode: 'existing',
  selectedGatewayName: '',
  selectedGatewayNamespace: '',
  newGatewayName: '',

  routeMode: 'existing',
  selectedRouteName: '',
  selectedRouteNamespace: '',
  newRouteName: '',

  extensionName: '',
  extensionNamespace: '',
  targetGateway: '',
  sectionName: '',

  overrideHostnames: false,
  publicHost: '',
  privateHost: '',
  sessionStorageEnabled: false,
  sessionStoreSecretName: '',
  oauthEnabled: false,
  oauthAuthorizationServers: '',
  oauthResourceName: '',
  httpRouteManagementEnabled: true,
};

// Registration wizard form state
export interface MCPServerFormState {
  registrationName: string;
  namespace: string;
  targetHTTPRouteName: string;
  toolPrefix: string;
}

export interface MCPRegistrationFormState {
  server: MCPServerFormState;
}

export const initialServerFormState: MCPServerFormState = {
  registrationName: '',
  namespace: '',
  targetHTTPRouteName: '',
  toolPrefix: '',
};

// Istio ServiceEntry, used by the external MCP server registration wizard to
// register a service running outside the mesh.
export interface ServiceEntry extends K8sResourceCommon {
  spec: {
    hosts: string[];
    ports: Array<{ number: number; protocol: string; name: string }>;
    location?: string;
    resolution?: string;
  };
}

// Step 1 (Create Service Entry) form state for the external MCP server registration wizard
export interface ServiceEntryFormState {
  serviceName: string;
  namespace: string;
  hosts: string;
  port: string;
  protocol: string;
  location: string;
  resolution: string;
}

export const initialServiceEntryFormState: ServiceEntryFormState = {
  serviceName: '',
  namespace: '',
  hosts: '',
  port: '',
  protocol: 'HTTPS',
  location: 'MESH_EXTERNAL',
  resolution: 'DNS',
};

// Istio DestinationRule, used by the external MCP server registration wizard to
// configure TLS to the external service registered by the ServiceEntry.
export interface DestinationRule extends K8sResourceCommon {
  spec: {
    host: string;
    trafficPolicy?: {
      tls?: {
        mode: string;
        sni?: string;
      };
    };
  };
}

// Step 2 (Create Destination Rule) form state for the external MCP server registration wizard
export interface DestinationRuleFormState {
  destinationName: string;
  namespace: string;
  host: string;
  tlsMode: string;
  tlsSni: string;
}

export const initialDestinationRuleFormState: DestinationRuleFormState = {
  destinationName: '',
  namespace: '',
  host: '',
  tlsMode: 'SIMPLE',
  tlsSni: '',
};

// Step 4 (Add access credentials) form state for the external MCP server registration
// wizard. Builds a Kubernetes Secret holding the token used to authenticate to the
// external service.
export interface CredentialFormState {
  credentialName: string;
  namespace: string;
  type: string;
  tokenString: string;
}

export const initialCredentialFormState: CredentialFormState = {
  credentialName: '',
  namespace: '',
  type: 'Opaque',
  tokenString: '',
};

// External MCP server registration wizard form state
export interface MCPExternalRegistrationFormState {
  serviceEntry: ServiceEntryFormState;
  destinationRule: DestinationRuleFormState;
  credential: CredentialFormState;
  server: MCPServerFormState;
}
