import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

export interface MCPGatewayExtension extends K8sResourceCommon {
  spec?: {
    targetRef: {
      group?: string;
      kind?: string;
      name: string;
      namespace?: string;
      sectionName: string;
    };
    httpRouteManagement?: string;
    backendPingIntervalSeconds?: number;
    oauthProtectedResource?: {
      authorizationServers?: string[];
      bearerMethodsSupported?: string[];
      resource?: string;
      resourceName?: string;
      scopesSupported?: string[];
    };
  };
  status?: {
    conditions?: {
      type: string;
      status: string;
      lastTransitionTime?: string;
      reason?: string;
      message?: string;
    }[];
  };
}

export interface ReferenceGrantResource extends K8sResourceCommon {
  spec?: {
    from: {
      group: string;
      kind: string;
      namespace: string;
    }[];
    to: {
      group: string;
      kind: string;
      name?: string;
    }[];
  };
}

// Wizard form state for Steps 1-3, consumed in Step 4 for resource creation
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
};
