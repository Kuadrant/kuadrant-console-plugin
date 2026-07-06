# API Management RBAC

This directory contains the ClusterRole manifests for API Management personas in the Kuadrant Console Plugin.

**For complete documentation on personas, permissions, binding requirements, and security model, see:**

📖 **[docs/api-management/rbac.md](../../../docs/api-management/rbac.md)**

## ClusterRoles in this directory

- `api-catalog-browser-clusterrole.yaml` - Cluster-wide catalog discovery (required for all personas)
- `api-consumer-clusterrole.yaml` - Namespace-scoped APIKey/Secret management for consumers
- `api-owner-clusterrole.yaml` - Namespace-scoped API publishing + cluster-wide catalog read for owners
- `api-admin-clusterrole.yaml` - Cluster-wide management + troubleshooting for platform operators

## Quick Installation

```bash
kubectl apply -f api-catalog-browser-clusterrole.yaml
kubectl apply -f api-consumer-clusterrole.yaml
kubectl apply -f api-owner-clusterrole.yaml
kubectl apply -f api-admin-clusterrole.yaml
```

Bindings are not included - see [docs/api-management/rbac.md](../../../docs/api-management/rbac.md) for binding examples.
