export interface RateLimitPolicy {
  apiVersion: string;
  kind: string;
  metadata: Record<string, any>;
  spec: {
    defaults?: {
      limits?: {
        [key: string]: LimitConfig;
      };
    };
    limits?: {
      [key: string]: LimitConfig;
    };
    overrides?: {
      limits?: {
        [key: string]: LimitConfig;
      };
    };
    targetRef: TargetRef;
  };
}

export interface LimitConfig {
  counters?: ContextSelector[];
  rates?: Rate[];
  routeSelectors?: RouteSelector[];
  when?: Condition[];
}

export interface ContextSelector {
  // ContextSelector is based on a dot-separated path, e.g., 'request.path'
  [key: string]: string;
}

export interface Rate {
  duration: number; // Time period for the rate limit
  limit: number; // Max value allowed in the time period
  unit: 'second' | 'minute' | 'hour' | 'day'; // Time unit for the limit
}

export interface RouteSelector {
  hostnames?: string[]; // Hostnames for the route
  matches?: HTTPRouteMatch[];
}

export interface HTTPRouteMatch {
  headers?: HTTPHeaderMatch[];
  method?: HTTPMethod;
  path?: HTTPPathMatch;
  queryParams?: HTTPQueryParamMatch[];
}

export interface HTTPHeaderMatch {
  name: string; // Name of the header (case-insensitive)
  value: string; // Value of the header to match
  type?: 'Exact' | 'RegularExpression'; // How to match the header value
}

export type HTTPMethod =
  | 'GET'
  | 'HEAD'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'CONNECT'
  | 'OPTIONS'
  | 'TRACE'
  | 'PATCH';

export interface HTTPPathMatch {
  type: 'Exact' | 'PathPrefix' | 'RegularExpression'; // How to match the path
  value: string; // The value of the path to match
}

export interface HTTPQueryParamMatch {
  name: string; // Name of the query parameter
  value: string; // Value of the query parameter
  type?: 'Exact' | 'RegularExpression'; // How to match the query parameter value
}

export interface Condition {
  operator: 'eq' | 'neq' | 'startswith' | 'endswith' | 'incl' | 'excl' | 'matches'; // Operator for comparison
  selector: string; // Well-known selector (e.g., request.path)
  value: string; // The value for comparison
}

export interface TargetRef {
  group: string;
  kind: 'HTTPRoute' | 'Gateway'; // Supported values
  name: string;
  namespace: string;
}
