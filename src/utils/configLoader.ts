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

/**
 * Validates that the config object has the expected structure
 * @param config - Configuration object to validate
 * @returns true if valid, false otherwise
 */
const isValidConfig = (config: any): config is KuadrantConfig => {
  return (
    config &&
    typeof config === 'object' &&
    typeof config.TOPOLOGY_CONFIGMAP_NAME === 'string' &&
    typeof config.TOPOLOGY_CONFIGMAP_NAMESPACE === 'string' &&
    typeof config.METRICS_WORKLOAD_SUFFIX === 'string'
  );
};

/**
 * Fetch the config.json file dynamically at runtime (once, then cached)
 * Normally served from <cluster-host>/api/plugins/kuadrant-console-plugin/config.json
 *
 * Security: Uses JSON instead of executable JavaScript to prevent XSS attacks
 */
const loadConfig = async (): Promise<KuadrantConfig> => {
  try {
    const response = await fetch('/api/plugins/kuadrant-console-plugin/config.json');
    if (!response.ok) {
      if (response.status === 404) {
        console.warn('config.json not found (running locally perhaps). Falling back to defaults.');
      } else {
        throw new Error(`Failed to fetch config.json: ${response.statusText}`);
      }
      return DEFAULT_CONFIG;
    }

    // Parse JSON response (safe - no code execution)
    const config = await response.json();

    // Validate config structure before using
    if (!isValidConfig(config)) {
      console.warn('Invalid config.json structure. Falling back to defaults.', config);
      return DEFAULT_CONFIG;
    }

    return config;
  } catch (error) {
    console.error('Error loading config.json:', error);
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
