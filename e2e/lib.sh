#!/usr/bin/env bash
# shared helpers for e2e scripts and local dev

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

get_bearer_token() {
  local sa_secret
  sa_secret=$(kubectl -n kube-system get sa openshift-console -o jsonpath='{.secrets[0].name}' 2>/dev/null || true)

  if [ -n "${sa_secret}" ]; then
    kubectl -n kube-system get secret "${sa_secret}" -o jsonpath='{.data.token}' | base64 -d
  else
    kubectl -n kube-system create token openshift-console --duration=8760h
  fi
}

# start the openshift console container pointing at the cluster API + plugin dev server.
# expects RUNTIME, CONSOLE_PORT, PLUGIN_PORT, CONSOLE_IMAGE to be set by the caller.
start_console() {
  local repo_dir="${1:?repo_dir required}"
  local runtime="${RUNTIME:?RUNTIME not set}"
  local console_port="${CONSOLE_PORT:-9000}"
  local plugin_port="${PLUGIN_PORT:-9001}"
  local console_image="${CONSOLE_IMAGE:-quay.io/openshift/origin-console:latest}"

  # remove old container if it exists
  ${runtime} rm -f e2e-console 2>/dev/null || true

  local plugin_name
  plugin_name=$(node -p "require('${repo_dir}/package.json').consolePlugin.name")

  local bearer_token
  bearer_token=$(get_bearer_token)
  if [ -z "${bearer_token}" ]; then
    echo "error: failed to get bearer token"
    exit 1
  fi

  local api_server
  api_server=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')

  local container_host network_args port_args container_api_server
  if [ "$(uname -s)" = "Linux" ]; then
    container_host="localhost"
    network_args="--network=host"
    port_args=""
    container_api_server="${api_server}"
  else
    if [ "${runtime}" = "podman" ]; then
      container_host="host.containers.internal"
    else
      container_host="host.docker.internal"
    fi
    network_args=""
    port_args="-p ${console_port}:9000"
    container_api_server=$(echo "${api_server}" | sed "s|127\.0\.0\.1\.nip\.io|${container_host}|g" | sed "s|127\.0\.0\.1|${container_host}|g" | sed "s|localhost|${container_host}|g")
  fi

  ${runtime} run -d --name e2e-console --platform linux/amd64 \
    ${network_args} ${port_args} \
    -e BRIDGE_USER_AUTH=disabled \
    -e BRIDGE_K8S_MODE=off-cluster \
    -e BRIDGE_K8S_AUTH=bearer-token \
    -e BRIDGE_K8S_AUTH_BEARER_TOKEN="${bearer_token}" \
    -e BRIDGE_K8S_MODE_OFF_CLUSTER_ENDPOINT="${container_api_server}" \
    -e BRIDGE_K8S_MODE_OFF_CLUSTER_SKIP_VERIFY_TLS=true \
    -e BRIDGE_USER_SETTINGS_LOCATION=localstorage \
    -e "BRIDGE_PLUGINS=${plugin_name}=http://${container_host}:${plugin_port}" \
    -e BRIDGE_I18N_NAMESPACES="plugin__${plugin_name}" \
    "${console_image}"

  log "waiting for console at http://localhost:${console_port}..."
  local retries=30
  while ! curl -sf "http://localhost:${console_port}" >/dev/null 2>&1; do
    retries=$((retries - 1))
    if [ "$retries" -le 0 ]; then
      echo "error: console not reachable after 60s"
      ${runtime} logs e2e-console
      exit 1
    fi
    sleep 2
  done
  log "console ready at http://localhost:${console_port}"
}
