#!/usr/bin/env bash
set -euo pipefail

# Install this checkout's backend through the operator's production proxy contract.
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ "$(kubectl config current-context)" != "oinc" ]; then
  echo "error: the Inspector E2E setup requires the oinc context" >&2
  exit 1
fi

PLUGIN_IMAGE=localhost/kuadrant/console-plugin:inspector-e2e

docker build -t "${PLUGIN_IMAGE}" "${REPO_DIR}"
oinc load-image "${PLUGIN_IMAGE}"
# Keep the operator installed from the catalog: replacing it with another build
# redeploys its own MCP and developer portal charts over the catalog's CRDs.
CONSOLE_PLUGIN_IMAGE="${PLUGIN_IMAGE}" bash "${REPO_DIR}/scripts/setup-inspector-backend.sh"
bash "${REPO_DIR}/scripts/sync-console-plugin-proxy.sh"

# These shared fixtures must remain usable after the operator restarts with the
# override. Surface the actual cluster condition here instead of timing out on a
# disabled UI option.
for gateway in gateway-system/kuadrant-ingressgateway kuadrant-test/test-gateway; do
  for condition in Accepted Programmed; do
    if ! kubectl --context=oinc wait "gateway/${gateway#*/}" -n "${gateway%/*}" \
      --for="condition=${condition}=True" --timeout=2m; then
      bash "${REPO_DIR}/e2e/collect-diagnostics.sh"
      exit 1
    fi
  done
done
