#!/usr/bin/env bash
set -euo pipefail

# e2e environment: shared cluster setup + test fixtures

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=../scripts/lib.sh
source "${REPO_DIR}/scripts/lib.sh"

# --- shared cluster setup ---

"${REPO_DIR}/scripts/cluster-setup.sh"

# --- test RBAC + fixtures ---

log "creating test namespace and RBAC..."
kubectl apply -f "${SCRIPT_DIR}/manifests/test-rbac.yaml"

log "creating test resources..."
kubectl apply -f "${SCRIPT_DIR}/manifests/test-resources.yaml"

log "creating APIProduct test fixtures..."
kubectl apply -f "${SCRIPT_DIR}/manifests/test-apiproduct-fixtures.yaml"

log "e2e setup complete"
