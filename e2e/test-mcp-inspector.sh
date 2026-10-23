#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_DIR}"
if [ "$(kubectl config current-context)" != "oinc" ]; then
  echo "error: the live Inspector journeys require the oinc context" >&2
  exit 1
fi
export MCP_INSPECTOR_E2E_EXTENSION=mcp-gateway-system/mcp-gateway-extension

probe_log=$(mktemp)
auth_fixture_applied=false
stop_probe() {
  if [ -n "${probe_pid:-}" ]; then
    kill "${probe_pid}" 2>/dev/null || true
    wait "${probe_pid}" 2>/dev/null || true
  fi
}
cleanup() {
  stop_probe
  rm -f "${probe_log}"
  if [ "${auth_fixture_applied}" = true ]; then
    kubectl --context=oinc delete -f e2e/manifests/mcp-inspector-auth.yaml --ignore-not-found
  fi
}
trap cleanup EXIT

start_probe() {
  stop_probe
  : >"${probe_log}"
  kubectl --context=oinc port-forward --address=127.0.0.1 -n gateway-system "service/$1-istio" :80 >"${probe_log}" 2>&1 &
  probe_pid=$!
}
start_probe mcp-gateway

# Registration Ready means config was written, not that the broker has discovered
# the upstream versions. Verify the same discovery response the Inspector uses.
probe_deadline=$((SECONDS + 120))
while true; do
  probe_port=$(sed -n 's/^Forwarding from 127.0.0.1:\([0-9]*\) .*/\1/p' "${probe_log}" | head -1)
  if [ -n "${probe_port}" ]; then
    discovery=$(curl --silent --max-time 5 \
      -H 'Host: mcp.127-0-0-1.sslip.io' -H 'Content-Type: application/json' \
      -H 'Accept: application/json, text/event-stream' -H 'MCP-Protocol-Version: 2026-07-28' \
      -H 'Mcp-Method: server/discover' \
      --data '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"inspector-readiness","version":"1"}}}}' \
      "http://127.0.0.1:${probe_port}/mcp" || true)
    if [[ "${discovery}" == event:* || "${discovery}" == data:* ]]; then
      discovery=$(sed -n 's/^data: *//p' <<<"${discovery}")
    fi
    if jq -e '.result.supportedVersions | contains(["2025-11-25", "2026-07-28"])' \
      >/dev/null 2>&1 <<<"${discovery}"; then
      break
    fi
  fi
  if [ "${SECONDS}" -ge "${probe_deadline}" ] || ! kill -0 "${probe_pid}" 2>/dev/null; then
    echo "error: demo gateway did not advertise both MCP protocol versions" >&2
    jq -c '.result.supportedVersions // .error' <<<"${discovery:-null}" >&2 || true
    cat "${probe_log}" >&2
    exit 1
  fi
  sleep 2
done

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
auth_fixture_applied=true
kubectl --context=oinc apply -f e2e/manifests/mcp-inspector-auth.yaml
kubectl --context=oinc wait authpolicy/mcp-inspector-e2e -n gateway-system --for=condition=Enforced --timeout=2m

wait_for_authentication() {
  local host=$1 token=$2
  local probe_deadline=$((SECONDS + 120))
  local probe_port anonymous_status authenticated_status
  local -a probe_args
  while true; do
    probe_port=$(sed -n 's/^Forwarding from 127.0.0.1:\([0-9]*\) .*/\1/p' "${probe_log}" | head -1)
    if [ -n "${probe_port}" ]; then
      probe_args=(--silent --max-time 5 --output /dev/null --write-out '%{http_code}'
        -H "Host: ${host}" -H 'Content-Type: application/json'
        -H 'Accept: application/json, text/event-stream' -H 'MCP-Protocol-Version: 2025-11-25'
        --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"inspector-readiness","version":"1"}}}'
        "http://127.0.0.1:${probe_port}/mcp")
      anonymous_status=$(curl "${probe_args[@]}" || true)
      authenticated_status=$(curl "${probe_args[@]}" -H "Authorization: Bearer ${token}" || true)
      if [ "${anonymous_status}" = 401 ] && [ "${authenticated_status}" = 200 ]; then
        break
      fi
    fi
    if [ "${SECONDS}" -ge "${probe_deadline}" ] || ! kill -0 "${probe_pid}" 2>/dev/null; then
      echo "error: ${host} authentication did not become ready (anonymous=${anonymous_status:-unavailable}, authenticated=${authenticated_status:-unavailable})" >&2
      cat "${probe_log}" >&2
      exit 1
    fi
    sleep 2
  done
}

# enforced can precede auth propagation.
wait_for_authentication mcp.127-0-0-1.sslip.io inspector-e2e-token
MCP_INSPECTOR_E2E_PROTOCOL=2025-11-25 \
MCP_INSPECTOR_E2E_TOKEN=inspector-e2e-token journey bearer

start_probe mcp-gateway-auth
wait_for_authentication mcp-auth.127-0-0-1.sslip.io token
MCP_INSPECTOR_E2E_EXTENSION=mcp-gateway-auth-system/mcp-gateway-auth-extension \
MCP_INSPECTOR_E2E_PROTOCOL=2025-11-25 \
MCP_INSPECTOR_E2E_TOKEN=token journey demo-bearer
