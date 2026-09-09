#!/usr/bin/env bash
set -euo pipefail

# Reconfigure OINC's standalone development Console from the ConsolePlugin
# proxy contract reconciled by the Kuadrant Operator. This has no production
# deployment role; a real OpenShift Console operator performs the translation.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

OINC_BIN="${OINC_BIN:-oinc}"
CONSOLE_PORT="${CONSOLE_PORT:-9000}"
PLUGIN_PORT="${PLUGIN_PORT:-9001}"
PLUGIN_NAME=$(node -p "require('${REPO_DIR}/package.json').consolePlugin.name")
RUNTIME=$(detect_runtime)
HOST=$(container_host "${RUNTIME}")

check_command "${OINC_BIN}" "Install oinc v0.4.6 or newer"
check_command kubectl "Install kubectl"
# OINC currently reads the active kubeconfig context itself. Never let this
# development command change resources in a production context.
if [ "$(kubectl config current-context)" != "oinc" ]; then
  echo "error: select the oinc context before syncing the development Console" >&2
  exit 1
fi

"${OINC_BIN}" console sync-plugin-proxy "${PLUGIN_NAME}" \
  --console-plugin "${PLUGIN_NAME}=http://${HOST}:${PLUGIN_PORT}" \
  --console-port "${CONSOLE_PORT}"

node "${SCRIPT_DIR}/oinc-network-policy.cjs" "${RUNTIME}" | kubectl --context=oinc apply -f -
curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 1 --max-time 5 \
  "http://localhost:${CONSOLE_PORT}/api/proxy/plugin/${PLUGIN_NAME}/backend/healthz" >/dev/null

log "OINC Console now uses the operator-reconciled plugin proxy; reload the browser"
