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

log "applying RBAC roles..."
kubectl apply -f "${REPO_DIR}/config/rbac/api-management/api-owner-clusterrole.yaml"

log "creating test namespace and RBAC..."
kubectl apply -f "${SCRIPT_DIR}/manifests/test-rbac.yaml"

log "creating test resources..."
kubectl apply -f "${SCRIPT_DIR}/manifests/test-resources.yaml"

log "creating APIProduct test fixtures..."
kubectl apply -f "${SCRIPT_DIR}/manifests/test-apiproduct-fixtures.yaml"

log "creating APIKey consumer fixtures (controller will create APIKeyRequests)..."
kubectl apply -f "${SCRIPT_DIR}/manifests/test-apikey-fixtures.yaml"

log "waiting for controller to create all 9 APIKeyRequests in kuadrant-test..."
timeout 90 bash -c 'until [ "$(kubectl get apikeyrequests -n kuadrant-test --no-headers 2>/dev/null | wc -l)" -ge 9 ]; do sleep 2; done' \
  || { echo "ERROR: APIKeyRequests not all created after 90s (found $(kubectl get apikeyrequests -n kuadrant-test --no-headers 2>/dev/null | wc -l))"; exit 1; }

log "e2e setup complete"
