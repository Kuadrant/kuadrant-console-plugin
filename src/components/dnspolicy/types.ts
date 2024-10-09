

export interface MatchExpression {
  key: string;
  operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';
  values?: string[];
}

export interface MatchLabel {
  key: string;
  value: string;
}

export interface Selector {
  matchExpressions?: MatchExpression[];
  matchLabels?: MatchLabel[]; // Stored as array for easier form rendering. Actually a map of {key,value} pairs
}

export interface WeightedCustom {
  selector: Selector;
  weight: number;
}

export interface Weighted {
  custom?: WeightedCustom[];
  defaultWeight: number;
}

export interface LoadBalancing {
  geo: string;
  weight: number;
  defaultGeo: boolean;
}

export interface HealthCheck {
  endpoint: string;
  failureThreshold: number;
  port: number;
  protocol: 'HTTP' | 'HTTPS';
}

export interface DNSPolicy {
  apiVersion: string;
  kind: string;
  metadata: Record<string, any>;
  spec: {
    routingStrategy: 'simple' | 'loadbalanced';
    targetRef: {
      group: string;
      kind: string;
      name: string;
      namespace: string;
    };
    healthCheck?: HealthCheck;
    loadBalancing?: LoadBalancing;
  };
}
