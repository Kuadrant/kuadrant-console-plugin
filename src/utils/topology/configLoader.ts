/* eslint-disable @typescript-eslint/no-explicit-any */

export interface KuadrantConfig {
  TOPOLOGY_CONFIGMAP_NAME: string;
  TOPOLOGY_CONFIGMAP_NAMESPACE: string;
  METRICS_WORKLOAD_SUFFIX: string;
}

// fetch the config.js file dynamically at runtime
// normally served from <cluster-host>/api/plugins/kuadrant-console-plugin/config.js
export const fetchConfig = async (): Promise<KuadrantConfig> => {
  const defaultConfig: KuadrantConfig = {
    TOPOLOGY_CONFIGMAP_NAME: 'topology',
    TOPOLOGY_CONFIGMAP_NAMESPACE: 'kuadrant-system',
    METRICS_WORKLOAD_SUFFIX: '-openshift-default',
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
