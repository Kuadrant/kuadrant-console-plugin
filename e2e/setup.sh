#!/usr/bin/env bash
set -euo pipefail

# e2e environment: shared cluster setup + test fixtures

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=../scripts/lib.sh
source "${REPO_DIR}/scripts/lib.sh"

E2E_USE_EXISTING_CLUSTER="${E2E_USE_EXISTING_CLUSTER:-false}"
export E2E_USE_EXISTING_CLUSTER

case "${E2E_USE_EXISTING_CLUSTER}" in
  false)
    CLUSTER_MODE=oinc
    # --- oinc cluster setup ---
    "${REPO_DIR}/scripts/cluster-setup.sh"
    ;;
  true)
    CLUSTER_MODE=existing
    # --- validate an existing OpenShift cluster ---
    check_command oc "Install the OpenShift CLI and log in to the test cluster"
    check_command kubectl "Install kubectl"

    if ! oc whoami --show-server >/dev/null 2>&1; then
      echo "ERROR: oc is not logged in; run oc login against the E2E OpenShift cluster" >&2
      exit 1
    fi

    OC_CONTEXT="$(oc config current-context)"
    KUBECTL_CONTEXT="$(kubectl config current-context)"
    OC_SERVER="$(oc whoami --show-server)"
    KUBECTL_SERVER="$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')"
    if [[ -z "${OC_CONTEXT}" || "${OC_CONTEXT}" != "${KUBECTL_CONTEXT}" ]]; then
      echo "ERROR: oc and kubectl must use the same current context (oc=${OC_CONTEXT:-unset}, kubectl=${KUBECTL_CONTEXT:-unset})" >&2
      exit 1
    fi
    if [[ -z "${OC_SERVER}" || "${OC_SERVER}" != "${KUBECTL_SERVER}" ]]; then
      echo "ERROR: oc and kubectl must point to the same API server (oc=${OC_SERVER:-unset}, kubectl=${KUBECTL_SERVER:-unset})" >&2
      exit 1
    fi

    if ! oc get clusterversion >/dev/null 2>&1; then
      echo "ERROR: E2E_USE_EXISTING_CLUSTER=true requires an OpenShift cluster and permission to read ClusterVersion" >&2
      exit 1
    fi

    GATEWAY_CLASS_NAME=istio
    if ! kubectl get gatewayclass "${GATEWAY_CLASS_NAME}" >/dev/null 2>&1; then
      echo "ERROR: GatewayClass 'istio' was not found in the active cluster" >&2
      exit 1
    fi
    log "using GatewayClass ${GATEWAY_CLASS_NAME}"
    kubectl wait "gatewayclass/${GATEWAY_CLASS_NAME}" --for=condition=Accepted=True --timeout=120s

    E2E_NAMESPACES=(
      kuadrant-test kuadrant-test-2
      consumer-alice consumer-alice2 consumer-bob consumer-bob2
      consumer-carol consumer-dave consumer-ellen consumer-frank consumer-george
    )
    for namespace in "${E2E_NAMESPACES[@]}"; do
      if [[ -n "$(kubectl get namespace "${namespace}" --ignore-not-found -o name)" ]]; then
        echo "ERROR: E2E fixture namespace '${namespace}' already exists; use a dedicated test cluster or remove the old fixture set first" >&2
        exit 1
      fi
    done

    for resource in \
      clusterrole/test-admin-kuadrant \
      clusterrolebinding/test-admin-kuadrant \
      clusterissuers.cert-manager.io/test-selfsigned; do
      if [[ -n "$(kubectl get "${resource}" --ignore-not-found -o name)" ]]; then
        echo "ERROR: E2E fixture resource '${resource}' already exists; use a dedicated test cluster or remove the old fixture set first" >&2
        exit 1
      fi
    done

    log "using existing OpenShift cluster context ${OC_CONTEXT}"
    ;;
  *)
    echo "ERROR: E2E_USE_EXISTING_CLUSTER must be 'true' or 'false' (got '${E2E_USE_EXISTING_CLUSTER}')" >&2
    exit 1
    ;;
esac

ensure_existing_http_route_gateway() {
  local namespace="gateway-system"
  local gateway="kuadrant-ingressgateway"
  local gateway_resource="gateway.gateway.networking.k8s.io/${gateway}"

  if [[ -z "$(kubectl get namespace "${namespace}" --ignore-not-found -o name)" ]]; then
    log "creating E2E gateway namespace ${namespace}..."
    kubectl create -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: gateway-system
  labels:
    kuadrant.io/e2e-owned: console-plugin
EOF
  fi

  if [[ -n "$(kubectl get "${gateway_resource}" -n "${namespace}" --ignore-not-found -o name)" ]]; then
    local existing_class
    local existing_listeners
    existing_class="$(kubectl get "${gateway_resource}" -n "${namespace}" -o jsonpath='{.spec.gatewayClassName}')"
    existing_listeners="$(kubectl get "${gateway_resource}" -n "${namespace}" -o jsonpath='{range .spec.listeners[*]}{.name}{"|"}{.port}{"|"}{.protocol}{"|"}{.allowedRoutes.namespaces.from}{"\n"}{end}')"

    if [[ "${existing_class}" != "${GATEWAY_CLASS_NAME}" ]]; then
      echo "ERROR: existing ${namespace}/${gateway} uses GatewayClass '${existing_class}', expected '${GATEWAY_CLASS_NAME}'" >&2
      exit 1
    fi
    if ! printf '%s\n' "${existing_listeners}" | grep -Fqx 'http|80|HTTP|All'; then
      echo "ERROR: existing ${namespace}/${gateway} must have an HTTP listener named 'http' on port 80 that allows routes from all namespaces" >&2
      exit 1
    fi
    log "reusing compatible existing Gateway ${namespace}/${gateway}"
  else
    log "creating E2E HTTPRoute Gateway ${namespace}/${gateway}..."
    render_http_route_gateway existing | kubectl create -f -
  fi

  log "waiting for HTTPRoute test Gateway to become programmed..."
  if ! kubectl wait "${gateway_resource}" -n "${namespace}" --for=condition=Programmed=True --timeout=300s; then
    kubectl get "${gateway_resource}" -n "${namespace}" -o yaml >&2 || true
    exit 1
  fi
}

if [[ "${CLUSTER_MODE}" == "existing" ]]; then
  ensure_existing_http_route_gateway
fi

# --- test RBAC + fixtures ---

if [[ "${CLUSTER_MODE}" == "existing" ]] && kubectl get clusterrole/api-owner >/dev/null 2>&1; then
  log "reusing existing api-owner ClusterRole"
else
  log "applying RBAC roles..."
  kubectl apply -f "${REPO_DIR}/config/rbac/api-management/api-owner-clusterrole.yaml"
  if [[ "${CLUSTER_MODE}" == "existing" ]]; then
    kubectl label clusterrole/api-owner kuadrant.io/e2e-owned=console-plugin --overwrite
  fi
fi

apply_fixture_manifest() {
  local manifest="$1"
  log "applying $(basename "${manifest}")..."
  "${SCRIPT_DIR}/render-fixtures.sh" "${manifest}" | kubectl apply -f -
}

apply_fixture_manifest "${SCRIPT_DIR}/manifests/test-rbac.yaml"
apply_fixture_manifest "${SCRIPT_DIR}/manifests/test-resources.yaml"
apply_fixture_manifest "${SCRIPT_DIR}/manifests/test-apiproduct-fixtures.yaml"
apply_fixture_manifest "${SCRIPT_DIR}/manifests/test-mcp-resources.yaml"
apply_fixture_manifest "${SCRIPT_DIR}/manifests/test-apikey-fixtures.yaml"

log "waiting for test gateway address assignment..."
for namespace in kuadrant-test kuadrant-test-2; do
  if ! kubectl wait gateways.gateway.networking.k8s.io --all -n "${namespace}" \
    --for=condition=Programmed --timeout=300s; then
    kubectl get gateways.gateway.networking.k8s.io -n "${namespace}" -o yaml >&2 || true
    exit 1
  fi
done

log "waiting for controller to create all 9 APIKeyRequests in kuadrant-test..."
# Portable wait loop with an explicit 90s wall-clock deadline. Avoids GNU `timeout`,
# which isn't present on macOS by default (it's coreutils' `gtimeout` there), so local
# dev on darwin works without extra tooling. The deadline is checked against elapsed
# time (not iteration count) so a slow kubectl poll can't stretch the total wait.
apikeyrequest_count() {
  # Bound each poll (--request-timeout) so a stalled API server can't hang a single
  # kubectl call indefinitely.
  kubectl get apikeyrequests -n kuadrant-test --request-timeout=10s --no-headers 2>/dev/null | wc -l | tr -d ' '
}
deadline=$(( $(date +%s) + 90 ))
while [ "$(apikeyrequest_count)" -lt 9 ]; do
  if [ "$(date +%s)" -ge "${deadline}" ]; then
    echo "ERROR: APIKeyRequests not all created after 90s (found $(apikeyrequest_count))"
    exit 1
  fi
  sleep 2
done

log "e2e setup complete"
