/* eslint-disable @typescript-eslint/no-explicit-any */
export interface KuadrantConfig {
  TOPOLOGY_CONFIGMAP_NAME: string;
  TOPOLOGY_CONFIGMAP_NAMESPACE: string;
  METRICS_WORKLOAD_SUFFIX: string;
}

const DEFAULT_CONFIG: KuadrantConfig = {
  TOPOLOGY_CONFIGMAP_NAME: 'topology',
  TOPOLOGY_CONFIGMAP_NAMESPACE: 'kuadrant-system',
  METRICS_WORKLOAD_SUFFIX: '-openshift-default',
};

// Module-level cache for boot-time configuration
let configPromise: Promise<KuadrantConfig> | null = null;
// Fetch the config.js file dynamically at runtime (once, then cached)
// Normally served from <cluster-host>/api/plugins/kuadrant-console-plugin/config.js
const loadConfig = async (): Promise<KuadrantConfig> => {
  try {
    const response = await fetch('/api/plugins/kuadrant-console-plugin/config.js');
    if (!response.ok) {
      if (response.status === 404) {
        console.warn('config.js not found (running locally perhaps). Falling back to defaults.');
      } else {
        throw new Error(`Failed to fetch config.js: ${response.statusText}`);
      }
      return DEFAULT_CONFIG;
    }

    const script = await response.text();

    const configScript = document.createElement('script');
    configScript.innerHTML = script;
    document.head.appendChild(configScript);

    return (window as any).kuadrant_config || DEFAULT_CONFIG;
  } catch (error) {
    console.error('Error loading config.js:', error);
    return DEFAULT_CONFIG;
  }
};

/**
 * Get Kuadrant configuration (singleton - fetched once per session)
 * Safe to call from multiple components - all callers share the same promise
 */
export const fetchConfig = (): Promise<KuadrantConfig> => {
  if (!configPromise) {
    configPromise = loadConfig();
  }
  return configPromise;
};
