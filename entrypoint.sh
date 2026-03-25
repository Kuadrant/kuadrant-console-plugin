#!/bin/bash

# Inject topology ConfigMap location and metrics configuration
cat <<EOF > /tmp/config.js
window.kuadrant_config = {
  TOPOLOGY_CONFIGMAP_NAME: '${TOPOLOGY_CONFIGMAP_NAME:-topology}',
  TOPOLOGY_CONFIGMAP_NAMESPACE: '${TOPOLOGY_CONFIGMAP_NAMESPACE:-kuadrant-system}',
  METRICS_WORKLOAD_SUFFIX: '${METRICS_WORKLOAD_SUFFIX:-openshift-default}'
};
EOF

# Start Nginx
nginx -g "daemon off;"
