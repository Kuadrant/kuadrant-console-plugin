#!/bin/bash

# Inject topology ConfigMap location and metrics configuration as JSON
# Security: Using JSON instead of executable JavaScript to prevent XSS attacks
cat <<EOF > /usr/share/nginx/html/config.json
{
  "TOPOLOGY_CONFIGMAP_NAME": "${TOPOLOGY_CONFIGMAP_NAME:-topology}",
  "TOPOLOGY_CONFIGMAP_NAMESPACE": "${TOPOLOGY_CONFIGMAP_NAMESPACE:-kuadrant-system}",
  "METRICS_WORKLOAD_SUFFIX": "${METRICS_WORKLOAD_SUFFIX:--openshift-default}"
}
EOF

# Start Nginx
nginx -g "daemon off;"
