#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_DIR}"

if [[ -n "${PLAYWRIGHT_STORAGE_STATE:-}" ]]; then
  if [[ ! -f "${PLAYWRIGHT_STORAGE_STATE}" ]]; then
    echo "ERROR: Playwright storage state file not found: ${PLAYWRIGHT_STORAGE_STATE}" >&2
    exit 1
  fi
else
  if [[ ! -t 0 && ( -z "${E2E_CONSOLE_USERNAME:-}" || -z "${E2E_CONSOLE_PASSWORD:-}" ) ]]; then
    echo "ERROR: Console credentials are required. Run interactively for prompts, or set both E2E_CONSOLE_USERNAME and E2E_CONSOLE_PASSWORD or PLAYWRIGHT_STORAGE_STATE for non-interactive use" >&2
    exit 1
  fi

  if [[ -z "${E2E_CONSOLE_USERNAME:-}" ]]; then
    read -r -p "Console username: " E2E_CONSOLE_USERNAME
  fi
  if [[ -z "${E2E_CONSOLE_PASSWORD:-}" ]]; then
    read -r -s -p "Console password: " E2E_CONSOLE_PASSWORD
    printf '\n'
  fi
  if [[ -z "${E2E_CONSOLE_USERNAME:-}" || -z "${E2E_CONSOLE_PASSWORD:-}" ]]; then
    echo "ERROR: Console username and password are required" >&2
    exit 1
  fi

  export E2E_CONSOLE_USERNAME E2E_CONSOLE_PASSWORD
fi

if ! command -v oc >/dev/null 2>&1 || ! command -v kubectl >/dev/null 2>&1; then
  echo "ERROR: install both oc and kubectl before running installed-console E2E tests" >&2
  exit 1
fi

KUBECTL_CONTEXT="$(kubectl config current-context 2>/dev/null || true)"
OC_CONTEXT="$(oc config current-context 2>/dev/null || true)"
if [[ -z "${KUBECTL_CONTEXT}" || "${OC_CONTEXT}" != "${KUBECTL_CONTEXT}" ]]; then
  echo "ERROR: oc and kubectl must use the same current context (oc=${OC_CONTEXT:-unset}, kubectl=${KUBECTL_CONTEXT:-unset})" >&2
  exit 1
fi

OC_SERVER="$(oc whoami --show-server 2>/dev/null || true)"
KUBECTL_SERVER="$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}' 2>/dev/null || true)"
if [[ -z "${OC_SERVER}" || "${OC_SERVER}" != "${KUBECTL_SERVER}" ]]; then
  echo "ERROR: oc and kubectl must point to the same API server (oc=${OC_SERVER:-unset}, kubectl=${KUBECTL_SERVER:-unset})" >&2
  exit 1
fi

umask 077
TEMP_DIR="$(mktemp -d)"
TEMP_KUBECONFIG="${TEMP_DIR}/config"
FIXTURE_SETUP_ATTEMPTED=false

cleanup() {
  local exit_code=$?
  if [[ "${FIXTURE_SETUP_ATTEMPTED}" == true ]]; then
    echo "[e2e] no automatic teardown was run; existing or partially applied E2E fixtures were left in the cluster."
    echo "[e2e] when ready, remove them with: E2E_USE_EXISTING_CLUSTER=true yarn test:e2e:teardown"
  fi
  if [[ -z "${PLAYWRIGHT_STORAGE_STATE:-}" ]]; then
    rm -f -- "${SCRIPT_DIR}/.auth/installed-console.json"
  fi
  rm -rf -- "${TEMP_DIR}"
  exit "${exit_code}"
}
trap cleanup EXIT

if ! kubectl config view --minify --raw --flatten >"${TEMP_KUBECONFIG}"; then
  echo "ERROR: could not snapshot the active kubeconfig context" >&2
  exit 1
fi
if [[ "$(kubectl --kubeconfig="${TEMP_KUBECONFIG}" config current-context 2>/dev/null || true)" != "${KUBECTL_CONTEXT}" ]]; then
  echo "ERROR: the private kubeconfig snapshot did not retain context '${KUBECTL_CONTEXT}'" >&2
  exit 1
fi
SNAPSHOT_SERVER="$(kubectl --kubeconfig="${TEMP_KUBECONFIG}" config view --minify -o jsonpath='{.clusters[0].cluster.server}' 2>/dev/null || true)"
if [[ "${SNAPSHOT_SERVER}" != "${KUBECTL_SERVER}" ]]; then
  echo "ERROR: the private kubeconfig snapshot points at a different API server" >&2
  exit 1
fi

export KUBECONFIG="${TEMP_KUBECONFIG}"
export E2E_USE_EXISTING_CLUSTER=true
export E2E_USE_INSTALLED_CONSOLE=true

if [[ -z "${CONSOLE_URL:-}" ]]; then
  CONSOLE_HOST="$(oc get route console -n openshift-console -o jsonpath='{.spec.host}' 2>/dev/null || true)"
  if [[ -z "${CONSOLE_HOST}" ]]; then
    echo "ERROR: could not discover route/console in openshift-console; set CONSOLE_URL to override route discovery" >&2
    exit 1
  fi
  export CONSOLE_URL="https://${CONSOLE_HOST}"
fi

echo "[e2e] using cluster context ${KUBECTL_CONTEXT}"
echo "[e2e] testing installed console at ${CONSOLE_URL}"

if ! EXISTING_E2E_NAMESPACE="$(kubectl get namespace kuadrant-test --ignore-not-found -o name 2>&1)"; then
  echo "ERROR: could not check for the E2E fixture namespace: ${EXISTING_E2E_NAMESPACE}" >&2
  exit 1
fi

if [[ "${EXISTING_E2E_NAMESPACE}" == "namespace/kuadrant-test" ]]; then
  fixture_namespaces=(
    kuadrant-test kuadrant-test-2
    consumer-alice consumer-alice2 consumer-bob consumer-bob2
    consumer-carol consumer-dave consumer-ellen consumer-frank consumer-george
  )
  for namespace in "${fixture_namespaces[@]}"; do
    if ! owner="$(kubectl get namespace "${namespace}" -o jsonpath='{.metadata.labels.kuadrant\.io/e2e-owned}' 2>/dev/null)"; then
      echo "ERROR: existing E2E fixture namespace '${namespace}' is missing or unreadable; run E2E_USE_EXISTING_CLUSTER=true yarn test:e2e:teardown before retrying" >&2
      exit 1
    fi
    if [[ "${owner}" != "console-plugin" ]]; then
      echo "ERROR: namespace '${namespace}' is not E2E-owned; inspect it before running E2E_USE_EXISTING_CLUSTER=true yarn test:e2e:teardown" >&2
      exit 1
    fi
  done

  if ! setup_complete="$(kubectl get namespace kuadrant-test -o jsonpath='{.metadata.annotations.kuadrant\.io/e2e-setup-complete}')"; then
    echo "ERROR: could not read the E2E setup marker; run E2E_USE_EXISTING_CLUSTER=true yarn test:e2e:teardown before retrying" >&2
    exit 1
  fi
  if [[ "${setup_complete}" != "true" ]]; then
    echo "ERROR: E2E setup did not finish; run E2E_USE_EXISTING_CLUSTER=true yarn test:e2e:teardown before retrying" >&2
    exit 1
  fi

  for resource in \
    gateway/test-gateway \
    httproute/test-route \
    apiproduct/payment-api \
    planpolicy/test-plan-policy; do
    if ! kubectl get "${resource}" -n kuadrant-test >/dev/null 2>&1; then
      echo "ERROR: E2E fixture '${resource}' is missing; run E2E_USE_EXISTING_CLUSTER=true yarn test:e2e:teardown before retrying" >&2
      exit 1
    fi
  done
  echo "[e2e] found completed, E2E-owned fixtures; reusing them and skipping setup"
else
  echo "[e2e] namespace/kuadrant-test not found; applying E2E fixtures"
  FIXTURE_SETUP_ATTEMPTED=true
  "${SCRIPT_DIR}/setup.sh"
fi

npx playwright test --config=e2e/playwright.config.ts "$@"
