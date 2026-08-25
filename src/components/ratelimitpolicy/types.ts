export interface RateLimitPolicy {
  apiVersion: string;
  kind: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any>;
  spec: {
    defaults?: {
      limits?: {
        [key: string]: LimitConfig;
      };
      when?: Predicate[];
    };
    limits?: {
      [key: string]: LimitConfig;
    };
    overrides?: {
      limits?: {
        [key: string]: LimitConfig;
      };
      when?: Predicate[];
    };
    targetRef: TargetRef;
  };
}

export interface LimitConfig {
  counters?: Counter[];
  rates?: Rate[];
  when?: Predicate[];
}

export interface Counter {
  expression: string;
}

export interface Rate {
  limit: number;
  window: string;
}

export interface Predicate {
  predicate: string;
}

export interface TargetRef {
  group: string;
  kind: 'HTTPRoute' | 'Gateway' | 'GRPCRoute';
  name: string;
  namespace?: string;
}
