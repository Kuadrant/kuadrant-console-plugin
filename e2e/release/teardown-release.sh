#!/usr/bin/env bash
set -euo pipefail

# Removes only the fixtures created for release tests (does not delete or change the OpenShift cluster)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

manifests=(
  "${SCRIPT_DIR}/manifests/test-apikey-fixtures.yaml"
  "${SCRIPT_DIR}/manifests/test-apiproduct-fixtures.yaml"
  "${SCRIPT_DIR}/manifests/test-resources.yaml"
  "${SCRIPT_DIR}/manifests/test-rbac.yaml"
  "${SCRIPT_DIR}/../config/rbac/api-management/api-owner-clusterrole.yaml"
)
if [[ "${E2E_INCLUDE_MCP:-true}" == "true" ]]; then
  manifests+=("${SCRIPT_DIR}/manifests/test-mcp-resources.yaml")
fi

# Delete the fixtures listed above and leave the cluster itself untouched
for manifest in "${manifests[@]}"; do
  kubectl delete -f "${manifest}" --ignore-not-found=true >/dev/null 2>&1 || true
done

echo "Release E2E fixtures removed"
