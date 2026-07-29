import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

export type HTTPRouteFilter = unknown;

export interface HTTPRouteResource extends K8sResourceCommon {
  spec?: {
    parentRefs?: {
      group?: string;
      kind?: string;
      name: string;
      namespace?: string;
      sectionName?: string;
      port?: number;
    }[];
    hostnames?: string[];
    rules?: {
      matches?: {
        path?: {
          type?: 'Exact' | 'PathPrefix' | 'RegularExpression';
          value?: string;
        };
        headers?: {
          type?: 'Exact' | 'RegularExpression';
          name: string;
          value: string;
        }[];
        queryParams?: {
          type?: 'Exact' | 'RegularExpression';
          name: string;
          value: string;
        }[];
        method?:
          | 'GET'
          | 'HEAD'
          | 'POST'
          | 'PUT'
          | 'DELETE'
          | 'CONNECT'
          | 'OPTIONS'
          | 'TRACE'
          | 'PATCH';
      }[];
      filters?: HTTPRouteFilter[];
      backendRefs?: {
        group?: string;
        kind?: string;
        name: string;
        namespace?: string;
        port?: number;
        weight?: number;
      }[];
    }[];
  };
  status?: {
    parents?: {
      parentRef: {
        group?: string;
        kind?: string;
        name: string;
        namespace?: string;
        sectionName?: string;
        port?: number;
      };
      controllerName: string;
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

export interface HTTPRouteHeader {
  id: string;
  type: 'Exact' | 'RegularExpression';
  name: string;
  value: string;
}

export interface HTTPRouteQueryParam {
  id: string;
  type: 'Exact' | 'RegularExpression';
  name: string;
  value: string;
}

export interface HTTPRouteMatch {
  id: string;
  pathType: string;
  pathValue: string;
  method: string;
  headers?: HTTPRouteHeader[];
  queryParams?: HTTPRouteQueryParam[];
}
