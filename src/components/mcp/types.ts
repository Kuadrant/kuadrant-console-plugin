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

export interface ReferenceGrantResource extends K8sResourceCommon {
  spec?: {
    from?: Array<{
      group: string;
      kind: string;
      namespace: string;
    }>;
    to?: Array<{
      group: string;
      kind: string;
      name?: string;
    }>;
  };
}
