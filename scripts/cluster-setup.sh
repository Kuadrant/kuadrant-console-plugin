#!/usr/bin/env bash
set -euo pipefail

# create an oinc cluster with kuadrant, istio, metallb, and a gateway.
# shared by local dev and e2e, including the MCP demo backends.

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

check_command oinc "Install v0.5.3 or newer from https://github.com/jasonmadigan/oinc/releases"
check_command kubectl "Install from https://kubernetes.io/docs/tasks/tools/"

# Require MCP controller reuse, clean Helm output, and scoped MetalLB
# Gateway support before creating or changing any cluster resources.
if ! OINC_VERSION_OUTPUT=$(oinc version); then
  echo "error: could not determine oinc version" >&2
  exit 1
fi
if [[ ! "${OINC_VERSION_OUTPUT}" =~ oinc[[:space:]]v([0-9]+)\.([0-9]+)\.([0-9]+)([[:space:]]|$) ]] ||
  (( 10#${BASH_REMATCH[1]} == 0 && (10#${BASH_REMATCH[2]} < 5 ||
    (10#${BASH_REMATCH[2]} == 5 && 10#${BASH_REMATCH[3]} < 3)) )); then
  echo "error: oinc v0.5.3 or newer is required for Kuadrant-managed MCP Gateway support, the Helm registry output fix, and scoped MetalLB address assignment. Upgrade from https://github.com/jasonmadigan/oinc/releases" >&2
  exit 1
fi

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
# oinc v0.5.0+ reuses Kuadrant's MCP controller and CRDs while creating the
# Gateway and MCPGatewayExtension needed by the demo. It falls back to the
# standalone chart when the selected Kuadrant release does not bundle MCP.
# MCP_GATEWAY_ADDON can pin the instance chart, e.g. mcp-gateway@0.8.0.
ADDONS="gateway-api,cert-manager,metallb,istio,kuadrant@${KUADRANT_VERSION},${MCP_GATEWAY_ADDON:-mcp-gateway}"
if ! oinc create \
	--version "${OCP_VERSION}" \
	--addons "${ADDONS}" \
	--metallb-address-pool auto \
	--console-plugin "${PLUGIN_NAME}=http://${HOST}:${PLUGIN_PORT}"; then
	dump_kuadrant_diagnostics
	exit 1
fi

log "patch kuadrant to enable developer portal controller..."
kubectl patch kuadrant kuadrant -n kuadrant-system --type merge --patch '{"spec": {"components": {"developerPortal": {"enabled": true}}}}'

# --- Gateway ---

# OINC scopes MetalLB to this class so it does not take over MicroShift's
# ingress Service. Apply defaults before creating any Istio Gateway Services.
log "configuring Istio Gateways for OINC MetalLB..."
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: oinc-gateway-defaults
  namespace: istio-system
  labels:
    gateway.istio.io/defaults-for-class: istio
data:
  service: |
    spec:
      loadBalancerClass: oinc.io/metallb
EOF

log "creating gateway..."
kubectl create namespace gateway-system 2>/dev/null || true
# Istio must set the Service class at creation so oinc's scoped MetalLB handles it.
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: metallb-gateway-params
  namespace: gateway-system
data:
  service: |
    spec:
      loadBalancerClass: oinc.io/metallb
---
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: kuadrant-ingressgateway
  namespace: gateway-system
spec:
  gatewayClassName: istio
  infrastructure:
    parametersRef:
      group: ""
      kind: ConfigMap
      name: metallb-gateway-params
  listeners:
  - name: http
    port: 80
    protocol: HTTP
    allowedRoutes:
      namespaces:
        from: All
EOF

log "waiting for demo gateway address assignment..."
if ! kubectl wait gateway.gateway.networking.k8s.io/kuadrant-ingressgateway \
  -n gateway-system --for=condition=Programmed --timeout=300s; then
  kubectl get gateway.gateway.networking.k8s.io/kuadrant-ingressgateway -n gateway-system -o yaml >&2 || true
  exit 1
fi

bash "${SCRIPT_DIR}/setup-mcp-demo.sh"

log "cluster setup complete"
