#!/usr/bin/env bash
set -euo pipefail

# build the plugin image from the working tree, load it into oinc and make it
# the MCP Inspector backend. the tag follows the image content, so rebuilding
# unchanged sources leaves the running backend alone.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

OINC_BIN="${OINC_BIN:-oinc}"
CONSOLE_PORT="${CONSOLE_PORT:-9000}"
PLUGIN_NAME=$(node -p "require('${REPO_DIR}/package.json').consolePlugin.name")

check_command "${OINC_BIN}" "Install oinc v0.5.3 or newer from https://github.com/jasonmadigan/oinc/releases"
check_command kubectl "Install from https://kubernetes.io/docs/tasks/tools/"
if [ "$(kubectl config current-context)" != "oinc" ]; then
  echo "error: select the oinc context before loading a development MCP Inspector backend" >&2
  exit 1
fi

RUNTIME=$(detect_runtime)
ARCH=$(kubectl --context=oinc get nodes -o jsonpath='{.items[0].status.nodeInfo.architecture}')
IID_FILE=$(mktemp)
trap 'rm -f "${IID_FILE}"' EXIT

log "building the plugin image for linux/${ARCH}..."
"${RUNTIME}" build --platform "linux/${ARCH}" --iidfile "${IID_FILE}" "${REPO_DIR}"
IMAGE_ID=$(cat "${IID_FILE}")
DIGEST="${IMAGE_ID#sha256:}"
IMAGE="localhost/kuadrant/console-plugin:dev-${DIGEST:0:12}"
"${RUNTIME}" tag "${IMAGE_ID}" "${IMAGE}"

log "loading ${IMAGE} into oinc..."
"${OINC_BIN}" load-image "${IMAGE}"

CONSOLE_PLUGIN_IMAGE="${IMAGE}" "${SCRIPT_DIR}/setup-inspector-backend.sh"

# the backend Service is unchanged, so an already synced Console keeps working
if ! curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 1 --max-time 5 \
  "http://localhost:${CONSOLE_PORT}/api/proxy/plugin/${PLUGIN_NAME}/backend/healthz" >/dev/null; then
  echo "error: Console cannot reach the backend; run make oinc (or make oinc-sync-plugin-proxy) first" >&2
  exit 1
fi
log "MCP Inspector backend now runs ${IMAGE}"
