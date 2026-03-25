#!/usr/bin/env bash
set -euo pipefail

# create an oinc cluster with kuadrant, istio, metallb, and a gateway.
# shared by local dev and e2e — no test fixtures here.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

PLUGIN_PORT="${PLUGIN_PORT:-9001}"

check_command oinc "Install from https://github.com/jasonmadigan/oinc"
check_command kubectl "Install from https://kubernetes.io/docs/tasks/tools/"

RUNTIME=$(detect_runtime)
HOST=$(container_host "${RUNTIME}")

# --- cluster + addons + console ---

PLUGIN_NAME=$(node -p "require('${REPO_DIR}/package.json').consolePlugin.name")

log "creating oinc cluster with addons..."
oinc create \
  --addons gateway-api,cert-manager,metallb,istio,kuadrant \
  --console-plugin "${PLUGIN_NAME}=http://${HOST}:${PLUGIN_PORT}"

# --- MetalLB IP pool ---

log "configuring MetalLB IP pool..."
DOCKER_SUBNET=$(${RUNTIME} network inspect bridge -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || echo "172.18.0.0/16")
POOL_PREFIX=$(echo "${DOCKER_SUBNET}" | sed 's|\.[0-9]*/.*|.200|')
POOL_END=$(echo "${DOCKER_SUBNET}" | sed 's|\.[0-9]*/.*|.220|')

log "MetalLB pool: ${POOL_PREFIX}-${POOL_END}"
kubectl apply -f - <<EOF
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: dev-pool
  namespace: metallb-system
spec:
  addresses:
  - ${POOL_PREFIX}-${POOL_END}
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: dev-l2
  namespace: metallb-system
EOF

# --- Gateway ---

log "creating gateway..."
kubectl create namespace gateway-system 2>/dev/null || true
kubectl apply -f - <<EOF
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: kuadrant-ingressgateway
  namespace: gateway-system
spec:
  gatewayClassName: istio
  listeners:
  - name: http
    port: 80
    protocol: HTTP
    allowedRoutes:
      namespaces:
        from: All
EOF

log "cluster setup complete"
