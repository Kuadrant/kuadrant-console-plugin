# kuadrant development setup

Development environment for kuadrant console plugin. 

# Requirements
* [oc](https://console.redhat.com/openshift/downloads) are required.
* `oc login` (requires [oc](https://console.redhat.com/openshift/downloads) and an [OpenShift cluster 4.19+](https://console.redhat.com/openshift/create))

## quick start

```bash
make local-setup
```

## what gets installed

### Core Components

1. **cert-manager Operator**
   - Certificate management for Kubernetes
   - Required for TLS certificate automation

2. **GatewayClass**
   - Default OpenShift Gateway controller (`openshift-default`)
   - Enables Kubernetes Gateway API resources

3. **Kuadrant Operator**
   - Installed via OLM (Operator Lifecycle Manager)
   - Namespace: `kuadrant-system`
   - Includes all Kuadrant CRDs (AuthPolicy, RateLimitPolicy, DNSPolicy, TLSPolicy)

4. **Kuadrant Instance**
   - Developer Portal enabled
   - Manages API Products and API Key Requests

### Demo Resources

**Toystore Demo** (`toystore` namespace):
- Gateway: `external` (in `api-gateway` namespace)
- HTTPRoute: `toystore` (hostname: `api.toystore.com`)
- Deployment: toystore application
- AuthPolicy: API key authentication
- PlanPolicy: Gold (100/day), Silver (50/day), Bronze (10/day) tiers
- APIProduct: `toystore-api`
- Secrets: `alice-key` (gold tier), `bob-key` (silver tier)

**Gamestore Demo** (`gamestore` namespace):
- Gateway: `external` (in `gamestore` namespace)
- HTTPRoute: `gamestore` (hostname: `api.gamestore.example.com`)
- HTTPRoute: `gamestore-admin` (hostname: `admin.gamestore.example.com`)
- HTTPRoute: `policy-free` (no policies attached)
- Deployment: gamestore application
- AuthPolicy: JWT authentication on `gamestore`, JWT + API key on `gamestore-admin`
- RateLimitPolicy: Basic rate limiting (100 req/60s)
- PlanPolicy: Admin tier (1M/day) on `gamestore-admin`
- APIProduct: `gamestore-api`, `gamestore-admin`

**Additional API Products** (`toystore` namespace):
- 6 additional APIProducts demonstrating different owners (owner1, owner2, admin)
- Mix of manual and automatic approval modes
- Includes one Draft (unpublished) API product

### verify installation

#### 1. Verify Toystore Demo Resources
```bash
# check toystore namespace
oc get pods -n toystore
# Expected: 1 pod (toystore deployment)

# check api-gateway namespace
oc get gateway -n api-gateway
# Expected: 1 gateway (external)

# check toystore routes and policies
oc get httproute -n toystore
# Expected: 1 HTTPRoute (toystore)

oc get authpolicy -n toystore
# Expected: 1 AuthPolicy (toystore)

oc get planpolicy -n toystore
# Expected: 1 PlanPolicy (toystore-plans)

# check api products
oc get apiproduct -n toystore
# Expected: 7 APIProducts (toystore-api + 6 additional)

# check api key secrets
oc get secrets -n toystore -l app=toystore
# Expected: 2 secrets (alice-key, bob-key)
```

#### 2. Verify Gamestore Demo Resources
```bash
# check gamestore namespace
oc get pods -n gamestore
# Expected: 1 pod (gamestore deployment)

oc get gateway -n gamestore
# Expected: 1 gateway (external)

# check gamestore routes and policies
oc get httproute -n gamestore
# Expected: 3 HTTPRoutes (gamestore, gamestore-admin, policy-free)

oc get authpolicy -n gamestore
# Expected: 2 AuthPolicies (gamestore, gamestore-admin)

oc get ratelimitpolicy -n gamestore
# Expected: 1 RateLimitPolicy (gamestore)

oc get planpolicy -n gamestore
# Expected: 1 PlanPolicy (gamestore-admin-tiers)

oc get apiproduct -n gamestore
# Expected: 2 APIProducts (gamestore-api, gamestore-admin)
```

#### 3. Quick Health Check
```bash
# all-in-one verification
oc get kuadrant,gateway,httproute,authpolicy,ratelimitpolicy,planpolicy,apiproduct --all-namespaces
```
