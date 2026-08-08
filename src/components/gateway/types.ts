import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

export interface GatewayResource extends K8sResourceCommon {
  spec?: {
    gatewayClassName: string;
    listeners: {
      name: string;
      hostname?: string;
      port: number;
      protocol: 'HTTP' | 'HTTPS' | 'TLS' | 'TCP' | 'UDP';
      tls?: {
        mode?: 'Terminate' | 'Passthrough';
        certificateRefs?: {
          group?: string;
          kind?: string;
          name: string;
          namespace?: string;
        }[];
        options?: {
          [key: string]: string;
        };
      };
      allowedRoutes?: {
        namespaces?: {
          from?: 'All' | 'Same' | 'Selector';
          selector?: {
            matchLabels?: {
              [key: string]: string;
            };
            matchExpressions?: {
              key: string;
              operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';
              values?: string[];
            }[];
          };
        };
        kinds?: {
          group?: string;
          kind: string;
        }[];
      };
    }[];
    addresses?: {
      type?: 'IPAddress' | 'Hostname' | 'NamedAddress';
      value: string;
    }[];
  };
  status?: {
    addresses?: {
      type?: string;
      value: string;
    }[];
    conditions?: {
      type: string;
      status: string;
      observedGeneration?: number;
      lastTransitionTime?: string;
      reason?: string;
      message?: string;
    }[];
    listeners?: {
      name: string;
      supportedKinds?: {
        group?: string;
        kind: string;
      }[];
      attachedRoutes?: number;
      conditions?: {
        type: string;
        status: string;
        observedGeneration?: number;
        lastTransitionTime?: string;
        reason?: string;
        message?: string;
      }[];
    }[];
  };
}
