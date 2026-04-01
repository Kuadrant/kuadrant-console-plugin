# API Management RBAC Validation Guide

This guide shows how to validate the API Management RBAC roles using kubectl impersonation and manual testing.

## Prerequisites

1. OpenShift cluster with Kuadrant installed
2. kubectl or oc CLI configured
3. Cluster admin access for setting up test personas
4. API Management CRDs installed:
   - `APIProduct` (devportal.kuadrant.io/v1alpha1)
   - `APIKey` (devportal.kuadrant.io/v1alpha1)
   - `APIKeyApproval` (devportal.kuadrant.io/v1alpha1) - **New in this design**
   - `PlanPolicy` (extensions.kuadrant.io/v1alpha1)

## Setup Test Environment

### 1. Apply test RBAC personas

```bash
# Apply the test RBAC configuration
kubectl apply -f e2e/manifests/api-management-rbac.yaml

# Verify namespaces were created
kubectl get namespaces | grep api-
# Expected: api-team-a, api-team-b, api-consumers
```

### 2. Create sample resources for testing

```bash
# Create a sample HTTPRoute in team-a namespace
kubectl apply -f - <<EOF
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: payment-api-route
  namespace: api-team-a
spec:
  parentRefs:
    - name: external
      namespace: api-gateway
  hostnames:
    - api.payment.example.com
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: payment-service
          port: 80
EOF

# Create a sample APIProduct in team-a namespace
kubectl apply -f - <<EOF
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIProduct
metadata:
  name: payment-api-v1
  namespace: api-team-a
spec:
  displayName: Payment API v1
  description: Process payments and manage transactions
  version: v1
  approvalMode: manual
  publishStatus: Published
  tags:
    - payments
    - fintech
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: payment-api-route
EOF

# Create a sample PlanPolicy (requires admin permissions)
kubectl apply -f - <<EOF
apiVersion: extensions.kuadrant.io/v1alpha1
kind: PlanPolicy
metadata:
  name: standard-rate-limits
  namespace: api-team-a
spec:
  targetRef: 
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: payment-api-route
  plans: 
    - limits:
        daily: 1000
      predicate: |
        has(auth.identity) && auth.identity.metadata.annotations["secret.kuadrant.io/plan-id"] == "gold"
      tier: gold
EOF
```

## Validation Tests

### Test 1: API Consumer Persona

**Expected capabilities:**

- ✅ Browse all API products cluster-wide (read-only)
- ✅ View rate limiting plans cluster-wide (read-only)
- ✅ Create APIKey requests in own namespace (`api-consumers`)
- ✅ Read APIKey status to retrieve projected API key value
- ❌ Cannot create API products
- ❌ Cannot create APIKeyApproval resources (cannot approve)
- ❌ Cannot read Secrets in kuadrant namespace (API keys delivered via status projection)
- ❌ Cannot list APIKeys cluster-wide (namespace-scoped only)

```bash
# Test 1.1: Consumer can list all API products
kubectl get apiproducts --all-namespaces --as=test-api-consumer
# Expected: SUCCESS - shows payment-api-v1 in api-team-a

# Test 1.2: Consumer can get specific API product details
kubectl get apiproduct payment-api-v1 -n api-team-a --as=test-api-consumer -o yaml
# Expected: SUCCESS - shows full APIProduct spec

# Test 1.3: Consumer can view rate limiting plans
kubectl get planpolicies --all-namespaces --as=test-api-consumer
# Expected: SUCCESS - shows standard-rate-limits

# Test 1.4: Consumer can create API key request in own namespace
kubectl apply --as=test-api-consumer -f - <<EOF
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: consumer-payment-api-access
  namespace: api-consumers  # Consumer's own namespace
spec:
  apiProductRef:
    name: payment-api-v1
    namespace: api-team-a  # Cross-namespace reference to owner's APIProduct
  planTier: "basic"
  requestedBy:
    userId: "test-api-consumer"
    email: "test-api-consumer@example.com"
  useCase: "Need payment API access for mobile app integration"
EOF
# Expected: SUCCESS - APIKey request created in consumer's namespace

# Test 1.5: Consumer CANNOT create API product
kubectl apply --as=test-api-consumer -n api-consumers -f - <<EOF
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIProduct
metadata:
  name: unauthorized-product
  namespace: api-consumers
spec:
  displayName: Unauthorized Product
  version: v1
  publishStatus: Draft
EOF
# Expected: FAILURE - "forbidden: User 'test-api-consumer' cannot create resource 'apiproducts'"

# Test 1.6: Consumer CANNOT create APIKeyApproval (cannot approve)
kubectl apply --as=test-api-consumer -f - <<EOF
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKeyApproval
metadata:
  name: consumer-payment-api-access-approval
  namespace: api-consumers
spec:
  apiKeyRef:
    name: consumer-payment-api-access
    namespace: api-consumers
  approved: true
  reviewedBy: "test-api-consumer"
  reviewedAt: "2026-03-30T15:00:00Z"
  reason: "SelfApproval"
EOF
# Expected: FAILURE - "forbidden: User 'test-api-consumer' cannot create resource 'apikeyapprovals'"

# Test 1.7: Consumer CANNOT list APIKeys cluster-wide (namespace-scoped only)
kubectl get apikeys --all-namespaces --as=test-api-consumer
# Expected: FAILURE - "forbidden: User 'test-api-consumer' cannot list resource 'apikeys' at the cluster scope"

# Test 1.8: Consumer CAN list APIKeys in own namespace
kubectl get apikeys -n api-consumers --as=test-api-consumer
# Expected: SUCCESS - shows consumer-payment-api-access

# Test 1.9: Consumer CAN read APIKey status (to get projected API key value)
kubectl get apikey consumer-payment-api-access -n api-consumers --as=test-api-consumer -o jsonpath='{.status.apiKeyValue}'
# Expected: SUCCESS - shows projected API key value (if approved and projected by controller)
# If not approved yet, this will be empty

# Test 1.10: Consumer CANNOT read Secrets in kuadrant namespace
kubectl get secrets -n kuadrant --as=test-api-consumer
# Expected: FAILURE - "forbidden: User 'test-api-consumer' cannot list resource 'secrets' in API group '' in the namespace 'kuadrant'"

# Cleanup
kubectl delete apikeys consumer-payment-api-access -n api-consumers
```

### Test 2: API Owner Persona - Team A

**Expected capabilities:**

- ✅ Create/update/delete APIProducts in `api-team-a` namespace
- ✅ Browse all APIProducts cluster-wide (read-only)
- ✅ List APIKeys cluster-wide (to discover requests for own APIs)
- ✅ Create APIKeyApproval resources in own namespace to approve/reject
- ❌ Cannot read Secrets (centralized in kuadrant namespace, managed by controller)
- ❌ Cannot manage APIProducts in `api-team-b` namespace
- ❌ Cannot create APIKeys (consumers create in their own namespaces)
- ❌ Cannot create PlanPolicies

```bash
# Test 2.1: Owner can list all API products (discovery)
kubectl get apiproducts --all-namespaces --as=test-api-owner-team-a
# Expected: SUCCESS - shows products from all namespaces

# Test 2.2: Owner can create APIProduct in own namespace
kubectl apply --as=test-api-owner-team-a -f - <<EOF
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIProduct
metadata:
  name: inventory-api-v1
  namespace: api-team-a
spec:
  displayName: Inventory API v1
  description: Manage product inventory
  version: v1
  approvalMode: automatic
  publishStatus: Published
  tags:
    - inventory
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: payment-api-route
EOF
# Expected: SUCCESS - APIProduct created

# Test 2.3: Owner can update own API product
kubectl patch apiproduct inventory-api-v1 \
  -n api-team-a \
  --as=test-api-owner-team-a \
  --type=merge \
  -p '{"spec":{"description":"Updated: Manage product inventory and stock levels"}}'
# Expected: SUCCESS

# Test 2.4: Owner can delete own API product
kubectl delete apiproduct inventory-api-v1 \
  -n api-team-a \
  --as=test-api-owner-team-a
# Expected: SUCCESS

# Test 2.5: Owner CANNOT create APIProduct in another team's namespace
kubectl apply --as=test-api-owner-team-a -f - <<EOF
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIProduct
metadata:
  name: unauthorized-product
  namespace: api-team-b
spec:
  displayName: Unauthorized Product
  version: v1
  publishStatus: Draft
EOF
# Expected: FAILURE - "forbidden: User 'test-api-owner-team-a' cannot create resource 'apiproducts' in namespace 'api-team-b'"

# Test 2.6: Owner can list APIKeys cluster-wide (to discover requests)
kubectl get apikeys --all-namespaces --as=test-api-owner-team-a
# Expected: SUCCESS - shows APIKeys from all namespaces

# Test 2.7: Owner can approve API key request via APIKeyApproval
# First, create a request as consumer
kubectl apply --as=test-api-consumer -f - <<EOF
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: request-for-team-a-api
  namespace: api-consumers  # Consumer's namespace
spec:
  apiProductRef:
    name: payment-api-v1
    namespace: api-team-a  # Owner's namespace (cross-namespace reference)
  planTier: "basic"
  requestedBy:
    userId: "test-api-consumer"
    email: "test-api-consumer@example.com"
  useCase: "Mobile app integration"
EOF

# Owner discovers the request by filtering cluster-wide APIKeys
kubectl get apikeys --all-namespaces --as=test-api-owner-team-a -o json | \
  jq -r '.items[] | select(.spec.apiProductRef.namespace=="api-team-a") | .metadata.name'
# Expected: Shows "request-for-team-a-api"

# Now owner approves it by creating APIKeyApproval in their own namespace
kubectl apply --as=test-api-owner-team-a -f - <<EOF
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKeyApproval
metadata:
  name: request-for-team-a-api-approval
  namespace: api-team-a  # Owner's namespace
spec:
  apiKeyRef:
    name: request-for-team-a-api
    namespace: api-consumers  # Cross-namespace reference to consumer's APIKey
  approved: true
  reviewedBy: "test-api-owner-team-a"
  reviewedAt: "2026-03-30T15:00:00Z"
  reason: "ApprovedByOwner"
  message: "Approved for mobile team's integration project"
EOF
# Expected: SUCCESS - APIKeyApproval created

# Verify the approval was created
kubectl get apikeyapproval request-for-team-a-api-approval -n api-team-a --as=test-api-owner-team-a
# Expected: SUCCESS - shows the approval

# Cleanup
kubectl delete apikeyapproval request-for-team-a-api-approval -n api-team-a
kubectl delete apikey request-for-team-a-api -n api-consumers

# Test 2.8: Owner CANNOT create PlanPolicy
kubectl apply --as=test-api-owner-team-a -f - <<EOF
apiVersion: extensions.kuadrant.io/v1alpha1
kind: PlanPolicy
metadata:
  name: unauthorized-plan
  namespace: api-team-a
spec:
  name: premium
  displayName: Premium Plan
  limits:
    - period: 1m
      requests: 1000
EOF
# Expected: FAILURE - "forbidden: User 'test-api-owner-team-a' cannot create resource 'planpolicies'"

# Test 2.9: Owner can view HTTPRoutes in own namespace
kubectl get httproutes -n api-team-a --as=test-api-owner-team-a
# Expected: SUCCESS - shows payment-api-route

# Test 2.10: Owner can view HTTPRoutes cluster-wide (for discovery)
kubectl get httproutes --all-namespaces --as=test-api-owner-team-a
# Expected: SUCCESS - shows routes from all namespaces

# Test 2.11: Owner CANNOT read Secrets (centralized in kuadrant namespace, managed by controller)
kubectl get secrets -n kuadrant --as=test-api-owner-team-a
# Expected: FAILURE - "forbidden: User 'test-api-owner-team-a' cannot list resource 'secrets' in namespace 'kuadrant'"

# Test 2.12: Owner CANNOT create APIKeys (consumers create in their namespaces)
kubectl apply --as=test-api-owner-team-a -f - <<EOF
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: owner-created-key
  namespace: api-team-a
spec:
  apiProductRef:
    name: payment-api-v1
    namespace: api-team-a
  planTier: "basic"
  requestedBy:
    userId: "test-api-owner-team-a"
    email: "test-api-owner-team-a@example.com"
  useCase: "Testing"
EOF
# Expected: FAILURE - "forbidden: User 'test-api-owner-team-a' cannot create resource 'apikeys' in namespace 'api-team-a'"
```

### Test 3: API Owner Persona - Team B (Namespace Isolation)

**Expected capabilities:**

- ✅ Manage API products in `api-team-b` namespace
- ❌ Cannot manage API products in `api-team-a` namespace

```bash
# Test 3.1: Team B owner can create APIProduct in team-b namespace
kubectl apply --as=test-api-owner-team-b -f - <<EOF
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIProduct
metadata:
  name: shipping-api-v1
  namespace: api-team-b
spec:
  displayName: Shipping API v1
  description: Track shipments and deliveries
  version: v1
  approvalMode: manual
  publishStatus: Published
  tags:
    - shipping
    - logistics
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: shipping-route
EOF
# Expected: SUCCESS - APIProduct created

# Test 3.2: Team B owner CANNOT modify team A's product
kubectl patch apiproduct payment-api-v1 \
  -n api-team-a \
  --as=test-api-owner-team-b \
  --type=merge \
  -p '{"spec":{"description":"Unauthorized modification"}}'
# Expected: FAILURE - "forbidden: User 'test-api-owner-team-b' cannot update resource in namespace 'api-team-a'"

# Test 3.3: Team B owner CANNOT delete team A's product
kubectl delete apiproduct payment-api-v1 \
  -n api-team-a \
  --as=test-api-owner-team-b
# Expected: FAILURE - "forbidden"

# Cleanup
kubectl delete apiproduct shipping-api-v1 -n api-team-b
```

### Test 4: API Admin Persona

**Expected capabilities:**

- ✅ Full access to all APIProducts across all namespaces
- ✅ Full access to all APIKeys across all namespaces
- ✅ Full access to all APIKeyApprovals across all namespaces
- ✅ Create/update/delete PlanPolicies
- ❌ Do NOT need Secret read permissions (API keys managed by controller in kuadrant namespace)

```bash
# Test 4.1: Admin can list all API products
kubectl get apiproducts --all-namespaces --as=test-api-admin
# Expected: SUCCESS - shows products from all namespaces

# Test 4.2: Admin can create APIProduct in any namespace
kubectl apply --as=test-api-admin -f - <<EOF
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIProduct
metadata:
  name: admin-created-product
  namespace: api-team-a
spec:
  displayName: Admin Created Product
  description: Created by platform admin
  version: v1
  publishStatus: Draft
EOF
# Expected: SUCCESS - APIProduct created

# Test 4.3: Admin can update any API product
kubectl patch apiproduct payment-api-v1 \
  -n api-team-a \
  --as=test-api-admin \
  --type=merge \
  -p '{"spec":{"description":"Updated by admin for troubleshooting"}}'
# Expected: SUCCESS

# Test 4.4: Admin can delete any API product
kubectl delete apiproduct admin-created-product \
  -n api-team-a \
  --as=test-api-admin
# Expected: SUCCESS

# Test 4.5: Admin can view all APIKeys cluster-wide
kubectl get apikeys --all-namespaces --as=test-api-admin
# Expected: SUCCESS - shows all APIKeys from all namespaces

# Test 4.6: Admin can view all APIKeyApprovals cluster-wide
kubectl get apikeyapprovals --all-namespaces --as=test-api-admin
# Expected: SUCCESS - shows all approvals

# Test 4.7: Admin can create APIKeyApproval in any namespace (on behalf of owners)
kubectl apply --as=test-api-admin -f - <<EOF
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKeyApproval
metadata:
  name: admin-created-approval
  namespace: api-team-a
spec:
  apiKeyRef:
    name: some-request
    namespace: api-consumers
  approved: true
  reviewedBy: "test-api-admin"
  reviewedAt: "2026-03-30T15:00:00Z"
  reason: "AdminOverride"
  message: "Approved by admin for troubleshooting"
EOF
# Expected: SUCCESS - APIKeyApproval created

# Cleanup admin-created approval
kubectl delete apikeyapproval admin-created-approval -n api-team-a --as=test-api-admin

# Test 4.8: Admin can create PlanPolicy
kubectl apply --as=test-api-admin -f - <<EOF
apiVersion: extensions.kuadrant.io/v1alpha1
kind: PlanPolicy
metadata:
  name: premium-plan
  namespace: kuadrant-system
spec:
  name: premium
  displayName: Premium Plan
  limits:
    - period: 1m
      requests: 10000
EOF
# Expected: SUCCESS - PlanPolicy created

# Test 4.9: Admin can update PlanPolicy
kubectl patch planpolicy premium-plan \
  -n kuadrant-system \
  --as=test-api-admin \
  --type=merge \
  -p '{"spec":{"displayName":"Premium Plan (Updated)"}}'
# Expected: SUCCESS

# Test 4.10: Admin can delete PlanPolicy
kubectl delete planpolicy premium-plan \
  -n kuadrant-system \
  --as=test-api-admin
# Expected: SUCCESS

# Test 4.11: Admin does NOT need Secret permissions for API Management
# Secrets are managed by Developer Portal Controller in kuadrant namespace
# (TLS/auth secrets may require separate roles, but not for API Management)
```

## Permission Matrix Validation

Use this table to systematically verify all permissions:

### Core API Management Resources

| Resource | Action | Consumer (own NS) | Owner (own NS) | Owner (other NS) | Admin |
|----------|--------|:--------:|:--------------:|:----------------:|:-----:|
| **APIProduct** | get/list (cluster-wide) | ✅ | ✅ | ✅ | ✅ |
| APIProduct | create | ❌ | ✅ | ❌ | ✅ |
| APIProduct | update | ❌ | ✅ | ❌ | ✅ |
| APIProduct | delete | ❌ | ✅ | ❌ | ✅ |
| **APIKey** | get/list (own NS) | ✅ | ❌ | ❌ | ✅ |
| APIKey | get/list (cluster-wide) | ❌ | ✅ | ✅ | ✅ |
| APIKey | create | ✅ | ❌ | ❌ | ✅ |
| APIKey | update | ✅ | ❌ | ❌ | ✅ |
| APIKey | delete | ✅ | ❌ | ❌ | ✅ |
| **APIKey (status)** | get | ✅ | ✅ (cluster-wide) | ✅ (cluster-wide) | ✅ |
| **APIKeyApproval** | get/list | ❌ | ✅ | ❌ | ✅ (cluster-wide) |
| APIKeyApproval | create | ❌ | ✅ | ❌ | ✅ |
| APIKeyApproval | update | ❌ | ✅ | ❌ | ✅ |
| APIKeyApproval | delete | ❌ | ✅ | ❌ | ✅ |
| **Secret** (kuadrant NS) | get | ❌ | ❌ | ❌ | ❌ |
| Secret (kuadrant NS) | list | ❌ | ❌ | ❌ | ❌ |

### Supporting Policies and Routes (Read-Only)

| Resource | Action | Consumer | Owner | Admin |
|----------|--------|:--------:|:-----:|:-----:|
| PlanPolicy | get/list (cluster-wide) | ✅ | ✅ | ✅ |
| PlanPolicy | create/update/delete | ❌ | ❌ | ✅ |
| AuthPolicy | get/list (cluster-wide) | ✅ | ✅ | ✅ |
| RateLimitPolicy | get/list (cluster-wide) | ✅ | ✅ | ✅ |
| HTTPRoute | get/list (cluster-wide) | ✅ | ✅ | ✅ |
| Gateway | get/list (cluster-wide) | ❌ | ✅ | ✅ |

**Key Changes from Old Design:**

- ✅ Consumers create APIKeys in **own namespace** (not owner's namespace)
- ✅ Owners have **cluster-wide read** on APIKeys (to discover requests)
- ✅ Owners create **APIKeyApproval** (not patch APIKey status)
- ✅ Secrets stored in **kuadrant namespace** (centralized, managed by controller)
- ❌ Consumers do NOT have secret read permissions (API keys via status projection)
- ❌ Owners do NOT have secret read permissions (centralized management)
- ❌ Admins do NOT need secret permissions for API Management
- ❌ Owners do NOT create APIKeys (consumers create in their namespaces)

## Automated Validation Script

Save this as `validate-api-rbac.sh`:

```bash
#!/bin/bash
set -e

echo "=== API Management RBAC Validation ==="
echo ""

# Apply RBAC configuration
echo "1. Applying test RBAC personas..."
kubectl apply -f e2e/manifests/api-management-rbac.yaml
echo "✅ RBAC personas applied"
echo ""

# Test Consumer Permissions
echo "2. Testing API Consumer permissions..."
echo "  2.1 Consumer can list API products cluster-wide..."
kubectl auth can-i get apiproducts --all-namespaces --as=test-api-consumer &>/dev/null && echo "    ✅ Pass" || echo "    ❌ Fail"

echo "  2.2 Consumer can create APIKey in own namespace..."
kubectl auth can-i create apikeys -n api-consumers --as=test-api-consumer &>/dev/null && echo "    ✅ Pass" || echo "    ❌ Fail"

echo "  2.3 Consumer CANNOT create APIKey in other namespace..."
kubectl auth can-i create apikeys -n api-team-a --as=test-api-consumer &>/dev/null && echo "    ❌ FAIL - should be denied" || echo "    ✅ Pass"

echo "  2.4 Consumer CANNOT list APIKeys cluster-wide..."
kubectl auth can-i list apikeys --all-namespaces --as=test-api-consumer &>/dev/null && echo "    ❌ FAIL - should be denied" || echo "    ✅ Pass"

echo "  2.5 Consumer CANNOT create APIKeyApproval..."
kubectl auth can-i create apikeyapprovals -n api-consumers --as=test-api-consumer &>/dev/null && echo "    ❌ FAIL - should be denied" || echo "    ✅ Pass"

echo "  2.6 Consumer CANNOT read Secrets in kuadrant namespace..."
kubectl auth can-i get secrets -n kuadrant --as=test-api-consumer &>/dev/null && echo "    ❌ FAIL - should be denied" || echo "    ✅ Pass"

echo "  2.7 Consumer CANNOT create APIProduct..."
kubectl auth can-i create apiproducts -n api-consumers --as=test-api-consumer &>/dev/null && echo "    ❌ FAIL - should be denied" || echo "    ✅ Pass"
echo ""

# Test Owner Permissions
echo "3. Testing API Owner (Team A) permissions..."
echo "  3.1 Owner can list API products cluster-wide..."
kubectl auth can-i get apiproducts --all-namespaces --as=test-api-owner-team-a &>/dev/null && echo "    ✅ Pass" || echo "    ❌ Fail"

echo "  3.2 Owner can create APIProduct in own namespace..."
kubectl auth can-i create apiproducts -n api-team-a --as=test-api-owner-team-a &>/dev/null && echo "    ✅ Pass" || echo "    ❌ Fail"

echo "  3.3 Owner CANNOT create APIProduct in other namespace..."
kubectl auth can-i create apiproducts -n api-team-b --as=test-api-owner-team-a &>/dev/null && echo "    ❌ FAIL - should be denied" || echo "    ✅ Pass"

echo "  3.4 Owner can list APIKeys cluster-wide..."
kubectl auth can-i list apikeys --all-namespaces --as=test-api-owner-team-a &>/dev/null && echo "    ✅ Pass" || echo "    ❌ Fail"

echo "  3.5 Owner CANNOT create APIKey..."
kubectl auth can-i create apikeys -n api-team-a --as=test-api-owner-team-a &>/dev/null && echo "    ❌ FAIL - should be denied" || echo "    ✅ Pass"

echo "  3.6 Owner can create APIKeyApproval in own namespace..."
kubectl auth can-i create apikeyapprovals -n api-team-a --as=test-api-owner-team-a &>/dev/null && echo "    ✅ Pass" || echo "    ❌ Fail"

echo "  3.7 Owner CANNOT create APIKeyApproval in other namespace..."
kubectl auth can-i create apikeyapprovals -n api-team-b --as=test-api-owner-team-a &>/dev/null && echo "    ❌ FAIL - should be denied" || echo "    ✅ Pass"

echo "  3.8 Owner CANNOT read Secrets in kuadrant namespace..."
kubectl auth can-i get secrets -n kuadrant --as=test-api-owner-team-a &>/dev/null && echo "    ❌ FAIL - should be denied" || echo "    ✅ Pass"
echo ""

# Test Admin Permissions
echo "4. Testing API Admin permissions..."
echo "  4.1 Admin can create APIProduct in any namespace..."
kubectl auth can-i create apiproducts -n api-team-a --as=test-api-admin &>/dev/null && echo "    ✅ Pass" || echo "    ❌ Fail"

echo "  4.2 Admin can create APIKeyApproval in any namespace..."
kubectl auth can-i create apikeyapprovals -n api-team-a --as=test-api-admin &>/dev/null && echo "    ✅ Pass" || echo "    ❌ Fail"

echo "  4.3 Admin can list APIKeys cluster-wide..."
kubectl auth can-i list apikeys --all-namespaces --as=test-api-admin &>/dev/null && echo "    ✅ Pass" || echo "    ❌ Fail"

echo "  4.4 Admin can list APIKeyApprovals cluster-wide..."
kubectl auth can-i list apikeyapprovals --all-namespaces --as=test-api-admin &>/dev/null && echo "    ✅ Pass" || echo "    ❌ Fail"

echo "  4.5 Admin can create PlanPolicy..."
kubectl auth can-i create planpolicies -n kuadrant-system --as=test-api-admin &>/dev/null && echo "    ✅ Pass" || echo "    ❌ Fail"

echo "  4.6 Admin can delete APIProduct in any namespace..."
kubectl auth can-i delete apiproducts -n api-team-a --as=test-api-admin &>/dev/null && echo "    ✅ Pass" || echo "    ❌ Fail"

echo "  4.7 Admin does NOT need Secret permissions for API Management..."
kubectl auth can-i get secrets -n kuadrant --as=test-api-admin &>/dev/null && echo "    ❌ FAIL - should be denied" || echo "    ✅ Pass"
echo ""

echo "=== Validation Complete ==="
```

Run with:

```bash
chmod +x validate-api-rbac.sh
./validate-api-rbac.sh
```

## UI Testing

After validating kubectl permissions, test in the OpenShift console:

1. **As API Consumer**:
   - Log in as a user with consumer role
   - Navigate to API Management → API Catalog
   - Verify you can see all published APIs
   - Click "Request Access" and create a request
   - Verify "Create API Product" button is disabled/hidden

2. **As API Owner**:
   - Log in as a user with owner role in a specific namespace
   - Navigate to API Management → My APIs
   - Verify you can create a new API product
   - Switch to another namespace (not your own)
   - Verify "Create API Product" button is disabled

3. **As API Admin**:
   - Log in as a user with admin role
   - Navigate to API Management → All APIs
   - Verify you can see and manage all API products
   - Navigate to API Management → Access Requests
   - Verify you can approve/reject requests from all namespaces
   - Navigate to API Management → Plans
   - Verify you can create/edit rate limiting plans

## Cleanup

```bash
# Remove test namespaces
kubectl delete namespace api-team-a api-team-b api-consumers

# Remove cluster roles and bindings
kubectl delete clusterrole api-consumer-catalog-reader api-owner-catalog-reader api-admin
kubectl delete clusterrolebinding test-api-consumer-catalog-reader-binding test-api-owner-team-a-catalog-reader-binding test-api-owner-team-b-catalog-reader-binding test-api-admin-binding
```

## Troubleshooting

### Issue: "User cannot create resource"

**Cause**: User doesn't have the appropriate role binding in the namespace.

**Solution**:

```bash
# Check role bindings
kubectl get rolebindings -n <namespace>
kubectl describe rolebinding <binding-name> -n <namespace>

# Verify role rules
kubectl describe role <role-name> -n <namespace>
```

### Issue: Owner can't approve API key requests

**Cause**: Owner might not have APIKeyApproval permissions in their namespace, or trying to approve in wrong namespace.

**Solution**:

```bash
# Verify owner can create APIKeyApproval in their namespace
kubectl auth can-i create apikeyapprovals -n api-team-a --as=test-api-owner-team-a

# Check role rules for apikeyapprovals
kubectl describe role api-owner -n api-team-a

# Verify the APIKeyApproval is being created in the owner's namespace (where APIProduct is),
# not in the consumer's namespace (where APIKey is)
```

### Issue: Consumer can see all API key requests cluster-wide

**Cause**: Consumer might have cluster-wide permissions instead of namespace-scoped.

**Solution**:

```bash
# Check for cluster role bindings
kubectl get clusterrolebindings | grep test-api-consumer

# Consumer should only have namespace-scoped role binding
kubectl get rolebindings -n api-consumers | grep test-api-consumer
```
