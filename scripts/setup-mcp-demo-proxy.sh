#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"
check_command kubectl "Install kubectl"
check_command jq "Install jq"

if [ "$(kubectl config current-context)" != "oinc" ]; then
  echo "error: select the oinc context before configuring the development MCP proxy" >&2
  exit 1
fi

PLUGIN=kuadrant-console-plugin
NAMESPACE=kuadrant-system
if [ -z "$(kubectl --context=oinc get deployment "${PLUGIN}" -n "${NAMESPACE}" --ignore-not-found -o name)" ]; then
  exit 0
fi

# sslip.io demo hosts resolve to loopback in pods. Resolve each host to its own
# Gateway Service so the Inspector can connect to both gateway instances.
aliases='[]'
for instance in mcp-gateway-system/mcp-gateway-extension mcp-gateway-auth-system/mcp-gateway-auth-extension; do
  extension=$(kubectl --context=oinc get mcpgatewayextension "${instance#*/}" \
    -n "${instance%/*}" --ignore-not-found -o json)
  if [ -z "${extension}" ]; then continue; fi
  gateway=$(jq -r '.spec.targetRef.name' <<<"${extension}")
  namespace=$(jq -r '.spec.targetRef.namespace' <<<"${extension}")
  host=$(jq -r '.spec.publicHost' <<<"${extension}")
  ip=$(kubectl --context=oinc get service "${gateway}-istio" -n "${namespace}" -o jsonpath='{.spec.clusterIP}')
  aliases=$(jq --arg ip "${ip}" --arg host "${host}" \
    '. + [{ip: $ip, hostnames: [$host]}]' <<<"${aliases}")
done

patch=$(kubectl --context=oinc get deployment "${PLUGIN}" -n "${NAMESPACE}" -o json |
  jq --argjson aliases "${aliases}" --arg plugin "${PLUGIN}" '
    .spec.template.spec as $pod |
    {spec: {template: {spec: {
      hostAliases: (($pod.hostAliases // [] | map(
        .hostnames -= [$aliases[].hostnames[]] | select(.hostnames | length > 0)
      )) + $aliases),
      containers: ($pod.containers | map(if .name == $plugin then
        .env = ((.env // [] | map(select(
          .name != "MCP_PROXY_DIAL_ADDRESS" and .name != "MCP_PROXY_ALLOW_INSECURE_AUTH"
        ))) + [{name: "MCP_PROXY_ALLOW_INSECURE_AUTH", value: "true"}])
      else . end))
    }}}}')
kubectl --context=oinc patch deployment "${PLUGIN}" -n "${NAMESPACE}" --type=merge --patch "${patch}"
kubectl --context=oinc rollout status deployment/"${PLUGIN}" -n "${NAMESPACE}" --timeout=5m
