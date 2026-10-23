#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"
check_command kubectl "Install kubectl"

if [ "$(kubectl config current-context)" != "oinc" ]; then
  echo "error: select the oinc context before installing the development demo" >&2
  exit 1
fi

kube() { kubectl --context=oinc --request-timeout=30s "$@"; }

log "enabling the developer portal controller..."
kube patch kuadrant kuadrant -n kuadrant-system --type=merge \
  --patch '{"spec":{"components":{"developerPortal":{"enabled":true}}}}'

log "waiting for demo APIs and the developer portal controller..."
crds=(
  gateways.gateway.networking.k8s.io
  httproutes.gateway.networking.k8s.io
  referencegrants.gateway.networking.k8s.io
  authpolicies.kuadrant.io
  ratelimitpolicies.kuadrant.io
  planpolicies.extensions.kuadrant.io
  apiproducts.devportal.kuadrant.io
  apikeys.devportal.kuadrant.io
  apikeyrequests.devportal.kuadrant.io
  apikeyapprovals.devportal.kuadrant.io
)
for crd in "${crds[@]}"; do
  kube wait --for=create "crd/${crd}" --timeout=180s
  kube wait --for=condition=Established "crd/${crd}" --timeout=180s
done
kube wait --for=create deployment/developer-portal-controller -n kuadrant-system --timeout=180s
kube rollout status deployment/developer-portal-controller -n kuadrant-system --timeout=180s

log "refreshing the shared MCP demo resources..."
bash "${SCRIPT_DIR}/setup-mcp-demo.sh"

log "installing the demo Gateway, backends, and policies..."
kube apply -f "${SCRIPT_DIR}/demo/namespaces.yaml"
kube apply -f "${SCRIPT_DIR}/demo/gateway.yaml"
kube apply -f "${SCRIPT_DIR}/demo/apis.yaml"
for namespace in kuadrant-demo-toystore kuadrant-demo-gamestore; do
  kube rollout status deployment/talker -n "${namespace}" --timeout=180s
  kube wait --for=condition=Enforced authpolicy --all -n "${namespace}" --timeout=180s
  kube wait --for=condition=Enforced planpolicy --all -n "${namespace}" --timeout=180s
done
kube wait --for=condition=Enforced ratelimitpolicy/inventory -n kuadrant-demo-gamestore --timeout=180s
kube wait --for=condition=Programmed gateway/demo -n kuadrant-demo-gateway --timeout=180s

log "publishing demo APIProducts and creating consumer keys..."
kube apply -f "${SCRIPT_DIR}/demo/products.yaml"
for namespace in kuadrant-demo-toystore kuadrant-demo-gamestore; do
  kube wait --for=condition=Ready apiproduct --all -n "${namespace}" --timeout=180s
done
kube apply -f "${SCRIPT_DIR}/demo/consumers.yaml"

# Let the controller create shadow requests and approvals. Do not reset decisions
# made through the UI when the demo is reapplied.
deadline=$((SECONDS + 180))
while true; do
  requests=$(kube get apikeyrequests -n kuadrant-demo-toystore \
    -o jsonpath='{range .items[*]}{.spec.apiKeyRef.namespace}/{.spec.apiKeyRef.name}{"\n"}{end}')
  game_requests=$(kube get apikeyrequests -n kuadrant-demo-gamestore \
    -o jsonpath='{range .items[*]}{.spec.apiKeyRef.namespace}/{.spec.apiKeyRef.name}{"\n"}{end}')
  if grep -qx 'kuadrant-demo-consumer/alice-toystore' <<<"${requests}" &&
    grep -qx 'kuadrant-demo-consumer/bob-toystore' <<<"${requests}" &&
    grep -qx 'kuadrant-demo-consumer/gamestore-client' <<<"${game_requests}"; then
    break
  fi
  if [ "${SECONDS}" -ge "${deadline}" ]; then
    echo "error: demo APIKeyRequests were not created within 180s" >&2
    kube get apikey -n kuadrant-demo-consumer -o yaml >&2
    exit 1
  fi
  sleep 2
done

log "demo installed in kuadrant-demo-* namespaces"
log "browse API Products and API Key Approvals in the Console; see docs/oinc-demo.md for traffic examples"
