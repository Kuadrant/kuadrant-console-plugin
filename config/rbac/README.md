# RBAC Configuration for API Management

This directory contains Kubernetes RBAC role definitions for the Kuadrant Console Plugin's API Management features.

## Available Roles

### 1. API Consumer (`api-consumer-role.yaml`)

**Use case**: Developers who discover and consume APIs

Grants permissions to:
- Browse all API products (cluster-wide, read-only)
- View rate limiting plans (read-only)
- Create and manage API key requests in assigned namespace

**How to deploy**:

```bash
# 1. Create a namespace for consumers
kubectl create namespace consumer-team-x

# 2. Apply the consumer role
kubectl apply -f api-consumer-role.yaml -n consumer-team-x

# 3. Bind to a user
kubectl create rolebinding api-consumer-alice \
  --role=api-consumer \
  --user=alice \
  -n consumer-team-x

# 4. Grant catalog browsing (cluster-wide read)
kubectl create clusterrolebinding api-consumer-catalog-alice \
  --clusterrole=api-consumer-catalog-reader \
  --user=alice
```

**Or bind to a group**:

```bash
kubectl create rolebinding api-consumer-team \
  --role=api-consumer \
  --group=external-developers \
  -n consumer-team-x

kubectl create clusterrolebinding api-consumer-catalog-team \
  --clusterrole=api-consumer-catalog-reader \
  --group=external-developers
```

### 2. API Owner (`api-owner-role.yaml`)

**Use case**: Teams that publish and manage APIs

Grants permissions to:
- Create, update, and delete API products in assigned namespace(s)
- Approve/reject API key requests for their APIs
- Browse all API products cluster-wide (discovery)
- View HTTPRoutes and Gateways for API configuration

**How to deploy**:

```bash
# 1. Create a namespace for the API team
kubectl create namespace payment-services

# 2. Apply the owner role
kubectl apply -f api-owner-role.yaml -n payment-services

# 3. Bind to a team group
kubectl create rolebinding api-owner-payment-team \
  --role=api-owner \
  --group=team-payment-services \
  -n payment-services

# 4. Grant catalog browsing (cluster-wide read)
kubectl create clusterrolebinding api-owner-catalog-payment-team \
  --clusterrole=api-owner-catalog-reader \
  --group=team-payment-services
```

**For teams managing multiple namespaces**:

```bash
# Bind the same group to multiple namespaces
for namespace in payment-services payment-gateway billing-services; do
  kubectl create rolebinding api-owner-payment-team \
    --role=api-owner \
    --group=team-payment-services \
    -n $namespace
done
```

**Optional: Grant policy management permissions**:

If your API owners should also manage AuthPolicy and RateLimitPolicy resources, use the extended role:

```bash
# Apply the extended role instead
kubectl apply -f - <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: api-owner-with-policies
  namespace: payment-services
rules:
  - apiGroups: ["extensions.kuadrant.io"]
    resources: ["apiproducts", "apikeys"]
    verbs: ["get", "list", "create", "update", "patch", "delete"]
  - apiGroups: ["kuadrant.io"]
    resources: ["authpolicies", "ratelimitpolicies"]
    verbs: ["get", "list", "create", "update", "patch", "delete"]
  - apiGroups: ["gateway.networking.k8s.io"]
    resources: ["httproutes"]
    verbs: ["get", "list", "create", "update", "patch", "delete"]
  - apiGroups: ["gateway.networking.k8s.io"]
    resources: ["gateways"]
    verbs: ["get", "list"]
EOF
```

### 3. API Admin (`api-admin-clusterrole.yaml`)

**Use case**: Platform team managing the API catalog

Grants permissions to:
- Full access to all API products across all namespaces
- Approve/reject any API key request (troubleshooting)
- Manage rate limiting plans (PlanPolicy)
- View all Kuadrant policies and Gateway resources

**How to deploy**:

```bash
# 1. Apply the admin cluster role
kubectl apply -f api-admin-clusterrole.yaml

# 2. Bind to platform team members
kubectl create clusterrolebinding api-admin-alice \
  --clusterrole=api-admin \
  --user=alice

# Or bind to a platform team group
kubectl create clusterrolebinding api-admin-platform-team \
  --clusterrole=api-admin \
  --group=platform-team
```

## Deployment Patterns

### Pattern 1: Dedicated Consumer Namespaces

Each consumer team gets their own namespace for API key requests:

```bash
# Setup for consumer team
CONSUMER_NS="consumer-mobile-app"
CONSUMER_GROUP="mobile-app-developers"

kubectl create namespace $CONSUMER_NS
kubectl apply -f api-consumer-role.yaml -n $CONSUMER_NS
kubectl create rolebinding api-consumer \
  --role=api-consumer \
  --group=$CONSUMER_GROUP \
  -n $CONSUMER_NS
kubectl create clusterrolebinding api-consumer-catalog-$CONSUMER_NS \
  --clusterrole=api-consumer-catalog-reader \
  --group=$CONSUMER_GROUP
```

### Pattern 2: Team Namespaces with API Ownership

Each team manages their APIs in their own namespace:

```bash
# Setup for API owner team
TEAM_NS="team-inventory"
TEAM_GROUP="team-inventory"

kubectl create namespace $TEAM_NS
kubectl apply -f api-owner-role.yaml -n $TEAM_NS
kubectl create rolebinding api-owner \
  --role=api-owner \
  --group=$TEAM_GROUP \
  -n $TEAM_NS
kubectl create clusterrolebinding api-owner-catalog-$TEAM_NS \
  --clusterrole=api-owner-catalog-reader \
  --group=$TEAM_GROUP
```

### Pattern 3: Shared API Request Namespace

All API key requests go to a shared namespace, owners approve from there:

```bash
# Create shared requests namespace
kubectl create namespace api-requests

# Grant all owners access to approve requests
for team in team-payment team-shipping team-inventory; do
  kubectl apply -f api-owner-role.yaml -n api-requests
  kubectl create rolebinding api-owner-$team \
    --role=api-owner \
    --group=$team \
    -n api-requests
done

# Consumers create requests in this namespace
kubectl apply -f api-consumer-role.yaml -n api-requests
```

### Pattern 4: Multi-namespace Ownership

A team owns APIs across multiple namespaces:

```bash
TEAM_GROUP="team-platform"

# Grant ownership across multiple namespaces
for ns in api-v1 api-v2 api-beta; do
  kubectl create namespace $ns
  kubectl apply -f api-owner-role.yaml -n $ns
  kubectl create rolebinding api-owner-platform \
    --role=api-owner \
    --group=$TEAM_GROUP \
    -n $ns
done

# Single cluster-wide catalog reader binding
kubectl create clusterrolebinding api-owner-catalog-platform \
  --clusterrole=api-owner-catalog-reader \
  --group=$TEAM_GROUP
```

## Integration with OpenShift Groups

For OpenShift environments, bind roles to LDAP/AD groups:

```bash
# Example: LDAP group for API consumers
kubectl create clusterrolebinding api-consumer-external-devs \
  --clusterrole=api-consumer-catalog-reader \
  --group=cn=external-developers,ou=groups,dc=example,dc=com

# Example: LDAP group for API owners
kubectl create rolebinding api-owner-payment-team \
  --role=api-owner \
  --group=cn=payment-services,ou=teams,dc=example,dc=com \
  -n payment-services
```

## Verification

### Check user permissions

```bash
# Check what a user can do
kubectl auth can-i create apiproducts --as=alice -n payment-services
kubectl auth can-i list apiproducts --as=alice --all-namespaces

# Get all permissions for a user
kubectl auth can-i --list --as=alice -n payment-services
```

### Impersonate user for testing

```bash
# Test as a specific user
kubectl get apiproducts --all-namespaces --as=alice
kubectl create apiproduct my-api --as=alice -n payment-services --dry-run=client -o yaml
```

### Check effective permissions

```bash
# See all role bindings for a namespace
kubectl get rolebindings -n payment-services

# See all cluster role bindings
kubectl get clusterrolebindings | grep api-

# Describe a role to see permissions
kubectl describe role api-owner -n payment-services
kubectl describe clusterrole api-admin
```

## Security Considerations

### 1. Namespace Isolation

- API products are namespace-scoped for write operations
- Owners cannot modify products in namespaces they don't have access to
- Use separate namespaces per team for strong isolation

### 2. Least Privilege

- Consumers have read-only access to the catalog
- Owners can only manage resources in assigned namespaces
- Admins should be limited to platform team members

### 3. Audit Logging

Enable Kubernetes audit logging to track:
- Who created/modified API products
- Who approved/rejected API key requests
- Changes to rate limiting plans

```yaml
# Example audit policy snippet
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
  - level: RequestResponse
    resources:
      - group: "extensions.kuadrant.io"
        resources: ["apiproducts", "apikeys", "planpolicies"]
```

### 4. Resource Quotas

Prevent abuse by setting resource quotas per namespace:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: api-management-quota
  namespace: consumer-team-x
spec:
  hard:
    count/apikeys: "100"  # Max 100 API key requests per namespace
```

## Troubleshooting

### User can't see API products

**Check**:
1. User has `api-consumer-catalog-reader` ClusterRole bound
2. APIProducts have `publishStatus: Published`

```bash
kubectl get clusterrolebindings | grep api-consumer-catalog-reader
kubectl get apiproducts -n <namespace> -o jsonpath='{.items[*].spec.publishStatus}'
```

### User can't create API product

**Check**:
1. User has `api-owner` Role bound in the target namespace
2. Namespace exists
3. User is trying to create in the correct namespace

```bash
kubectl get rolebindings -n <namespace> | grep api-owner
kubectl auth can-i create apiproducts --as=<user> -n <namespace>
```

### Admin can't manage PlanPolicies

**Check**:
1. Admin has `api-admin` ClusterRole bound
2. Trying to create in the correct namespace (typically `kuadrant-system`)

```bash
kubectl get clusterrolebindings | grep api-admin
kubectl auth can-i create planpolicies --as=<admin> -n kuadrant-system
```

## See Also

- [API Management RBAC Design](../../docs/designs/2026-03-26-api-management-rbac-design.md) - Detailed design document
- [RBAC Validation Guide](../../docs/api-management-rbac-validation.md) - Manual testing procedures
- [Kuadrant RBAC Documentation](../../docs/rbac.md) - General RBAC for policies and gateways
