export interface LoadBalancing {
  geo: string;
  weight: number | null;
  defaultGeo: boolean | '';
}

export interface HealthCheck {
  endpoint: string;
  failureThreshold: number;
  port: number;
  protocol: 'HTTP' | 'HTTPS' | '';
}
