#!/usr/bin/env bash
set -euo pipefail

# start a local kuadrant dev environment using oinc (OKD in a container).
# sets up a cluster with kuadrant, istio, metallb, and the openshift console
# pointing at the plugin dev server for hot reloading.
#
# prerequisites: oinc, kubectl, node
#
# usage:
#   yarn oinc          # setup cluster + start plugin with hot reload
#   yarn oinc:teardown # tear it all down

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
  log "cluster is still running. tear down with: yarn oinc:teardown"
}

if kubectl get nodes &>/dev/null 2>&1; then
  if curl -sf "http://localhost:${CONSOLE_PORT}" >/dev/null 2>&1; then
    log "existing cluster and console detected, skipping setup"
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
