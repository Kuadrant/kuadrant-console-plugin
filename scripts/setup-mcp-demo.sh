#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"
check_command kubectl "Install kubectl"

if [ "$(kubectl config current-context)" != "oinc" ]; then
  echo "error: select the oinc context before installing the development MCP demo" >&2
  exit 1
fi

log "installing the demo Gateway and stateful + stateless MCP servers..."
kubectl --context=oinc apply -f "${SCRIPT_DIR}/mcp-demo.yaml"
for deployment in mcp-test-server mcp-test-stateless-server; do
  kubectl --context=oinc rollout status "deployment/${deployment}" -n toystore --timeout=2m
done
kubectl --context=oinc wait --for=condition=Ready mcpgatewayextension/mcp-gateway-extension \
  -n mcp-gateway-system --timeout=2m
kubectl --context=oinc wait --for=condition=Ready \
  mcpserverregistration/toystore-mcp-server mcpserverregistration/stateless-mcp-server \
  -n toystore --timeout=2m
log "demo ready: select 2025-11-25 for toystore_* or 2026-07-28 for stateless_*"
