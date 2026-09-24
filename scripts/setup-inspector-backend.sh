#!/usr/bin/env bash
set -euo pipefail

# deploy the MCP Inspector backend through the Kuadrant Operator. oinc has no
# ClusterVersion, so the operator only deploys the Console plugin when given an
# explicit image. development only; safe to re-run.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

NAMESPACE=kuadrant-system
PLUGIN=kuadrant-console-plugin
# the operator container in the CSV install strategy
MANAGER='def manager: .spec.install.spec.deployments[]
  | select(.name == "kuadrant-operator-controller-manager")
  | .spec.template.spec.containers[] | select(.name == "manager");'

check_command kubectl "Install from https://kubernetes.io/docs/tasks/tools/"
check_command jq "Install from https://jqlang.org/download/"
if [ "$(kubectl config current-context)" != "oinc" ]; then
  echo "error: select the oinc context before deploying the development MCP Inspector backend" >&2
  exit 1
fi

# a pinned KUADRANT_VERSION installs a released operator with helm, and no
# release supports the override yet (Kuadrant/kuadrant-operator#2206)
CSV=$(kubectl --context=oinc get subscription kuadrant-operator -n "${NAMESPACE}" \
  -o jsonpath='{.status.installedCSV}' 2>/dev/null || true)
if [ -z "${CSV}" ]; then
  log "skipping the MCP Inspector backend: it needs the OLM-managed operator from KUADRANT_VERSION=latest"
  exit 0
fi

# keep the current backend, such as one loaded by make oinc-backend, unless an
# image is given
if [ -z "${CONSOLE_PLUGIN_IMAGE:-}" ]; then
  CONSOLE_PLUGIN_IMAGE=$(kubectl --context=oinc get csv "${CSV}" -n "${NAMESPACE}" -o json |
    jq -r "${MANAGER}"' manager | (.env // [])[] | select(.name == "CONSOLE_PLUGIN_IMAGE_OVERRIDE") | .value')
  CONSOLE_PLUGIN_IMAGE="${CONSOLE_PLUGIN_IMAGE:-quay.io/kuadrant/console-plugin:latest}"
fi

log "deploying the MCP Inspector backend (${CONSOLE_PLUGIN_IMAGE})..."
# OLM owns the operator Deployment, so the override belongs on the CSV. retry
# when OLM updates the CSV between the read and the replace.
for attempt in $(seq 1 5); do
  if kubectl --context=oinc get csv "${CSV}" -n "${NAMESPACE}" -o json |
    jq --arg image "${CONSOLE_PLUGIN_IMAGE}" "${MANAGER}"'
      (manager | .env) |= ((. // [] | map(select(.name != "CONSOLE_PLUGIN_IMAGE_OVERRIDE")))
        + [{name: "CONSOLE_PLUGIN_IMAGE_OVERRIDE", value: $image}])' |
    kubectl --context=oinc replace -f -; then
    break
  fi
  if [ "${attempt}" -eq 5 ]; then
    echo "error: could not set CONSOLE_PLUGIN_IMAGE_OVERRIDE on ${CSV}" >&2
    exit 1
  fi
  sleep 2
done

backend_reconciled() {
  [ "$(kubectl --context=oinc get deployment "${PLUGIN}" -n "${NAMESPACE}" \
    -o jsonpath="{.spec.template.spec.containers[?(@.name=='${PLUGIN}')].image}" 2>/dev/null)" = \
    "${CONSOLE_PLUGIN_IMAGE}" ] &&
    kubectl --context=oinc get consoleplugin "${PLUGIN}" \
      -o jsonpath='{.spec.proxy[*].alias}' 2>/dev/null | grep -qw backend
}

log "waiting for the operator to reconcile the backend and its Console proxy..."
deadline=$((SECONDS + 300))
until backend_reconciled; do
  if [ "${SECONDS}" -ge "${deadline}" ]; then
    echo "error: the operator did not deploy ${CONSOLE_PLUGIN_IMAGE} with a backend Console proxy" >&2
    kubectl --context=oinc logs deployment/kuadrant-operator-controller-manager -n "${NAMESPACE}" --tail=20 >&2 || true
    exit 1
  fi
  sleep 2
done

# the demo gateway listener is plain HTTP, and its public host resolves to
# loopback inside the cluster
kubectl --context=oinc set env deployment/"${PLUGIN}" -n "${NAMESPACE}" \
  MCP_PROXY_DIAL_ADDRESS=mcp-gateway-istio.gateway-system.svc.cluster.local:80 \
  MCP_PROXY_ALLOW_INSECURE_AUTH=true
kubectl --context=oinc rollout status deployment/"${PLUGIN}" -n "${NAMESPACE}" --timeout=5m
