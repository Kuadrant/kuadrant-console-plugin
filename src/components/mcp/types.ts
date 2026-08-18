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

// Setup wizard form state for Steps 1-3, consumed in Step 4 for resource creation
export interface MCPWizardFormState {
  // Step 1: Gateway
  gatewayMode: 'existing' | 'new';
  selectedGatewayName: string;
  selectedGatewayNamespace: string;
  newGatewayName: string;

  // Step 2: HTTPRoute
  routeMode: 'existing' | 'new';
  selectedRouteName: string;
  selectedRouteNamespace: string;
  newRouteName: string;

  // Step 3: MCP Extension
  extensionName: string;
  extensionNamespace: string;
  targetGateway: string;
  sectionName: string;

  // Step 3: Advanced broker settings
  overrideHostnames: boolean;
  publicHost: string;
  privateHost: string;
  sessionStorageEnabled: boolean;
  sessionStoreSecretName: string;
  oauthEnabled: boolean;
  oauthAuthorizationServers: string;
  oauthResourceName: string;
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
