export interface LoadBalancing {
  geo: string;
  weight: number;
  defaultGeo: boolean | '';
}

export interface HealthCheck {
  path: string;
  failureThreshold: number;
  port: number;
  protocol: 'HTTP' | 'HTTPS' | '';
}
