#!/usr/bin/env bash
set -euo pipefail

# Install this checkout's backend through the operator's production proxy contract.
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ "$(kubectl config current-context)" != "oinc" ]; then
  echo "error: the Inspector E2E setup requires the oinc context" >&2
  exit 1
fi

# Remove this pin once Kuadrant/kuadrant-operator#2206 ships in a release.
OPERATOR_REF=db6ab3fdd5403688d4b3b041d1739665a544cf80
PLUGIN_IMAGE=localhost/kuadrant/console-plugin:inspector-e2e
OPERATOR_IMAGE=localhost/kuadrant/kuadrant-operator:inspector-e2e
OPERATOR_DIR=$(mktemp -d)
trap 'rm -rf "${OPERATOR_DIR}"' EXIT

wait_for_image() {
  for attempt in $(seq 1 60); do
    if [ "$(kubectl --context=oinc get deployment/"$1" -n kuadrant-system -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null)" = "$2" ]; then
      return
    fi
    if [ "${attempt}" -eq 60 ]; then
      echo "error: deployment $1 did not receive image $2" >&2
      return 1
    fi
    sleep 2
  done
}

docker build -t "${PLUGIN_IMAGE}" "${REPO_DIR}"
oinc load-image "${PLUGIN_IMAGE}"
git -C "${OPERATOR_DIR}" init --quiet
git -C "${OPERATOR_DIR}" fetch --depth=1 https://github.com/Kuadrant/kuadrant-operator.git "${OPERATOR_REF}"
git -C "${OPERATOR_DIR}" checkout --detach FETCH_HEAD
# The shared smoke suite needs the OIDC, Plan, and Telemetry controllers too.
docker build --build-arg WITH_EXTENSIONS=true -t "${OPERATOR_IMAGE}" "${OPERATOR_DIR}"
oinc load-image "${OPERATOR_IMAGE}"

KUADRANT_CSV=$(kubectl --context=oinc get subscription kuadrant-operator -n kuadrant-system -o jsonpath='{.status.installedCSV}')
kubectl --context=oinc get csv "${KUADRANT_CSV}" -n kuadrant-system -o json |
  jq --arg operator_image "${OPERATOR_IMAGE}" --arg plugin_image "${PLUGIN_IMAGE}" '
    .spec.install.spec.deployments[0].spec.template.spec.containers[0].image = $operator_image |
    .spec.install.spec.deployments[0].spec.template.spec.containers[0].imagePullPolicy = "IfNotPresent" |
    .spec.install.spec.deployments[0].spec.template.spec.containers[0].env = (
      (.spec.install.spec.deployments[0].spec.template.spec.containers[0].env // [] |
        map(select(.name != "CONSOLE_PLUGIN_IMAGE_OVERRIDE"))) +
      [{"name":"CONSOLE_PLUGIN_IMAGE_OVERRIDE", "value":$plugin_image}]
    )' | kubectl --context=oinc replace -f -
wait_for_image kuadrant-operator-controller-manager "${OPERATOR_IMAGE}"
kubectl --context=oinc rollout restart deployment/kuadrant-operator-controller-manager -n kuadrant-system
kubectl --context=oinc rollout status deployment/kuadrant-operator-controller-manager -n kuadrant-system --timeout=5m
wait_for_image kuadrant-console-plugin "${PLUGIN_IMAGE}"
kubectl --context=oinc set env deployment/kuadrant-console-plugin -n kuadrant-system \
  MCP_PROXY_DIAL_ADDRESS=mcp-gateway-istio.gateway-system.svc.cluster.local:80 \
  MCP_PROXY_ALLOW_INSECURE_AUTH=true
kubectl --context=oinc rollout restart deployment/kuadrant-console-plugin -n kuadrant-system
kubectl --context=oinc rollout status deployment/kuadrant-console-plugin -n kuadrant-system --timeout=5m
bash "${REPO_DIR}/scripts/sync-console-plugin-proxy.sh"

# These shared fixtures must remain usable after replacing the operator. Surface
# the actual cluster condition here instead of timing out on a disabled UI option.
for gateway in gateway-system/kuadrant-ingressgateway kuadrant-test/test-gateway; do
  for condition in Accepted Programmed; do
    if ! kubectl --context=oinc wait "gateway/${gateway#*/}" -n "${gateway%/*}" \
      --for="condition=${condition}=True" --timeout=2m; then
      bash "${REPO_DIR}/e2e/collect-diagnostics.sh"
      exit 1
    fi
  done
done
