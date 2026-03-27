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
