#!/bin/bash

# Inject topology ConfigMap location
cat <<EOF > /tmp/config.js
window.kuadrant_config = {
  TOPOLOGY_CONFIGMAP_NAME: '${TOPOLOGY_CONFIGMAP_NAME}',
  TOPOLOGY_CONFIGMAP_NAMESPACE: '${TOPOLOGY_CONFIGMAP_NAMESPACE}'
};
EOF

# Start Nginx
nginx -g "daemon off;"
