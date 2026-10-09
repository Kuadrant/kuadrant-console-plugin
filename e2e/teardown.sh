#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

case "${E2E_USE_EXISTING_CLUSTER:-false}" in
  false)
    CURRENT_CONTEXT="$(kubectl config current-context 2>/dev/null || true)"
    if [[ "${CURRENT_CONTEXT}" != "oinc" ]]; then
      echo "ERROR: set E2E_USE_EXISTING_CLUSTER=true to remove fixtures from an existing cluster; refusing to run oinc teardown for context '${CURRENT_CONTEXT:-unset}'" >&2
      exit 1
    fi
    exec "${REPO_DIR}/scripts/teardown.sh"
    ;;
  true)
    if ! kubectl config current-context >/dev/null 2>&1; then
      echo "ERROR: kubectl is not configured for the existing E2E cluster" >&2
      exit 1
    fi
    if ! command -v oc >/dev/null 2>&1 || ! oc whoami --show-server >/dev/null 2>&1; then
      echo "ERROR: oc is not logged in to the existing E2E cluster" >&2
      exit 1
    fi

    OC_CONTEXT="$(oc config current-context 2>/dev/null || true)"
    KUBECTL_CONTEXT="$(kubectl config current-context 2>/dev/null || true)"
    OC_SERVER="$(oc whoami --show-server 2>/dev/null || true)"
    KUBECTL_SERVER="$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}' 2>/dev/null || true)"
    if [[ -z "${OC_CONTEXT}" || "${OC_CONTEXT}" != "${KUBECTL_CONTEXT}" ]]; then
      echo "ERROR: oc and kubectl must use the same current context (oc=${OC_CONTEXT:-unset}, kubectl=${KUBECTL_CONTEXT:-unset})" >&2
      exit 1
    fi
    if [[ -z "${OC_SERVER}" || "${OC_SERVER}" != "${KUBECTL_SERVER}" ]]; then
      echo "ERROR: oc and kubectl must point to the same API server (oc=${OC_SERVER:-unset}, kubectl=${KUBECTL_SERVER:-unset})" >&2
      exit 1
    fi

    log() {
      echo "[e2e] $*"
    }

    fixture_namespaces=(
      consumer-alice consumer-alice2 consumer-bob consumer-bob2
      consumer-carol consumer-dave consumer-ellen consumer-frank consumer-george
      kuadrant-test-2 kuadrant-test
    )
    cluster_scoped_fixtures=(
      clusterrole/test-admin-kuadrant
      clusterrolebinding/test-admin-kuadrant
      clusterissuers.cert-manager.io/test-selfsigned
    )

    preflight_fixture_ownership() {
      local namespace namespace_resource owner resource

      for namespace in "${fixture_namespaces[@]}"; do
        if ! namespace_resource="$(kubectl get namespace "${namespace}" --ignore-not-found -o name)"; then
          echo "ERROR: could not check ownership of namespace '${namespace}'; no E2E fixtures were deleted" >&2
          return 1
        fi
        if [[ -z "${namespace_resource}" ]]; then
          continue
        fi

        if ! owner="$(kubectl get namespace "${namespace}" -o jsonpath='{.metadata.labels.kuadrant\.io/e2e-owned}')"; then
          echo "ERROR: could not read ownership label for namespace '${namespace}'; no E2E fixtures were deleted" >&2
          return 1
        fi
        if [[ "${owner}" != "console-plugin" ]]; then
          echo "ERROR: namespace '${namespace}' is not marked as E2E-owned; no fixtures were deleted" >&2
          return 1
        fi
      done

      for resource in "${cluster_scoped_fixtures[@]}"; do
        if ! namespace_resource="$(kubectl get "${resource}" --ignore-not-found -o name)"; then
          echo "ERROR: could not check ownership of '${resource}'; no E2E fixtures were deleted" >&2
          return 1
        fi
        if [[ -z "${namespace_resource}" ]]; then
          continue
        fi

        if ! owner="$(kubectl get "${resource}" -o jsonpath='{.metadata.labels.kuadrant\.io/e2e-owned}')"; then
          echo "ERROR: could not read ownership label for '${resource}'; no E2E fixtures were deleted" >&2
          return 1
        fi
        if [[ "${owner}" != "console-plugin" ]]; then
          echo "ERROR: '${resource}' is not marked as E2E-owned; no fixtures were deleted" >&2
          return 1
        fi
      done

      return 0
    }

    delete_fixture_manifest() {
      local manifest="$1"
      log "deleting fixtures from $(basename "${manifest}")..."
      "${SCRIPT_DIR}/render-fixtures.sh" --for-teardown "${manifest}" |
        kubectl delete --ignore-not-found -f -
    }

    delete_owned_cluster_fixture() {
      local resource="$1"
      local resource_name owner

      if ! resource_name="$(kubectl get "${resource}" --ignore-not-found -o name)"; then
        echo "ERROR: could not check '${resource}' before deletion" >&2
        return 1
      fi
      if [[ -z "${resource_name}" ]]; then
        return 0
      fi

      if ! owner="$(kubectl get "${resource}" -o jsonpath='{.metadata.labels.kuadrant\.io/e2e-owned}')"; then
        echo "ERROR: could not recheck ownership of '${resource}' before deletion" >&2
        return 1
      fi
      if [[ "${owner}" != "console-plugin" ]]; then
        echo "ERROR: ownership of '${resource}' changed during teardown; refusing to delete it" >&2
        return 1
      fi

      log "deleting E2E-owned cluster-scoped fixture ${resource}..."
      kubectl delete "${resource}" --ignore-not-found
    }

    # Verify every existing fixture namespace and cluster-scoped fixture before
    # the first delete, so a name collision cannot trigger partial cleanup.
    preflight_fixture_ownership

    # Reverse fixture installation order; namespaced resources are only deleted
    # after their containing namespaces have passed the ownership check.
    delete_fixture_manifest "${SCRIPT_DIR}/manifests/test-apikey-fixtures.yaml"
    # The extension finalizer needs its target Gateway to exist while it cleans up.
    kubectl delete --ignore-not-found --wait=true --timeout=120s \
      mcpgatewayextensions.mcp.kuadrant.io/mcp-gateway-extension \
      --namespace kuadrant-test
    delete_fixture_manifest "${SCRIPT_DIR}/manifests/test-mcp-resources.yaml"
    delete_fixture_manifest "${SCRIPT_DIR}/manifests/test-apiproduct-fixtures.yaml"
    delete_fixture_manifest "${SCRIPT_DIR}/manifests/test-resources.yaml"
    delete_owned_cluster_fixture "clusterissuers.cert-manager.io/test-selfsigned"
    delete_fixture_manifest "${SCRIPT_DIR}/manifests/test-rbac.yaml"
    delete_owned_cluster_fixture "clusterrolebinding/test-admin-kuadrant"
    delete_owned_cluster_fixture "clusterrole/test-admin-kuadrant"

    for namespace in "${fixture_namespaces[@]}"; do
      owner="$(kubectl get namespace "${namespace}" -o jsonpath='{.metadata.labels.kuadrant\.io/e2e-owned}' 2>/dev/null || true)"
      if [[ "${owner}" == "console-plugin" ]]; then
        kubectl delete namespace "${namespace}" --ignore-not-found
      fi
    done

    if [[ "$(kubectl get clusterrole/api-owner -o jsonpath='{.metadata.labels.kuadrant\.io/e2e-owned}' 2>/dev/null || true)" == "console-plugin" ]]; then
      kubectl delete clusterrole/api-owner
    fi

    gateway_namespace="gateway-system"
    gateway_name="kuadrant-ingressgateway"
    gateway_owner="$(kubectl get gateway.gateway.networking.k8s.io "${gateway_name}" -n "${gateway_namespace}" -o jsonpath='{.metadata.labels.kuadrant\.io/e2e-owned}' 2>/dev/null || true)"
    if [[ "${gateway_owner}" == "console-plugin" ]]; then
      log "deleting E2E-owned Gateway ${gateway_namespace}/${gateway_name}..."
      kubectl delete gateway.gateway.networking.k8s.io "${gateway_name}" -n "${gateway_namespace}" --ignore-not-found --wait=true --timeout=120s
    else
      log "leaving Gateway ${gateway_namespace}/${gateway_name}; it was not created by E2E setup"
    fi

    gateway_namespace_owner="$(kubectl get namespace "${gateway_namespace}" -o jsonpath='{.metadata.labels.kuadrant\.io/e2e-owned}' 2>/dev/null || true)"
    gateway_remaining="$(kubectl get gateways.gateway.networking.k8s.io -n "${gateway_namespace}" -o name 2>/dev/null || true)"
    if [[ "${gateway_namespace_owner}" == "console-plugin" && -z "${gateway_remaining}" ]]; then
      log "deleting E2E-owned namespace ${gateway_namespace}..."
      kubectl delete namespace "${gateway_namespace}" --ignore-not-found --wait=true --timeout=120s
    fi

    log "E2E fixtures removed; existing cluster retained"
    ;;
  *)
    echo "ERROR: E2E_USE_EXISTING_CLUSTER must be 'true' or 'false' (got '${E2E_USE_EXISTING_CLUSTER}')" >&2
    exit 1
    ;;
esac
