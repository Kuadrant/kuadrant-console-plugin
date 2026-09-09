#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_DIR}"
if [ "$(kubectl config current-context)" != "oinc" ]; then
  echo "error: the live Inspector journeys require the oinc context" >&2
  exit 1
fi
export MCP_INSPECTOR_E2E_EXTENSION=mcp-gateway-system/mcp-gateway-extension
export MCP_INSPECTOR_E2E_REQUIRED=true

# Retain results separately for each protocol and authentication journey.
journey() {
  PLAYWRIGHT_HTML_OUTPUT_DIR="playwright-report/inspector-$1" \
  PLAYWRIGHT_JSON_OUTPUT_NAME="playwright-results-inspector-$1.json" \
    npx playwright test --config=e2e/playwright.config.ts e2e/tests/mcp-inspector.spec.ts \
      --retries=0 --output="test-results/inspector-$1" -g 'connects to a live gateway'
}

MCP_INSPECTOR_E2E_PROTOCOL=2025-11-25 journey legacy
for protocol in 2026-07-28 auto; do
  MCP_INSPECTOR_E2E_PROTOCOL="${protocol}" \
  MCP_INSPECTOR_E2E_TOOL=stateless_hello_world \
  MCP_INSPECTOR_E2E_PROMPT=stateless_greeting \
  MCP_INSPECTOR_E2E_PROMPT_ARGUMENT_LABEL=Name \
  MCP_INSPECTOR_E2E_PROMPT_OUTPUT='Please greet Ada warmly' journey "${protocol}"
done

# This fixture and credential belong only to the disposable E2E gateway.
probe_log=$(mktemp)
cleanup() {
  if [ -n "${probe_pid:-}" ]; then
    kill "${probe_pid}" 2>/dev/null || true
    wait "${probe_pid}" 2>/dev/null || true
  fi
  rm -f "${probe_log}"
  kubectl --context=oinc delete -f e2e/manifests/mcp-inspector-auth.yaml --ignore-not-found
}
trap cleanup EXIT
kubectl --context=oinc apply -f e2e/manifests/mcp-inspector-auth.yaml
kubectl --context=oinc wait authpolicy/mcp-inspector-e2e -n gateway-system --for=condition=Enforced --timeout=2m

# Enforced can precede Envoy/Authorino propagation. Check both anonymous rejection
# and valid authentication on the listener before starting the browser journey.
kubectl --context=oinc port-forward --address=127.0.0.1 -n gateway-system service/mcp-gateway-istio :80 >"${probe_log}" 2>&1 &
probe_pid=$!
probe_deadline=$((SECONDS + 120))
while true; do
  probe_port=$(sed -n 's/^Forwarding from 127.0.0.1:\([0-9]*\) .*/\1/p' "${probe_log}" | head -1)
  if [ -n "${probe_port}" ]; then
    probe_args=(--silent --max-time 5 --output /dev/null --write-out '%{http_code}'
      -H 'Host: mcp.127-0-0-1.sslip.io' -H 'Content-Type: application/json'
      -H 'Accept: application/json, text/event-stream' -H 'MCP-Protocol-Version: 2025-11-25'
      --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"inspector-readiness","version":"1"}}}'
      "http://127.0.0.1:${probe_port}/mcp")
    anonymous_status=$(curl "${probe_args[@]}" || true)
    authenticated_status=$(curl "${probe_args[@]}" -H 'Authorization: Bearer inspector-e2e-token' || true)
    if [ "${anonymous_status}" = 401 ] && [ "${authenticated_status}" = 200 ]; then
      break
    fi
  fi
  if [ "${SECONDS}" -ge "${probe_deadline}" ] || ! kill -0 "${probe_pid}" 2>/dev/null; then
    echo "error: authentication fixture did not become ready (anonymous=${anonymous_status:-unavailable}, authenticated=${authenticated_status:-unavailable})" >&2
    cat "${probe_log}" >&2
    exit 1
  fi
  sleep 2
done
MCP_INSPECTOR_E2E_PROTOCOL=2025-11-25 \
MCP_INSPECTOR_E2E_TOKEN=inspector-e2e-token journey bearer
