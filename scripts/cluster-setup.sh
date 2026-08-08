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
# if a latest release breaks plugin development or CI.
KUADRANT_VERSION="${KUADRANT_VERSION:-latest}"

# default to 4.22; override with OCP_VERSION to pin to a different version
OCP_VERSION="${OCP_VERSION:-4.22}"

check_command oinc "Install from https://github.com/jasonmadigan/oinc"
check_command kubectl "Install from https://kubernetes.io/docs/tasks/tools/"

RUNTIME=$(detect_runtime)
HOST=$(container_host "${RUNTIME}")

# --- cluster + addons + console ---

PLUGIN_NAME=$(node -p "require('${REPO_DIR}/package.json').consolePlugin.name")

# on a failed cluster create, dump kuadrant addon state so failures are
# debuggable from CI logs instead of opaque. the GH-361 "kuadrant not ready
# after 5m0s" races are addressed in oinc v0.2.3 (admission RESTMapper warm-up
# gate plus a pod-delete restart when the CR wedges on a late dependency);
# keep the dump for whatever fails next.
# oinc waits on more than the operator deployment, so capture the Kuadrant CR
# conditions, namespace events, and the operator logs.
dump_kuadrant_diagnostics() {
	log "oinc create failed - dumping kuadrant addon diagnostics..."
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
	--version "${OCP_VERSION}" \
	--addons "gateway-api,cert-manager,metallb,istio,kuadrant@${KUADRANT_VERSION},mcp-gateway" \
	--metallb-address-pool auto \
	--console-plugin "${PLUGIN_NAME}=http://${HOST}:${PLUGIN_PORT}"; then
	dump_kuadrant_diagnostics
	exit 1
fi

log "patch kuadrant to enable developer portal controller..."
kubectl patch kuadrant kuadrant -n kuadrant-system --type merge --patch '{"spec": {"components": {"developerPortal": {"enabled": true}}}}'

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

log "creating demo MCP resources..."
kubectl create namespace toystore 2>/dev/null || true
kubectl apply -f "${REPO_DIR}/scripts/mcp-demo.yaml"

log "cluster setup complete"
