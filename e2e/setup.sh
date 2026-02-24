#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

CONSOLE_IMAGE="${CONSOLE_IMAGE:-quay.io/openshift/origin-console:latest}"
CONSOLE_PORT="${CONSOLE_PORT:-9000}"
PLUGIN_PORT="${PLUGIN_PORT:-9001}"
TEST_NAMESPACE="kuadrant-test"

GATEWAY_API_VERSION="${GATEWAY_API_VERSION:-v1.2.1}"
GATEWAY_API_CRDS="https://github.com/kubernetes-sigs/gateway-api/releases/download/${GATEWAY_API_VERSION}/standard-install.yaml"
SAIL_OPERATOR_VERSION="${SAIL_OPERATOR_VERSION:-1.27.1}"
METALLB_VERSION="${METALLB_VERSION:-v0.13.7}"

# --- helpers ---

check_command() {
  if ! command -v "$1" &>/dev/null; then
    echo "error: '$1' not found. $2"
    exit 1
  fi
}

wait_for_api() {
  log "waiting for API server..."
  local retries=60
  while ! kubectl get nodes &>/dev/null; do
    retries=$((retries - 1))
    if [ "$retries" -le 0 ]; then
      echo "error: API server not ready after 120s"
      exit 1
    fi
    sleep 2
  done
  log "API server ready"
}

# --- prerequisites ---

check_command minc "Install from https://github.com/minc-org/minc"
check_command kubectl "Install from https://kubernetes.io/docs/tasks/tools/"
check_command helm "Install from https://helm.sh/docs/intro/install/"

RUNTIME=$(detect_runtime)
log "using container runtime: ${RUNTIME}"

# --- cluster ---

log "creating MINC cluster..."
if [ "$RUNTIME" = "docker" ]; then
  minc create --provider docker
else
  minc create --provider podman
fi

wait_for_api

# --- fix CRI-O storage for OrbStack / non-podman runtimes ---
# OrbStack mounts /host-container as read-only, which breaks CRI-O's
# additionalimagestores. Remove it and restart CRI-O to allow pod scheduling.

MINC_CONTAINER="microshift"
if ${RUNTIME} exec "${MINC_CONTAINER}" grep -q 'additionalimagestores.*host-container' /etc/containers/storage.conf 2>/dev/null; then
  log "fixing CRI-O storage config (removing read-only host-container store)..."
  ${RUNTIME} exec "${MINC_CONTAINER}" sed -i 's|"/host-container"||' /etc/containers/storage.conf
  ${RUNTIME} exec "${MINC_CONTAINER}" systemctl restart crio
  sleep 5
fi

log "waiting for node Ready..."
RETRIES=60
while true; do
  NODE_READY=$(kubectl get nodes -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
  if [ "${NODE_READY}" = "True" ]; then
    break
  fi
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    echo "error: node not Ready after 300s"
    kubectl describe node 2>&1 | tail -10
    exit 1
  fi
  sleep 5
done
log "node Ready"

# --- Gateway API ---

log "installing Gateway API CRDs (${GATEWAY_API_VERSION})..."
kubectl apply -f "${GATEWAY_API_CRDS}"

# --- cert-manager (kuadrant dependency) ---

log "installing cert-manager..."
helm repo add jetstack https://charts.jetstack.io --force-update
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version v1.15.3 \
  --set crds.enabled=true \
  --wait --timeout 120s

# --- MetalLB (LoadBalancer IPs for gateways) ---

log "installing MetalLB..."
kubectl apply -f "https://raw.githubusercontent.com/metallb/metallb/${METALLB_VERSION}/config/manifests/metallb-native.yaml"

# grant SCC for MicroShift
kubectl patch scc privileged --type=json \
  -p '[{"op":"add","path":"/users/-","value":"system:serviceaccount:metallb-system:controller"},{"op":"add","path":"/users/-","value":"system:serviceaccount:metallb-system:speaker"}]' 2>/dev/null || true

kubectl -n metallb-system wait --for=condition=Available deployments controller --timeout=120s

# configure IP pool from container network
DOCKER_SUBNET=$(${RUNTIME} network inspect bridge -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || echo "172.18.0.0/16")
POOL_PREFIX=$(echo "${DOCKER_SUBNET}" | sed 's|\.[0-9]*/.*|.200|')
POOL_END=$(echo "${DOCKER_SUBNET}" | sed 's|\.[0-9]*/.*|.220|')

log "MetalLB pool: ${POOL_PREFIX}-${POOL_END}"
kubectl apply -f - <<EOF
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: e2e-pool
  namespace: metallb-system
spec:
  addresses:
  - ${POOL_PREFIX}-${POOL_END}
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: e2e-l2
  namespace: metallb-system
EOF

# --- Istio (gateway API provider) ---

log "installing Sail operator (Istio)..."
helm install sail-operator \
  --create-namespace \
  --namespace istio-system \
  --wait --timeout=300s \
  "https://github.com/istio-ecosystem/sail-operator/releases/download/${SAIL_OPERATOR_VERSION}/sail-operator-${SAIL_OPERATOR_VERSION}.tgz"

log "creating Istio instance..."
kubectl apply -f - <<EOF
apiVersion: sailoperator.io/v1
kind: Istio
metadata:
  name: default
spec:
  version: v${SAIL_OPERATOR_VERSION}
  namespace: istio-system
  values:
    pilot:
      autoscaleEnabled: false
EOF

log "waiting for Istio..."
RETRIES=60
while true; do
  ISTIO_READY=$(kubectl get istio default -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)
  if [ "${ISTIO_READY}" = "True" ]; then
    break
  fi
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    log "warning: Istio not fully ready"
    break
  fi
  sleep 5
done

log "creating gateway..."
kubectl create namespace gateway-system 2>/dev/null || true
kubectl apply -f - <<EOF
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: kuadrant-ingressgateway
  namespace: gateway-system
spec:
  gatewayClassName: istio
  listeners:
  - name: http
    port: 80
    protocol: HTTP
    allowedRoutes:
      namespaces:
        from: All
EOF

# --- kuadrant operator ---

log "installing kuadrant operator..."
helm repo add kuadrant https://kuadrant.io/helm-charts/ --force-update
helm install kuadrant-operator kuadrant/kuadrant-operator \
  --namespace kuadrant-system \
  --create-namespace \
  --wait --timeout 180s || {
    # operator pods may not fully start without a gateway provider - that's OK
    # we just need the CRDs registered
    log "warning: helm install did not fully complete (expected without gateway provider)"
    log "checking CRDs are registered..."
    kubectl get crd authpolicies.kuadrant.io || { echo "error: kuadrant CRDs not installed"; exit 1; }
  }

log "installed CRDs:"
kubectl get crd | grep -E "kuadrant|gateway"

# --- kuadrant instance ---

log "creating Kuadrant instance..."
kubectl apply -f - <<EOF
apiVersion: kuadrant.io/v1beta1
kind: Kuadrant
metadata:
  name: kuadrant
  namespace: kuadrant-system
EOF

log "waiting for Kuadrant to be ready..."
RETRIES=60
while true; do
  READY=$(kubectl get kuadrant kuadrant -n kuadrant-system -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)
  if [ "${READY}" = "True" ]; then
    break
  fi
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    log "warning: Kuadrant not fully ready"
    kubectl get kuadrant kuadrant -n kuadrant-system -o jsonpath='{.status.conditions}' 2>/dev/null || true
    echo ""
    break
  fi
  sleep 5
done
log "Kuadrant ready"

# --- ConsolePlugin CRD (not part of kuadrant, from openshift/api) ---

log "installing ConsolePlugin CRD..."
kubectl apply -f "${SCRIPT_DIR}/manifests/consoleplugin-crd.yaml"

# --- namespace + RBAC ---

log "creating test namespace and RBAC..."
kubectl apply -f "${SCRIPT_DIR}/manifests/test-rbac.yaml"

log "applying console SA and impersonation RBAC..."
kubectl apply -f "${SCRIPT_DIR}/manifests/console.yaml"

# --- test fixtures ---

log "creating test resources..."
kubectl apply -f "${SCRIPT_DIR}/manifests/test-resources.yaml"

# --- console ---

start_console "${REPO_DIR}"
log "setup complete"
