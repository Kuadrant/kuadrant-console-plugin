#!/usr/bin/env bash
# shared helpers for cluster scripts and local dev

log() { echo "==> $*"; }

detect_runtime() {
  if command -v podman &>/dev/null; then
    echo "podman"
  elif command -v docker &>/dev/null; then
    echo "docker"
  else
    echo "error: no container runtime found (need podman or docker)"
    exit 1
  fi
}

# resolve the hostname that containers use to reach the host machine
container_host() {
  local runtime="${1:-docker}"
  if [ "$(uname -s)" = "Linux" ]; then
    echo "localhost"
  elif [ "${runtime}" = "podman" ]; then
    echo "host.containers.internal"
  else
    echo "host.docker.internal"
  fi
}

check_command() {
  if ! command -v "$1" &>/dev/null; then
    echo "error: '$1' not found. $2"
    exit 1
  fi
}

# The HTTPRoute CRUD tests select this Gateway in both OINC and existing-cluster runs.
render_http_route_gateway() {
  local mode="${1:-}"
  case "${mode}" in
    oinc|existing) ;;
    *) echo "error: gateway mode must be 'oinc' or 'existing'" >&2; return 1 ;;
  esac

  cat <<EOF
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: kuadrant-ingressgateway
  namespace: gateway-system
EOF
  if [[ "${mode}" == existing ]]; then
    cat <<EOF
  labels:
    kuadrant.io/e2e-owned: console-plugin
EOF
  fi
  cat <<EOF
spec:
  gatewayClassName: istio
EOF
  if [[ "${mode}" == oinc ]]; then
    cat <<EOF
  infrastructure:
    parametersRef:
      group: ""
      kind: ConfigMap
      name: metallb-gateway-params
EOF
  fi
  cat <<EOF
  listeners:
  - name: http
    port: 80
    protocol: HTTP
    allowedRoutes:
      namespaces:
        from: All
EOF
}
