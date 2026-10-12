#!/usr/bin/env bash
# Render shared E2E manifests for OINC or an existing OpenShift cluster.
# Teardown mode emits only namespaced resources; other resources are deleted
# separately after ownership checks.
set -euo pipefail

USE_EXISTING_CLUSTER="${E2E_USE_EXISTING_CLUSTER:-false}"
case "${USE_EXISTING_CLUSTER}" in
  true|false)
    ;;
  *)
    echo "ERROR: E2E_USE_EXISTING_CLUSTER must be 'true' or 'false' (got '${USE_EXISTING_CLUSTER}')" >&2
    exit 1
    ;;
esac

FOR_TEARDOWN=false
FILES=()
for arg in "$@"; do
  if [[ "${arg}" == '--for-teardown' ]]; then
    FOR_TEARDOWN=true
  else
    FILES+=("${arg}")
  fi
done

if [[ "${#FILES[@]}" -eq 0 ]]; then
  echo "ERROR: pass one or more fixture manifest paths to render" >&2
  exit 1
fi

LOAD_BALANCER_CLASS="${E2E_LOAD_BALANCER_CLASS:-}"
if [[ -z "${LOAD_BALANCER_CLASS}" && "${USE_EXISTING_CLUSTER}" == false ]]; then
  LOAD_BALANCER_CLASS='oinc.io/metallb'
fi

awk \
  -v use_existing_cluster="${USE_EXISTING_CLUSTER}" \
  -v for_teardown="${FOR_TEARDOWN}" \
  -v load_balancer_class="${LOAD_BALANCER_CLASS}" '
function emit_document(    i, kind, name, line, has_namespace, skip_infrastructure) {
  if (document_line_count == 0) {
    return
  }

  kind = ""
  name = ""
  has_namespace = 0
  for (i = 1; i <= document_line_count; i++) {
    if (kind == "" && document_lines[i] ~ /^kind:[[:space:]]*/) {
      kind = document_lines[i]
      sub(/^kind:[[:space:]]*/, "", kind)
    }
    if (name == "" && document_lines[i] ~ /^  name:[[:space:]]*/) {
      name = document_lines[i]
      sub(/^  name:[[:space:]]*/, "", name)
    }
    if (document_lines[i] ~ /^  namespace:[[:space:]]*/) {
      has_namespace = 1
    }
  }

  if (kind == "" || (for_teardown == "true" && has_namespace == 0)) {
    document_line_count = 0
    return
  }

  if (for_teardown != "true" && use_existing_cluster == "true" &&
      load_balancer_class == "" && kind == "ConfigMap" &&
      name == "metallb-gateway-params") {
    document_line_count = 0
    return
  }

  skip_infrastructure = 0
  if (emitted_documents > 0) {
    print "---"
  }

  for (i = 1; i <= document_line_count; i++) {
    line = document_lines[i]

    if (for_teardown != "true" && kind == "Gateway" &&
        use_existing_cluster == "true" && load_balancer_class == "") {
      if (line ~ /^  infrastructure:[[:space:]]*$/) {
        skip_infrastructure = 1
        continue
      }
      if (skip_infrastructure && line ~ /^  [^[:space:]]/) {
        skip_infrastructure = 0
      }
      if (skip_infrastructure) {
        continue
      }
    }

    if (for_teardown != "true" && load_balancer_class != "" &&
        line ~ /^[[:space:]]*loadBalancerClass:[[:space:]]*/) {
      sub(/loadBalancerClass:.*/, "", line)
      line = line "loadBalancerClass: " load_balancer_class
    }

    print line
  }

  emitted_documents++
  document_line_count = 0
}

BEGIN {
  document_line_count = 0
  emitted_documents = 0
}

/^---[[:space:]]*$/ {
  emit_document()
  next
}

{
  document_lines[++document_line_count] = $0
}

END {
  emit_document()
}
' "${FILES[@]}"
