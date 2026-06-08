#!/usr/bin/env bash
set -euo pipefail

# create an oinc cluster with kuadrant, istio, metallb, and a gateway.
# shared by local dev and e2e — no test fixtures here.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

PLUGIN_PORT="${PLUGIN_PORT:-9001}"

# the console plugin tracks the latest Kuadrant CRDs, so default to the latest
# operator. override (e.g. KUADRANT_VERSION=1.4.4) to pin to a known-good version
# if a latest release breaks plugin development or CI (GH-361).
KUADRANT_VERSION="${KUADRANT_VERSION:-latest}"

check_command oinc "Install from https://github.com/jasonmadigan/oinc"
check_command kubectl "Install from https://kubernetes.io/docs/tasks/tools/"

RUNTIME=$(detect_runtime)
HOST=$(container_host "${RUNTIME}")

# --- cluster + addons + console ---

PLUGIN_NAME=$(node -p "require('${REPO_DIR}/package.json').consolePlugin.name")

# on a failed cluster create, dump kuadrant addon state so the "kuadrant not
# ready after 5m0s" timeout (GH-361) is debuggable from CI logs instead of
# opaque. oinc waits on more than the operator deployment, so capture the
# Kuadrant CR conditions, namespace events, and the operator logs.
dump_kuadrant_diagnostics() {
	log "oinc create failed - dumping kuadrant addon diagnostics for GH-361..."
	kubectl get kuadrant kuadrant -n kuadrant-system -o yaml 2>&1 || true
	kubectl get pods -n kuadrant-system -o wide 2>&1 || true
	kubectl get events -n kuadrant-system --sort-by='.lastTimestamp' 2>&1 || true
	kubectl logs deployment/kuadrant-operator-controller-manager -n kuadrant-system --tail=200 --all-containers 2>&1 || true
}

# bash suspends `set -e` (errexit) for a command used as an `if` condition, so a
# failed `oinc create` won't abort here - it falls through to the diagnostics
# dump and an explicit exit instead of dying silently.
log "creating oinc cluster with addons (kuadrant@${KUADRANT_VERSION})..."
if ! oinc create \
	--addons "gateway-api,cert-manager,metallb,istio,kuadrant@${KUADRANT_VERSION}" \
	--console-plugin "${PLUGIN_NAME}=http://${HOST}:${PLUGIN_PORT}"; then
	dump_kuadrant_diagnostics
	exit 1
fi

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
