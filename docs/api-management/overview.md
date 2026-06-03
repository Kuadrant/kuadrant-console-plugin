# API Management Overview

The Kuadrant Console Plugin provides API management capabilities directly within the OpenShift web console. It brings self-service API access management to Kubernetes-native organizations by bridging the gap between API providers who want to share their services and developers who need to consume them.

## How It Works

The API management functionality introduces four Custom Resource Definitions (CRDs) that model API products, access requests, and approvals:

**APIProduct** (`devportal.kuadrant.io/v1alpha1`) represents an API offering. It wraps an existing HTTPRoute with the business context needed for consumption: a human-readable name, documentation links, contact information, and access policies. When an API owner creates an APIProduct and sets its `publishStatus` to `Published`, it becomes discoverable in the catalog.

**APIKeyRequest** (`devportal.kuadrant.io/v1alpha1`) represents a shadow resource in the API owner's namespace that enables request discovery without exposing API key values. This allows API owners to see and manage access requests for their APIs. These resources are fully managed by the Kuadrant controller and should not be created or modified manually.

**APIKey** (`devportal.kuadrant.io/v1alpha1`) represents an API access request created by the consumer in their namespace. It contains the secret reference with the actual API key value. The controller reconciles the APIKey resource and, upon approval, enables it for traffic authentication.

**APIKeyApproval** (`devportal.kuadrant.io/v1alpha1`) represents an approval or rejection action on an APIKeyRequest. API owners and admins create APIKeyApproval resources to approve or reject pending requests.

This model means that API access follows the same patterns as other Kubernetes resources: declarative, auditable, and managed through standard tooling.

## Authentication Methods

The API management system supports two authentication methods for protecting APIs. The method is configured at the platform level via AuthPolicy and automatically discovered by the controller.

### API Key Authentication

API key authentication uses Kubernetes Secrets to store credentials. This method involves a request and approval workflow.

Learn more: [API Key authentication](https://docs.kuadrant.io/latest/authorino/docs/features/#api-key-authenticationapikey)

**Workflow:**

1. API consumer creates an APIKey resource requesting access to an APIProduct
2. Depending on the APIProduct's `approvalMode`:
   - **Automatic**: The controller immediately approves the request
   - **Manual**: The request enters `Pending` state, awaiting API owner approval
3. For manual approval, the API owner or admin creates an APIKeyApproval resource to approve or reject the request
4. Upon approval, credentials become available to the consumer
5. Consumer retrieves the key from the console and uses it in API requests
6. AuthPolicy validates incoming requests against the credentials

This method is ideal for internal APIs, development environments, or scenarios where you want fine-grained control over who can access your API.

### OIDC/JWT Authentication

OIDC (OpenID Connect) authentication delegates credential management to an external identity provider. There is no request/approval workflow in the console.

Learn more: [JWT verification](https://docs.kuadrant.io/latest/authorino/docs/features/#jwt-verification-authenticationjwt)

**Workflow:**

1. Platform engineer configures AuthPolicy with JWT validation pointing to an OIDC issuer
2. The controller discovers the JWT authentication scheme and performs OIDC discovery to find the token endpoint
3. Discovered authentication details are surfaced in the APIProduct status
4. API consumer views the identity provider URL and token endpoint in the console
5. Consumer obtains a JWT token directly from the identity provider (e.g., using client credentials flow or any other available flow)
6. Consumer uses the JWT token in API requests
7. AuthPolicy validates the token's signature and claims against the OIDC issuer

This method is ideal for APIs that integrate with existing identity providers (Keycloak, Auth0, Azure AD, etc.), need stronger authentication, or require integration with enterprise SSO systems. No APIKey resources are created—access control happens at the identity provider level.

## Console UI Components

The OpenShift Console Plugin provides several views for managing API products and access:

### API Products Page

Located in the main **Kuadrant** section, this page lists all APIProduct resources in the cluster or current namespace. API owners can:

- Create new API products wrapping existing HTTPRoutes
- View and edit existing API products
- Configure approval modes (automatic vs. manual)
- Access detailed product information through tabs:
  - **Overview**: Display name, description, documentation links
  - **Target**: The referenced HTTPRoute
  - **Definition**: OpenAPI specification if available
  - **Policies**: Associated PlanPolicies and AuthPolicies
  - **API Keys**: All API key requests for this product

### API Key Approvals Page

Located in the **Kuadrant API Catalog** section, this page shows all pending and processed API key requests. API owners and admins can:

- Review pending access requests
- Approve or reject requests by creating APIKeyApproval resources
- Add optional comments when approving or rejecting
- View request details (requester, use case, tier selection)
- Filter by status (Pending, Approved, Denied) and API product
- Bulk approve multiple pending requests
- Bulk reject multiple pending requests

### My API Keys Page

Located in the **Kuadrant API Catalog** section, this page shows the current user's API key requests. API consumers can:

- Request access to API products by creating new APIKey resources
- View all their API key requests across different products
- See approval status (Pending, Approved, Denied)
- Access approved credentials
- View authentication examples for using their API keys

## API Management Personas

The API management features serve four distinct personas, each with different concerns and workflows within the OpenShift Console.

### 1. The API Consumer

API consumers are developers who need to integrate with services provided by other teams. They experience the portal through the **My API Keys** page, where they can:

- Browse available API products
- View authentication requirements and service tiers
- Request access to APIs by creating APIKey resources
- Retrieve approved credentials

The authentication experience depends on how the API is protected:

**For API Key Authentication:**

- Create an APIKey resource requesting access to an APIProduct
- Wait for approval (automatic or manual depending on the product)
- Receive an API key once approved (credentials are shown once and must be saved immediately)
- Use the API key in the `Authorization` header when making requests

**For OIDC/JWT Authentication:**

- View the OIDC provider details and token endpoint
- Obtain an access token from the identity provider using their credentials
- Use the JWT token in the `Authorization` header when making requests
- No APIKey resource is needed

### 2. The API Owner

API owners are the teams responsible for specific services. They control how their APIs are presented and accessed through the **API Products** and **API Key Approvals** pages:

- Define how the API appears in the catalog through APIProduct metadata
- For API key authentication:
  - Choose between automatic and manual approval for access requests
  - Review pending APIKey requests
  - Approve or reject requests by creating APIKeyApproval resources
- Set documentation links so consumers can self-serve

### 3. The API Admin

API Admins provide cross-team oversight and governance. They have access to the **API Key Approvals** page with elevated permissions:

- View and manage all API Products across the organization
- Approve or reject any API key request, enabling centralized governance
- Troubleshoot issues on behalf of API Owners
- Ensure consistency across API Products

This role is particularly valuable in larger organizations where individual API owners may be unavailable, or where a central team needs visibility into all API access for compliance or security reasons.

### 4. The Platform Engineer

Platform engineers install and configure the API management infrastructure. Their responsibilities include:

- Deploying the Developer Portal Controller
- Creating HTTPRoutes and making them available to API owners
- Configuring AuthPolicy resources for authentication:
  - API key validation using Kubernetes Secrets
  - OIDC/JWT validation with external identity providers
- Defining PlanPolicy resources that specify rate limit tiers
- Setting up RBAC so appropriate users can create, approve, and manage resources

The platform team doesn't need to be involved in individual API publications or access requests—those are handled through the console by API owners and consumers.

## RBAC Requirements

All console pages respect Kubernetes RBAC. See the [RBAC guide](rbac.md) for detailed permission requirements for each persona.

Key resource access patterns:

- **API Consumers** need read access to APIProduct and create/read access to APIKey in their namespaces
- **API Owners** need full access to APIProduct in their namespaces, plus full access to APIKeyApproval for approvals
- **API Admins** need full access to APIProduct, APIKey, and APIKeyApproval across all namespaces
- **Platform Engineers** need full access to all resources including AuthPolicy, PlanPolicy, and HTTPRoute

## Integration with Kuadrant

The API management features are designed as part of the Kuadrant ecosystem. They build on:

- **Gateway API**: The standard Kubernetes API for traffic routing. APIProduct references HTTPRoute.
- **Kuadrant AuthPolicy**: Enforces authentication at the gateway level. The controller discovers AuthPolicy configurations and surfaces authentication details to consumers:
  - **For API key authentication**: AuthPolicy (via Authorino) validates requests using Kubernetes Secrets
  - **For OIDC/JWT authentication**: The controller discovers the JWT issuer URL from the AuthPolicy, performs OIDC discovery to find the token endpoint, and surfaces both to consumers in the console
- **PlanPolicy**: A Kuadrant extension for tiered rate limiting. The controller discovers plan definitions and surfaces them to consumers.

This integration means the API management features don't duplicate functionality—they add the product catalog and credential discovery workflow on top of existing traffic management and policy enforcement. Whether using API keys or OIDC, authentication is always enforced by Kuadrant's AuthPolicy—the console simply makes the authentication requirements discoverable and, for API keys, manages the credential lifecycle.

## Next Steps

To get started with the Kuadrant API management features:

1. **Get Access to OpenShift**: Ensure you have access to an OpenShift cluster
2. **Install Kuadrant**: Follow the [Kuadrant installation guide](https://docs.kuadrant.io/dev/install-helm/)
3. **Enable the Console Plugin**: Enable the `kuadrant-console-plugin` entry in the **Dynamic Plugins** section
4. **Configure RBAC**: Set up [permissions](rbac.md) for different API management personas

Additional resources:

- [Kuadrant Documentation](https://docs.kuadrant.io/): Learn about the broader Kuadrant ecosystem
