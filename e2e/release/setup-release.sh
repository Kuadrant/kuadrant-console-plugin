#!/usr/bin/env bash
set -euo pipefail

# Prepares fixtures for release tests on an existing OCP cluster
# The regular local setup is in ../setup.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

source "${REPO_DIR}/scripts/lib.sh"

# Apply the common RBAC and test fixtures without creating a local cluster
log "using existing OCP cluster; skipping oinc cluster creation"
log "applying RBAC roles..."
kubectl apply -f "${REPO_DIR}/config/rbac/api-management/api-owner-clusterrole.yaml"

log "creating test namespace and RBAC..."
kubectl apply -f "${SCRIPT_DIR}/manifests/test-rbac.yaml"

log "creating test resources..."
kubectl apply -f "${SCRIPT_DIR}/manifests/test-resources.yaml"

# Remove OINC-specific LoadBalancer settings from generated Gateway Services
# Normal fixtures target OINC's MetalLB class. The target cluster's will have their own LoadBalancer
# implementation, so remove that class from the generated Istio Services
log "removing OINC-only load balancer class for release testing..."
for namespace in kuadrant-test kuadrant-test-2; do
  kubectl patch configmap metallb-gateway-params -n "${namespace}" \
    --type merge --patch '{"data":{"service":"spec: {}"}}'
done
for service in \
  "kuadrant-test/test-gateway-istio" \
  "kuadrant-test-2/test-gateway-2-istio"; do
  namespace="${service%%/*}"
  name="${service##*/}"
  kubectl delete service "${name}" -n "${namespace}" \
    --ignore-not-found=true --wait=false
done

# Apply API Product fixtures
log "creating APIProduct test fixtures..."
kubectl apply -f "${SCRIPT_DIR}/manifests/test-apiproduct-fixtures.yaml"

# Apply MCP fixtures only on supported OpenShift versions
if [[ "${E2E_INCLUDE_MCP:-false}" == "true" ]]; then
  log "creating MCP test resources..."
  kubectl apply -f "${SCRIPT_DIR}/manifests/test-mcp-resources.yaml"
else
  log "skipping MCP test resources for OCP 4.x..."
fi

# Apply API key fixtures used by the approval and lifecycle tests
log "creating APIKey consumer fixtures (controller will create APIKeyRequests)..."
kubectl apply -f "${SCRIPT_DIR}/manifests/test-apikey-fixtures.yaml"

# Wait for the test Gateways to receive an address and become ready
log "waiting for test gateway address assignment..."
for namespace in kuadrant-test kuadrant-test-2; do
  gateway_name="test-gateway"
  [[ "${namespace}" == "kuadrant-test-2" ]] && gateway_name="test-gateway-2"
  if ! kubectl wait "gateway/${gateway_name}" -n "${namespace}" \
    --for=condition=Programmed --timeout=300s
  then
    kubectl get gateway "${gateway_name}" -n "${namespace}" -o yaml >&2 || true
    kubectl get service -n "${namespace}" -o wide >&2 || true
    kubectl get events -n "${namespace}" --sort-by=.lastTimestamp >&2 || true
    exit 1
  fi
done

# Wait for the controller to create the expected API key requests
log "waiting for controller to create all 9 APIKeyRequests in kuadrant-test..."
apikeyrequest_count() {
  kubectl get apikeyrequests -n kuadrant-test --request-timeout=10s \
    --no-headers 2>/dev/null | wc -l | tr -d ' '
}
deadline=$(( $(date +%s) + 90 ))
while [ "$(apikeyrequest_count)" -lt 9 ]; do
  if [ "$(date +%s)" -ge "${deadline}" ]; then
    echo "ERROR: APIKeyRequests not all created after 90s (found $(apikeyrequest_count))"
    exit 1
  fi
  sleep 2
done

log "release E2E setup complete"
