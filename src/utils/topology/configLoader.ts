/* eslint-disable @typescript-eslint/no-explicit-any */

export interface MetricsConfig {
  metricName: string;
  queryFunction: string;
  timeWindow: string;
  workloadSuffix: string;
  successCodePattern: string;
}

export interface KuadrantConfig {
  TOPOLOGY_CONFIGMAP_NAME: string;
  TOPOLOGY_CONFIGMAP_NAMESPACE: string;
  METRICS?: MetricsConfig;
}

// fetch the config.js file dynamically at runtime
// normally served from <cluster-host>/api/plugins/kuadrant-console-plugin/config.js
export const fetchConfig = async (): Promise<KuadrantConfig> => {
  const defaultConfig: KuadrantConfig = {
    TOPOLOGY_CONFIGMAP_NAME: 'topology',
    TOPOLOGY_CONFIGMAP_NAMESPACE: 'kuadrant-system',
    METRICS: {
      metricName: 'istio_request_duration_milliseconds_count',
      queryFunction: 'rate',
      timeWindow: '2m',
      workloadSuffix: '',
      successCodePattern: '2(.*)|3(.*)',
    },
  };

  try {
    const response = await fetch('/api/plugins/kuadrant-console-plugin/config.js');
    if (!response.ok) {
      if (response.status === 404) {
        console.warn('config.js not found (running locally perhaps). Falling back to defaults.');
      } else {
        throw new Error(`Failed to fetch config.js: ${response.statusText}`);
      }
      return defaultConfig;
    }

    const script = await response.text();

    const configScript = document.createElement('script');
    configScript.innerHTML = script;
    document.head.appendChild(configScript);

    return (window as any).kuadrant_config || defaultConfig;
  } catch (error) {
    console.error('Error loading config.js:', error);
    return defaultConfig;
  }
};
