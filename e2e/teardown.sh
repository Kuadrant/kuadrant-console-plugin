#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

RUNTIME=$(detect_runtime)

# stop console container
log "stopping console container..."
${RUNTIME} rm -f e2e-console 2>/dev/null || true

# delete MINC cluster
if command -v minc &>/dev/null; then
  log "deleting MINC cluster..."
  if [ "${RUNTIME}" = "podman" ]; then
    minc delete --provider podman || true
  else
    minc delete --provider docker || true
  fi
fi

log "teardown complete"
