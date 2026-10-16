#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"
check_command kubectl "Install kubectl"

if [ "$(kubectl config current-context)" != "oinc" ]; then
  echo "error: select the oinc context before installing the development MCP demo" >&2
  exit 1
fi

log "installing open + authenticated demo Gateways and stateful + stateless MCP servers..."
kubectl --context=oinc apply -f "${SCRIPT_DIR}/mcp-demo.yaml"
kubectl --context=oinc wait --for=condition=Programmed \
  gateway/mcp-gateway gateway/mcp-gateway-auth -n gateway-system --timeout=5m
for deployment in mcp-test-server mcp-test-stateless-server; do
  kubectl --context=oinc rollout status "deployment/${deployment}" -n toystore --timeout=2m
done
kubectl --context=oinc wait --for=condition=Ready mcpgatewayextension/mcp-gateway-extension \
  -n mcp-gateway-system --timeout=2m
kubectl --context=oinc wait --for=condition=Ready mcpgatewayextension/mcp-gateway-auth-extension \
  -n mcp-gateway-auth-system --timeout=2m
kubectl --context=oinc wait --for=condition=Enforced authpolicy/mcp-demo-auth \
  -n gateway-system --timeout=2m
kubectl --context=oinc wait --for=condition=Ready \
  mcpserverregistration/toystore-mcp-server mcpserverregistration/stateless-mcp-server \
  -n toystore --timeout=2m
bash "${SCRIPT_DIR}/setup-mcp-demo-proxy.sh"
log "open gateway: mcp-gateway-system/mcp-gateway-extension"
log "authenticated gateway: mcp-gateway-auth-system/mcp-gateway-auth-extension (bearer token: token)"
log "demo ready: select 2025-11-25 for toystore_* or 2026-07-28 for stateless_*"
