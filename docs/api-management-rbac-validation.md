# API Management RBAC Validation Guide

This guide shows how to validate the API Management RBAC roles using kubectl impersonation and manual testing.

## Prerequisites

1. OpenShift cluster with Kuadrant installed
2. kubectl or oc CLI configured
3. Cluster admin access for setting up test personas
4. API Management CRDs installed (APIProduct, APIKeyRequest, PlanPolicy)

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
apiVersion: extensions.kuadrant.io/v1alpha1
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
  documentation:
    url: https://docs.example.com/payment-api
EOF

# Create a sample PlanPolicy (requires admin permissions)
kubectl apply -f - <<EOF
apiVersion: extensions.kuadrant.io/v1alpha1
kind: PlanPolicy
metadata:
  name: standard-rate-limits
  namespace: kuadrant-system
spec:
  name: standard
  displayName: Standard Plan
  limits:
    - period: 1m
      requests: 100
EOF
```

## Validation Tests

### Test 1: API Consumer Persona

**Expected capabilities:**
- ✅ Browse all API products (read-only)
- ✅ View rate limiting plans (read-only)
- ✅ Create API key requests in `api-consumers` namespace
- ❌ Cannot create API products
- ❌ Cannot approve API key requests in other namespaces

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
apiVersion: extensions.kuadrant.io/v1alpha1
kind: APIKeyRequest
metadata:
  name: consumer-payment-api-access
  namespace: api-consumers
spec:
  apiProductRef:
    name: payment-api-v1
    namespace: api-team-a
  justification: "Need payment API access for mobile app integration"
EOF
# Expected: SUCCESS - request created

# Test 1.5: Consumer CANNOT create API product
kubectl apply --as=test-api-consumer -n api-consumers -f - <<EOF
apiVersion: extensions.kuadrant.io/v1alpha1
kind: APIProduct
metadata:
  name: unauthorized-product
  namespace: api-consumers
spec:
  displayName: Unauthorized Product
  version: v1
  publishStatus: Draft
EOF
# Expected: FAILURE - "forbidden: User 'test-api-consumer' cannot create resource"

# Test 1.6: Consumer CANNOT approve requests in other namespaces
kubectl patch apikeyrequests consumer-payment-api-access \
  -n api-consumers \
  --as=test-api-consumer \
  --type=merge \
  -p '{"status":{"approved":true}}'
# Expected: This depends on whether status is a separate subresource
# If status is separate, consumer cannot update it (forbidden)
# If status is part of spec, consumer can update (but operator should validate)

# Cleanup
kubectl delete apikeyrequests consumer-payment-api-access -n api-consumers
```

### Test 2: API Owner Persona - Team A

**Expected capabilities:**
- ✅ Create/update/delete API products in `api-team-a` namespace
- ✅ Browse all API products cluster-wide (read-only)
- ✅ Approve/reject API key requests in `api-team-a` namespace
- ❌ Cannot manage API products in `api-team-b` namespace
- ❌ Cannot create PlanPolicies

```bash
# Test 2.1: Owner can list all API products (discovery)
kubectl get apiproducts --all-namespaces --as=test-api-owner-team-a
# Expected: SUCCESS - shows products from all namespaces

# Test 2.2: Owner can create API product in own namespace
kubectl apply --as=test-api-owner-team-a -f - <<EOF
apiVersion: extensions.kuadrant.io/v1alpha1
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
# Expected: SUCCESS - product created

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

# Test 2.5: Owner CANNOT create API product in another team's namespace
kubectl apply --as=test-api-owner-team-a -f - <<EOF
apiVersion: extensions.kuadrant.io/v1alpha1
kind: APIProduct
metadata:
  name: unauthorized-product
  namespace: api-team-b
spec:
  displayName: Unauthorized Product
  version: v1
  publishStatus: Draft
EOF
# Expected: FAILURE - "forbidden: User 'test-api-owner-team-a' cannot create resource in namespace 'api-team-b'"

# Test 2.6: Owner can approve API key request in own namespace
# First, create a request as consumer
kubectl apply --as=test-api-consumer -f - <<EOF
apiVersion: extensions.kuadrant.io/v1alpha1
kind: APIKeyRequest
metadata:
  name: request-for-team-a-api
  namespace: api-team-a
spec:
  apiProductRef:
    name: payment-api-v1
    namespace: api-team-a
  justification: "Mobile app integration"
EOF

# Now owner approves it
kubectl patch apikeyrequests request-for-team-a-api \
  -n api-team-a \
  --as=test-api-owner-team-a \
  --type=merge \
  -p '{"spec":{"approved":true}}'
# Expected: SUCCESS - request approved

# Cleanup
kubectl delete apikeyrequests request-for-team-a-api -n api-team-a

# Test 2.7: Owner CANNOT create PlanPolicy
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
# Expected: FAILURE - "forbidden: User 'test-api-owner-team-a' cannot create resource"

# Test 2.8: Owner can view HTTPRoutes in own namespace
kubectl get httproutes -n api-team-a --as=test-api-owner-team-a
# Expected: SUCCESS - shows payment-api-route

# Test 2.9: Owner can view HTTPRoutes cluster-wide (for discovery)
kubectl get httproutes --all-namespaces --as=test-api-owner-team-a
# Expected: SUCCESS - shows routes from all namespaces
```

### Test 3: API Owner Persona - Team B (Namespace Isolation)

**Expected capabilities:**
- ✅ Manage API products in `api-team-b` namespace
- ❌ Cannot manage API products in `api-team-a` namespace

```bash
# Test 3.1: Team B owner can create product in team-b namespace
kubectl apply --as=test-api-owner-team-b -f - <<EOF
apiVersion: extensions.kuadrant.io/v1alpha1
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
# Expected: SUCCESS

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
- ✅ Full access to all API products across all namespaces
- ✅ Full access to all API key requests across all namespaces
- ✅ Create/update/delete PlanPolicies

```bash
# Test 4.1: Admin can list all API products
kubectl get apiproducts --all-namespaces --as=test-api-admin
# Expected: SUCCESS - shows products from all namespaces

# Test 4.2: Admin can create API product in any namespace
kubectl apply --as=test-api-admin -f - <<EOF
apiVersion: extensions.kuadrant.io/v1alpha1
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
# Expected: SUCCESS

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

# Test 4.5: Admin can view all API key requests
kubectl get apikeyrequests --all-namespaces --as=test-api-admin
# Expected: SUCCESS

# Test 4.6: Admin can create PlanPolicy
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
# Expected: SUCCESS

# Test 4.7: Admin can update PlanPolicy
kubectl patch planpolicy premium-plan \
  -n kuadrant-system \
  --as=test-api-admin \
  --type=merge \
  -p '{"spec":{"displayName":"Premium Plan (Updated)"}}'
# Expected: SUCCESS

# Test 4.8: Admin can delete PlanPolicy
kubectl delete planpolicy premium-plan \
  -n kuadrant-system \
  --as=test-api-admin
# Expected: SUCCESS
```

## Permission Matrix Validation

Use this table to systematically verify all permissions:

| Resource | Action | Consumer | Owner (own NS) | Owner (other NS) | Admin |
|----------|--------|----------|----------------|------------------|-------|
| APIProduct | list (cluster-wide) | ✅ | ✅ | ✅ | ✅ |
| APIProduct | get | ✅ | ✅ | ✅ | ✅ |
| APIProduct | create | ❌ | ✅ | ❌ | ✅ |
| APIProduct | update | ❌ | ✅ | ❌ | ✅ |
| APIProduct | delete | ❌ | ✅ | ❌ | ✅ |
| APIKeyRequest | list (own NS) | ✅ | ✅ | - | ✅ |
| APIKeyRequest | list (other NS) | ❌ | ❌ | ❌ | ✅ |
| APIKeyRequest | create | ✅ | ✅ | ❌ | ✅ |
| APIKeyRequest | update (approve) | ❌ | ✅ | ❌ | ✅ |
| APIKeyRequest | delete | ✅ (own) | ✅ | ❌ | ✅ |
| PlanPolicy | list | ✅ | ✅ | ✅ | ✅ |
| PlanPolicy | get | ✅ | ✅ | ✅ | ✅ |
| PlanPolicy | create | ❌ | ❌ | ❌ | ✅ |
| PlanPolicy | update | ❌ | ❌ | ❌ | ✅ |
| PlanPolicy | delete | ❌ | ❌ | ❌ | ✅ |

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

# Test Consumer
echo "2. Testing API Consumer..."
kubectl get apiproducts --all-namespaces --as=test-api-consumer &>/dev/null && echo "✅ Consumer can list products" || echo "❌ Consumer cannot list products"
kubectl create apiproduct test -n api-consumers --as=test-api-consumer --dry-run=client -o yaml &>/dev/null && echo "❌ Consumer can create products (SHOULD FAIL)" || echo "✅ Consumer cannot create products"
echo ""

# Test Owner Team A
echo "3. Testing API Owner (Team A)..."
kubectl get apiproducts --all-namespaces --as=test-api-owner-team-a &>/dev/null && echo "✅ Owner can list products" || echo "❌ Owner cannot list products"
kubectl auth can-i create apiproducts --as=test-api-owner-team-a -n api-team-a &>/dev/null && echo "✅ Owner can create products in own namespace" || echo "❌ Owner cannot create products in own namespace"
kubectl auth can-i create apiproducts --as=test-api-owner-team-a -n api-team-b &>/dev/null && echo "❌ Owner can create products in other namespace (SHOULD FAIL)" || echo "✅ Owner cannot create products in other namespace"
echo ""

# Test Admin
echo "4. Testing API Admin..."
kubectl auth can-i create apiproducts --as=test-api-admin -n api-team-a &>/dev/null && echo "✅ Admin can create products in any namespace" || echo "❌ Admin cannot create products"
kubectl auth can-i create planpolicies --as=test-api-admin -n kuadrant-system &>/dev/null && echo "✅ Admin can create plan policies" || echo "❌ Admin cannot create plan policies"
kubectl auth can-i delete apiproducts --as=test-api-admin -n api-team-a &>/dev/null && echo "✅ Admin can delete products in any namespace" || echo "❌ Admin cannot delete products"
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
kubectl delete clusterrole test-api-consumer-catalog-reader test-api-owner-catalog-reader test-api-admin
kubectl delete clusterrolebinding test-api-consumer-catalog-reader test-api-owner-team-a-catalog-reader test-api-owner-team-b-catalog-reader test-api-admin
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

**Cause**: APIKeyRequest might be in a different namespace than expected.

**Solution**:
- Verify the request is in the same namespace as the API product
- Check that owner has update permission on apikeyrequests resource

### Issue: Consumer can see all API key requests cluster-wide

**Cause**: Consumer might have cluster-wide permissions instead of namespace-scoped.

**Solution**:
```bash
# Check for cluster role bindings
kubectl get clusterrolebindings | grep test-api-consumer

# Consumer should only have namespace-scoped role binding
kubectl get rolebindings -n api-consumers | grep test-api-consumer
```
