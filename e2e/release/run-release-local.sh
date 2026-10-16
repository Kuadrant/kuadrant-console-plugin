#!/usr/bin/env bash
set -euo pipefail

# Run release E2E tests against an already-installed plugin.
# VPN access is only required when the target cluster is private.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_DIR="$(cd "${E2E_DIR}/.." && pwd)"

# Read the suite and target cluster from arguments or the environment
SUITE="${1:-smoke}"
OCP_API_URL="${OCP_API_URL:-${2:-}}"
TEST_TARGET="${3:-}"

# Ask for the cluster endpoint when it was not supplied
if [[ -z "${OCP_API_URL}" ]]; then
  read -r -p "OCP API URL: " OCP_API_URL
fi
if [[ -z "${OCP_API_URL}" ]]; then
  echo "OCP API URL is required" >&2
  exit 2
fi

# Check the local tools needed to run release tests
command -v oc >/dev/null || { echo "oc is required" >&2; exit 1; }
command -v kubectl >/dev/null || { echo "kubectl is required" >&2; exit 1; }

# Fail early with a useful message if the release fixture files are missing.
for fixture in \
  "${E2E_DIR}/manifests/test-rbac.yaml" \
  "${E2E_DIR}/manifests/test-resources.yaml" \
  "${E2E_DIR}/manifests/test-apiproduct-fixtures.yaml" \
  "${E2E_DIR}/manifests/test-apikey-fixtures.yaml"; do
  if [[ ! -f "${fixture}" ]]; then
    echo "Missing release fixture: ${fixture}" >&2
    exit 1
  fi
done

# Collect credentials and log in to the target cluster
read -r -p "OCP username [admin]: " OCP_USERNAME
OCP_USERNAME="${OCP_USERNAME:-admin}"
read -r -s -p "OCP password: " OCP_PASSWORD
echo

export OCP_API_URL OCP_USERNAME OCP_PASSWORD
oc login "${OCP_API_URL}" \
  --username="${OCP_USERNAME}" \
  --password="${OCP_PASSWORD}" \
  --request-timeout=30s

test "$(oc whoami --show-server)" = "${OCP_API_URL}"

# Detect the cluster version and decide whether MCP tests are supported
ocp_version="$(oc get clusterversion version -o jsonpath='{.status.desired.version}')"
case "${ocp_version}" in
  4.*) export E2E_INCLUDE_MCP=false ;;
  5.*) export E2E_INCLUDE_MCP=true ;;
  *) echo "Unsupported OpenShift version: ${ocp_version}" >&2; exit 1 ;;
esac

# Find the Console route and configure Playwright login
console_host="$(oc get route console -n openshift-console -o jsonpath='{.spec.host}')"
test -n "${console_host}"
export CONSOLE_URL="https://${console_host}"
export CONSOLE_LOGIN_USERNAME="${OCP_USERNAME}"
export CONSOLE_LOGIN_PASSWORD="${OCP_PASSWORD}"
export E2E_USE_EXISTING_CLUSTER=true

# Confirm the release ConsolePlugin is available
echo "OpenShift: ${ocp_version}"
echo "Console: ${CONSOLE_URL}"
echo "Plugin deployment:"
oc get consoleplugin kuadrant-console-plugin
oc wait deployment/kuadrant-console-plugin -n kuadrant-system \
  --for=condition=Available --timeout=5m
oc get deployment/kuadrant-console-plugin -n kuadrant-system \
  -o jsonpath='{.spec.template.spec.containers[0].image}'; echo

# Always remove fixtures and saved login state when the run exits
cleanup() {
  bash "${SCRIPT_DIR}/teardown-release.sh" || true
  rm -f "${REPO_DIR}/playwright-storage-state.json"
}
trap cleanup EXIT

# Apply release fixtures to the existing cluster
bash "${SCRIPT_DIR}/setup-release.sh"

# Select either one requested spec or the supported suite of specs
if [[ -n "${TEST_TARGET}" ]]; then
  if [[ -f "${TEST_TARGET}" ]]; then
    spec_paths=("${TEST_TARGET}")
  else
    spec_paths=("${E2E_DIR}/tests/${TEST_TARGET}")
  fi
  [[ -f "${spec_paths[0]}" ]] || {
    echo "Test file not found: ${TEST_TARGET}" >&2
    exit 2
  }
  echo "Running only: ${spec_paths[0]}"
else
  non_mcp_specs=()
  while IFS= read -r spec; do
    non_mcp_specs+=("${spec}")
  done < <(
    find "${E2E_DIR}/tests" -maxdepth 1 -type f -name '*.spec.ts' \
      ! -name 'mcp-*.spec.ts' -print | sort
  )
  if [[ "${E2E_INCLUDE_MCP}" == 'true' ]]; then
    spec_paths=("${E2E_DIR}/tests/"*.spec.ts)
  else
    spec_paths=("${non_mcp_specs[@]}")
    echo "OCP 4.x: excluding mcp-*.spec.ts tests"
  fi
fi

# Run either the smoke suite or the complete release suite
if [[ "${SUITE}" == "smoke" ]]; then
  npx playwright test --config="${SCRIPT_DIR}/playwright.config.ts" \
    --grep @smoke --workers=1 "${spec_paths[@]}"
elif [[ "${SUITE}" == "full" ]]; then
  npx playwright test --config="${SCRIPT_DIR}/playwright.config.ts" \
    --workers=1 "${spec_paths[@]}"
else
  echo "Usage: $0 [smoke|full] [ocp-api-url] [test-file]" >&2
  exit 2
fi
