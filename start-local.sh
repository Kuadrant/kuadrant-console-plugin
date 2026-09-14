#!/usr/bin/env bash
set -euo pipefail

# start a local kuadrant dev environment using oinc (OKD in a container).
# sets up a cluster with kuadrant, istio, metallb, and the openshift console
# pointing at the plugin dev server for hot reloading.
#
# prerequisites: oinc, kubectl, node
#
# usage:
#   make oinc          # setup cluster + start plugin with hot reload
#   make oinc-teardown # tear it all down

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "${SCRIPT_DIR}/scripts/lib.sh"

CONSOLE_PORT="${CONSOLE_PORT:-9000}"
PLUGIN_PORT="${PLUGIN_PORT:-9001}"

CLEANED_UP=false
cleanup() {
  if [ "$CLEANED_UP" = true ]; then return; fi
  CLEANED_UP=true
  echo ""
  log "shutting down plugin dev server..."
  kill "$PLUGIN_PID" 2>/dev/null || true
  wait "$PLUGIN_PID" 2>/dev/null || true
  log "cluster is still running. tear down with: make oinc-teardown"
}

RUNTIME=$(detect_runtime)
HOST=$(container_host "${RUNTIME}")
PLUGIN_NAME=$(node -p "require('${SCRIPT_DIR}/package.json').consolePlugin.name")
PLUGIN_URL="http://${HOST}:${PLUGIN_PORT}"

console_has_plugin() {
  {
    "${RUNTIME}" inspect oinc-console --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null
    "${RUNTIME}" inspect oinc-console --format '{{json .Config.Cmd}}' 2>/dev/null
  } | grep -q "${PLUGIN_NAME}"
}

console_plugin_has_proxy() {
  local proxy_count
  proxy_count=$(kubectl get consoleplugin.console.openshift.io "${PLUGIN_NAME}" \
    -o go-template='{{len .spec.proxy}}' 2>/dev/null || true)
  [[ "${proxy_count}" =~ ^[1-9][0-9]*$ ]]
}

restart_console_with_plugin() {
  log "console running without plugin, restarting with plugin wired..."
  local image
  image=$("${RUNTIME}" inspect oinc-console --format '{{.Config.Image}}')
  local env_args=()
  while IFS= read -r var; do
    env_args+=(-e "${var}")
  done < <("${RUNTIME}" inspect oinc-console --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -v '^$')

  "${RUNTIME}" rm -f oinc-console >/dev/null 2>&1
  "${RUNTIME}" run -d --name oinc-console \
    "${env_args[@]}" \
    -p "127.0.0.1:${CONSOLE_PORT}:9000" \
    "${image}" \
    /opt/bridge/bin/bridge \
    --public-dir=/opt/bridge/static \
    -plugins "${PLUGIN_NAME}=${PLUGIN_URL}"
  log "console restarted with plugin registered"
}

if kubectl get nodes &>/dev/null 2>&1; then
  if curl -sf "http://localhost:${CONSOLE_PORT}" >/dev/null 2>&1; then
    if console_has_plugin; then
      log "existing cluster and console detected, skipping setup"
    else
      restart_console_with_plugin
    fi
  else
    log "cluster running but console is down, recreating..."
    oinc delete --force
    "${SCRIPT_DIR}/scripts/cluster-setup.sh"
  fi
else
  log "setting up local cluster with kuadrant..."
  "${SCRIPT_DIR}/scripts/cluster-setup.sh"
fi

# kill any leftover process on the plugin port
if lsof -ti:"${PLUGIN_PORT}" >/dev/null 2>&1; then
  log "killing existing process on port ${PLUGIN_PORT}..."
  lsof -ti:"${PLUGIN_PORT}" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

echo ""
log "starting plugin dev server with hot reload..."
trap cleanup EXIT INT TERM

yarn clean && NODE_ENV=development yarn start &
PLUGIN_PID=$!

# wait for plugin to be ready
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${PLUGIN_PORT}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if console_plugin_has_proxy; then
  log "syncing operator-reconciled Console plugin proxy..."
  "${SCRIPT_DIR}/scripts/sync-console-plugin-proxy.sh"
fi

echo ""
echo "============================================"
echo "  Console:  http://localhost:${CONSOLE_PORT}"
echo "  Plugin:   http://localhost:${PLUGIN_PORT}"
echo "============================================"
echo ""
echo "Plugin dev server is running with hot reload."
echo "Edit source files and changes will appear automatically."
echo "Press Ctrl+C to stop the plugin server."
echo ""

wait "$PLUGIN_PID"
