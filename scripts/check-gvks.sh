#!/usr/bin/env bash
# Compare the GroupVersionKinds hardcoded in src/utils/resources.ts against the
# CRDs shipped by the kuadrant-operator, and optionally update resources.ts when
# they drift.
#
# The upstream source of truth is the kuadrant-operator `config/manifests`
# kustomize target, which aggregates the kuadrant.io, extensions.kuadrant.io and
# devportal.kuadrant.io CRDs the console plugin cares about (see issue #74).
#
# Usage:
#   scripts/check-gvks.sh          # report drift, exit 1 if any (CI gate / local)
#   scripts/check-gvks.sh --fix    # rewrite resources.ts to match upstream, exit 0
#
# Environment:
#   KUADRANT_OPERATOR_REF   git ref to build from (default: main)
#   GVK_REPORT              if set, a markdown drift report is written to this path
#
# Requirements: kubectl (provides `kubectl kustomize`) and yq (mikefarah v4).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESOURCES_FILE="${REPO_ROOT}/src/utils/resources.ts"

REF="${KUADRANT_OPERATOR_REF:-main}"
KUSTOMIZE_TARGET="github.com/Kuadrant/kuadrant-operator/config/manifests?ref=${REF}"

# Safety floor: refuse to act if the upstream build returns fewer CRDs than this.
# Protects against an upstream layout change silently wiping every GVK.
MIN_EXPECTED_CRDS=8

FIX=false
[[ "${1:-}" == "--fix" ]] && FIX=true

log() { echo "==> $*"; }
err() { echo "error: $*" >&2; exit 1; }

command -v kubectl >/dev/null 2>&1 || err "'kubectl' not found (needed for 'kubectl kustomize')"
command -v yq >/dev/null 2>&1 || err "'yq' (mikefarah v4) not found"
[[ -f "${RESOURCES_FILE}" ]] || err "resources file not found: ${RESOURCES_FILE}"

# --- 1. Upstream GVKs from the kuadrant-operator -----------------------------
# Emit "Kind group version" per CRD, using each CRD's storage (canonical) version.
log "Building upstream CRDs from ${KUSTOMIZE_TARGET}"
upstream_raw="$(kubectl kustomize "${KUSTOMIZE_TARGET}" \
  | yq '. | select(.kind == "CustomResourceDefinition")
            | [.spec.names.kind, .spec.group, (.spec.versions[] | select(.storage == true) | .name)]
            | join(" ")')"

upstream_count="$(grep -c . <<<"${upstream_raw}" || true)"
if (( upstream_count < MIN_EXPECTED_CRDS )); then
  err "only ${upstream_count} upstream CRDs found (expected >= ${MIN_EXPECTED_CRDS}); aborting to avoid a destructive update"
fi
log "Found ${upstream_count} upstream Kuadrant CRDs"

declare -A UP_GROUP UP_VERSION
while read -r kind group version; do
  [[ -z "${kind}" ]] && continue
  UP_GROUP["${kind}"]="${group}"
  UP_VERSION["${kind}"]="${version}"
done <<<"${upstream_raw}"

# --- 2. Local GVKs declared in resources.ts ----------------------------------
# Matches lines like: gvk: { group: 'kuadrant.io', version: 'v1', kind: 'AuthPolicy' },
# Tolerant of arbitrary spacing and single or double quotes, so reformatting
# resources.ts (e.g. via Prettier) does not silently break drift detection.
local_raw="$(sed -nE 's/.*gvk:[[:space:]]*\{[[:space:]]*group:[[:space:]]*["'\'']([^"'\'']*)["'\''][[:space:]]*,[[:space:]]*version:[[:space:]]*["'\'']([^"'\'']*)["'\''][[:space:]]*,[[:space:]]*kind:[[:space:]]*["'\'']([^"'\'']*)["'\''].*/\3 \1 \2/p' "${RESOURCES_FILE}")"

# --- 3. Diff (keyed by GVK, scoped to kinds the plugin declares) --------------
drift=false
report=""
while read -r kind group version; do
  [[ -z "${kind}" ]] && continue
  # Only compare kinds the operator actually ships (skips Gateway API, Istio,
  # ConfigMap, ConsolePlugin and any dependency CRD not in config/manifests).
  [[ -n "${UP_GROUP[${kind}]:-}" ]] || continue

  up_group="${UP_GROUP[${kind}]}"
  up_version="${UP_VERSION[${kind}]}"
  if [[ "${group}" != "${up_group}" || "${version}" != "${up_version}" ]]; then
    drift=true
    line="${kind}: ${group}/${version} (plugin) -> ${up_group}/${up_version} (operator)"
    echo "DRIFT  ${line}"
    report+="- \`${kind}\`: \`${group}/${version}\` -> \`${up_group}/${up_version}\`"$'\n'

    if [[ "${FIX}" == true ]]; then
      # Avoid `sed -i` (GNU and BSD/macOS syntax differ); write via a temp file.
      tmp="$(mktemp)"
      sed -E "s|(gvk: \{ group: ')[^']*(', version: ')[^']*(', kind: '${kind}' \})|\1${up_group}\2${up_version}\3|" "${RESOURCES_FILE}" > "${tmp}"
      mv "${tmp}" "${RESOURCES_FILE}"
    fi
  else
    echo "OK     ${kind}: ${group}/${version}"
  fi
done <<<"${local_raw}"

# --- 4. Outcome --------------------------------------------------------------
if [[ -n "${GVK_REPORT:-}" && -n "${report}" ]]; then
  {
    echo "Automated GVK drift detected against \`kuadrant-operator\` (ref: \`${REF}\`)."
    echo
    echo "${report}"
  } > "${GVK_REPORT}"
fi

if [[ "${drift}" == false ]]; then
  log "GVKs are in sync with kuadrant-operator (${REF})"
  exit 0
fi

if [[ "${FIX}" == true ]]; then
  log "Updated ${RESOURCES_FILE#"${REPO_ROOT}"/} to match upstream"
  exit 0
fi

log "GVK drift detected (run with --fix to update resources.ts)"
exit 1
