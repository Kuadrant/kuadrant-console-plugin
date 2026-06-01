#!/bin/bash

# JSON escape function to safely escape special characters in JSON strings
json_escape() {
  local value="$1"
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  printf '%s' "$value"
}

# Inject topology ConfigMap location and metrics configuration as JSON
# Security: Using JSON instead of executable JavaScript to prevent XSS attacks
cat <<EOF > /usr/share/nginx/html/config.json
{
  "TOPOLOGY_CONFIGMAP_NAME": "$(json_escape "${TOPOLOGY_CONFIGMAP_NAME:-topology}")",
  "TOPOLOGY_CONFIGMAP_NAMESPACE": "$(json_escape "${TOPOLOGY_CONFIGMAP_NAMESPACE:-kuadrant-system}")",
  "METRICS_WORKLOAD_SUFFIX": "$(json_escape "${METRICS_WORKLOAD_SUFFIX:--openshift-default}")"
}
EOF

# Start Nginx
nginx -g "daemon off;"
