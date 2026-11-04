#!/usr/bin/env bash
set -uo pipefail

# Keep failed setup and browser runs diagnosable before the disposable cluster is removed.
# Do not collect Secrets or API key resources.
kubectl --context=oinc get gateways.gateway.networking.k8s.io -A -o yaml 2>&1 || true
kubectl --context=oinc get pods -A -o wide 2>&1 || true
kubectl --context=oinc get services -A -o wide 2>&1 || true
kubectl --context=oinc get ipaddresspools.metallb.io -A -o yaml 2>&1 || true
kubectl --context=oinc get events -A --field-selector type=Warning --sort-by='.lastTimestamp' 2>&1 || true
kubectl --context=oinc logs -n istio-system deployment/istiod --tail=100 2>&1 || true
kubectl --context=oinc logs -n metallb-system deployment/controller --tail=100 2>&1 || true
kubectl --context=oinc logs -n kuadrant-system deployment/kuadrant-operator-controller-manager --all-containers --tail=100 2>&1 || true
kubectl --context=oinc get authpolicies.kuadrant.io,mcpgatewayextensions.mcp.kuadrant.io,mcpserverregistrations.mcp.kuadrant.io -A -o yaml 2>&1 || true
# demo gateways, their brokers and servers, and the controller behind the inspector journeys
for workload in gateway-system/mcp-gateway-istio gateway-system/mcp-gateway-auth-istio \
  mcp-gateway-system/mcp-gateway mcp-gateway-auth-system/mcp-gateway kuadrant-system/mcp-gateway-controller \
  toystore/mcp-test-server toystore/mcp-test-stateless-server; do
  kubectl --context=oinc logs -n "${workload%%/*}" "deployment/${workload#*/}" --all-containers --tail=200 2>&1 || true
done
# fetch failures with no successes mean the gateway is stuck answering 503 wasm_fail_stream
for gateway in mcp-gateway mcp-gateway-auth; do
  kubectl --context=oinc exec -n gateway-system "deployment/${gateway}-istio" -c istio-proxy -- \
    pilot-agent request GET 'stats?filter=^(wasm|listener_manager|cluster_manager)\.' 2>&1 || true
done
