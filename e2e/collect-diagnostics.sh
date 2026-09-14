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
