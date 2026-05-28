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
	--addons gateway-api,cert-manager,metallb,istio,kuadrant@latest \
	--console-plugin "${PLUGIN_NAME}=http://${HOST}:${PLUGIN_PORT}" || {
	log "oinc create failed, checking if kuadrant needs more time..."

	if ! kubectl get kuadrant kuadrant -n kuadrant-system &>/dev/null; then
		log "ERROR: Kuadrant CR not found — setup failed before creating it"
		kubectl get pods -n kuadrant-system 2>/dev/null || true
		exit 1
	fi

	log "kuadrant CR exists, waiting for readiness (extended timeout: 10 minutes)..."
	timeout 600 bash -c '
		while true; do
			status=$(kubectl get kuadrant kuadrant -n kuadrant-system \
				-o jsonpath="{.status.conditions[?(@.type==\"Ready\")].status}" 2>/dev/null)
			if [ "$status" = "True" ]; then
				break
			fi
			echo "  waiting for kuadrant Ready condition (current: ${status:-not set})..."
			sleep 10
		done
	' || {
		log "ERROR: Kuadrant not ready after extended timeout"
		kubectl get kuadrant kuadrant -n kuadrant-system -o yaml 2>/dev/null || true
		kubectl get pods -n kuadrant-system 2>/dev/null || true
		exit 1
	}
	log "kuadrant ready after extended wait"
}

log "patch kuadrant to enable developer portal controller..."
kubectl patch kuadrant kuadrant -n kuadrant-system --type merge --patch '{"spec": {"components": {"developerPortal": {"enabled": true}}}}'

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
