#!/bin/bash

# Inject topology ConfigMap location and metrics configuration
cat <<EOF > /tmp/config.js
window.kuadrant_config = {
  TOPOLOGY_CONFIGMAP_NAME: '${TOPOLOGY_CONFIGMAP_NAME:-topology}',
  TOPOLOGY_CONFIGMAP_NAMESPACE: '${TOPOLOGY_CONFIGMAP_NAMESPACE:-kuadrant-system}',
  METRICS: {
    metricName: '${METRICS_METRIC_NAME:-istio_request_duration_milliseconds_count}',
    queryFunction: '${METRICS_QUERY_FUNCTION:-rate}',
    timeWindow: '${METRICS_TIME_WINDOW:-2m}',
    workloadSuffix: '${METRICS_WORKLOAD_SUFFIX:-}',
    successCodePattern: '${METRICS_SUCCESS_CODE_PATTERN:-2(.*)|3(.*)}',
  }
};
EOF

# Start Nginx
nginx -g "daemon off;"
