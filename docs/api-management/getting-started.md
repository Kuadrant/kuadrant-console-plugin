# Getting Started with API Management

This guide walks you through the core workflows for managing APIs in the Kuadrant openshift console plugin.
All tasks are performed through the OpenShift web console interface.

## Prerequisites

- Access to an OpenShift cluster with [Kuadrant installed](https://docs.kuadrant.io/dev/install-helm/)
- The [Kuadrant Console Plugin](/kuadrant-console-plugin/docs/overview/#installation) enabled
- Appropriate RBAC permissions (see [RBAC guide](rbac.md))

## Browsing Available APIs

The API Catalog allows you to discover APIs published within your organization.

### Viewing the API Product Catalog

1. In the OpenShift Console, navigate to **Kuadrant** → **API Products**
2. The catalog displays all published API products you have access to
3. Use the namespace selector to filter between:
   - **All Namespaces**: View all published APIs across the cluster (requires cluster-wide read permissions)
   - **Specific Namespace**: View APIs published in a particular namespace

### Understanding an API Product

Click on any API Product to view detailed information across multiple tabs:

**Overview Tab**: Core product information

- Display name and description
- Documentation links
- Support contact information
- Publish status (Published or Draft)
- Approval mode (Automatic or Manual)

**Target Tab**: Backend routing details

- Referenced HTTPRoute resource

**Definition Tab**: API specification

- OpenAPI specification (if provided)
- Interactive API documentation viewer

**Policies Tab**: Discovered access controls

- **RateLimitPolicy**: Rate limiting rules for this API
  - Global rate limits applied to all endpoints
  - Per-endpoint rate limits
  - Rate limit window configurations
- **PlanPolicy**: Tiered rate limiting plans for this API
  - Plan names (e.g., Basic, Premium, Enterprise)
  - Rate limit definitions per tier
  - Quota configurations
- **AuthPolicy**: Authentication requirements
  - Authentication method (API Key or OIDC/JWT)
  - For API Key: expected header name
  - For OIDC: identity provider URL and token endpoint

**API Keys Tab**: Access requests (API owners only)

- All API key requests for this product
- Request status and approval history
- Link to approval or denial workflow

## Managing APIs

API management tasks are available to users with appropriate permissions on APIProduct resources.

### Registering a New API

To publish an existing HTTPRoute as an API Product:

1. Navigate to **Kuadrant** → **API Products**
2. Click **Create APIProduct**
3. Fill in the product details:
   - **Name**: Kubernetes resource name (lowercase, hyphens allowed)
   - **Display Name**: Human-readable name shown in the catalog
   - **Description**: What the API does and who should use it
   - **Version**: API version (e.g., v1, 1.0.0)
   - **Documentation URL**: Link to API documentation
   - **Support Contact**: Email or support channel
4. Select the **Target HTTPRoute**:
   - Choose the namespace where your HTTPRoute exists
   - Select the HTTPRoute from the dropdown
   - The console validates that the HTTPRoute exists and is accessible
5. Configure **Access Settings**:
   - **Publish Status**: Choose `Published` to make the API discoverable (or `Draft` to save without publishing)
   - **Approval Mode**:
     - `Automatic`: API key requests are approved immediately
     - `Manual`: Requests require explicit approval by API owners
6. (Optional) Link an **OpenAPI Specification**:
   - Provide a URL to the spec file
   - This enables the interactive API documentation viewer
7. Click **Create**

The API Product appears in the catalog immediately. Consumers can now discover and request access.

### Publishing and Unpublishing APIs

Control API status in the catalog:

1. Navigate to **Kuadrant** → **API Products**
2. Click on the API Product you want to modify
3. In the **Overview** tab, use the **Actions** dropdown to:
   - `Published`: API is published in the catalog
   - `Draft`: API is in draft mode in the catalog

Alternatively, edit the API Product directly:

1. Select **Actions** → **Edit APIProduct**
2. Update the **Publish Status**:
3. Click **Save**

### Editing an API

Update API Product metadata and configuration:

1. Navigate to **Kuadrant** → **API Products**
2. Click on the API Product
3. Select **Actions** → **Edit APIProduct**
4. Modify any fields:
   - Display name, description, version
   - Documentation and support links
   - Publish status and approval mode
   - OpenAPI specification
5. Click **Save**

Changes to metadata are visible immediately. Changes to approval mode only affect new requests—existing approved API keys remain valid.

### Removing an API

Delete an API Product from the catalog:

1. Navigate to **Kuadrant** → **API Products**
2. Click on the API Product
3. Select **Actions** → **Delete APIProduct**
4. Confirm the deletion

**Important**: Deleting an APIProduct removes it from the catalog but does not:

- Delete the underlying HTTPRoute
- Remove associated PlanPolicy or AuthPolicy resources

To fully decommission an API, you must also remove the HTTPRoute and associated policies.

## Managing My API Keys

Consumers request and manage their API access through the My API Keys page.

### Requesting Access to an API

1. Navigate to **Kuadrant API Catalog** → **My API Keys**
2. Click **Request API Access**
3. Select the **Namespace** where the API key will be created
   - The Request API Access button is disabled until a namespace is selected
4. Select the **API Product** you want to access
5. Fill in request details:
   - **Use Case**: Describe how you'll use the API (helps with manual approvals)
   - **Service Tier**: Select from available plans (Basic, Premium, etc.)
     - Each tier displays its rate limits
     - The Policies tab of the API Product shows full plan details
6. Review the authentication method:
   - **API Key**: You'll receive credentials after approval
   - **OIDC/JWT**: Instructions show the identity provider and token endpoint
7. Click **Request Access**

**For API Key Authentication:**

- If approval mode is `Automatic`: Credentials appear immediately
- If approval mode is `Manual`: Request enters `Pending` status

**For OIDC/JWT Authentication:**

- No approval workflow
- Instructions show how to obtain a token from the identity provider
- Use your existing identity provider credentials

### Viewing My API Key Requests

The **My API Keys** page shows all your access requests:

- **Status**: Pending, Approved, or Denied
- **API Product**: Which API the request is for
- **Service Tier**: The selected plan
- **Requested Date**: When the request was submitted
- **Approval Date**: When it was approved or denied (if processed)

### Retrieving Approved Credentials (API Key Authentication)

When a request is approved:

1. Navigate to **Kuadrant API Catalog** → **My API Keys**
2. Find the approved request
3. Click **View Credentials**
4. Test the API key using the provided authentication example:

   ```bash
   curl -H "Authorization: APIKEY <your-key>" https://api.example.com/endpoint
   ```

### Understanding Request Status

- **Pending**: Waiting for API owner approval (manual approval mode only)
- **Approved**: Access granted, credentials available
- **Denied**: Request rejected by API owner (check denial reason for details)

## Managing API Key Requests for Your APIs

API owners and admins review and process access requests through the API Key Approvals page.

### Viewing Pending Requests

1. Navigate to **Kuadrant API Catalog** → **API Key Approvals**
2. The page shows all API key requests you can manage:
   - **API Owners**: Requests for your API Products
   - **API Admins**: All requests across the cluster
3. Use filters to narrow the list:
   - **API Product**: Filter by specific API
   - **Namespace**: Filter by namespace

### Reviewing a Request

Click on any request to view details:

- **Requester**: Username of the API consumer
- **API Product**: Which API they want to access
- **Service Tier**: Selected plan and associated rate limits
- **Use Case**: Consumer's description of intended use

### Approving a Request

1. Select one or more pending requests
2. Click **Approve**
3. (Optional) Add an approval comment
4. Click **Confirm**

Approval creates an APIKeyApproval resource with `approved: true`. The system:

- Generates credentials automatically
- Makes them available to the consumer

**Bulk Approval**: Select multiple pending requests and approve them all at once.

### Rejecting a Request

1. Select the pending request
2. Click **Reject**
3. **Provide a reason** for rejection:
   - This helps the consumer understand why and how to reapply
   - Example: "Please provide more details about your use case"
   - Example: "Contact support to verify your organization"
4. Click **Confirm**

Rejection creates an APIKeyApproval resource with `approved: false` and includes your reason. The consumer sees the denial reason in their My API Keys page.

### Revoking Active API Keys

To revoke access for an approved/active API key:

1. Navigate to **Kuadrant API Catalog** → **API Key Approvals**
2. Find the approved API key request
3. Click the **Actions** menu (⋮) for that request
4. Select **Deny**
5. Provide a reason for revocation
6. Click **Confirm**

This invalidates the credentials and prevents the consumer from using the API key to access the API.

## Understanding OpenAPI Specifications

OpenAPI specs make APIs self-documenting and easier to consume.

### Viewing an API Definition

If an API Product includes an OpenAPI specification:

1. Navigate to the API Product
2. Click the **Definition** tab
3. The console renders an interactive API documentation viewer showing:
   - Available endpoints
   - Request/response schemas
   - Authentication requirements
   - Example requests

### Providing an OpenAPI Spec (API Owners)

You can add or update the OpenAPI specification URL in two ways:

**From the Overview Tab (Quick Edit):**

1. Navigate to the API Product and click the **Overview** tab
2. Find the **API Specification** field
3. Click the pencil icon (✏️) next to it
4. Enter the URL to your OpenAPI spec file
5. Click **Save**

**When Creating or Editing an API Product:**

1. When creating a new API Product or editing via **Actions** → **Edit APIProduct**
2. In the form, locate the **OpenAPI Spec URL** field
3. Enter the full URL to your API spec file (must be publicly accessible or accessible from the cluster)
4. Fill in the **Documentation URL** field if you have separate documentation
5. Click **Create** or **Save**

The spec appears immediately in the Definition tab for all consumers.

### Best Practices for API Specs

- Keep specs up-to-date with your HTTPRoute configuration
- Include detailed descriptions for all endpoints
- Provide example requests and responses
- Document authentication requirements
- Version your spec alongside your API version

## Common Workflows

### Publishing Your First API

1. Ensure you have an HTTPRoute deployed and accessible
2. Create a new API Product referencing that HTTPRoute
3. Set publish status to `Published`
4. Add an OpenAPI spec for documentation
5. Share the API Product link with your team

### Requesting Access to a New API

1. Browse the API Catalog to find the API you need
2. Review the Policies tab to understand rate limits and authentication
3. Request access, selecting the appropriate service tier
4. Wait for approval (if manual) or receive credentials immediately (if automatic)
5. Integrate the credentials into your application

### Approving Access Requests

1. Navigate to API Key Approvals
2. Review pending requests for your APIs
3. Check the use case description
4. Approve requests that meet your criteria
5. Reject requests that need more information, providing clear feedback

## Next Steps

- **[Kuadrant Documentation](https://docs.kuadrant.io/)**: Learn about the broader Kuadrant ecosystem
