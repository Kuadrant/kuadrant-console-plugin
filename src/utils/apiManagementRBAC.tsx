import { checkAccess, useActiveNamespace } from '@openshift-console/dynamic-plugin-sdk';
import { useEffect, useState } from 'react';

export type Persona = 'consumer' | 'owner' | 'admin' | null;

export interface ResourcePermissions {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canList: boolean;
}

export interface APIManagementPermissions {
  apikeys: ResourcePermissions;
  apiproducts: ResourcePermissions;
  apikeyapprovals: ResourcePermissions;
  apikeyrequests: ResourcePermissions;
}

export interface APIManagementRBAC {
  persona: Persona;
  permissions: APIManagementPermissions;
  loading: boolean;
}

interface UseAPIManagementRBACOptions {
  resources?: ('apikeys' | 'apiproducts' | 'apikeyapprovals' | 'apikeyrequests')[];
}

/**
 * Main RBAC hook for API Management features.
 *
 * Checks permissions for API Management resources and determines user persona
 * based on the permission matrix from the RBAC design doc.
 *
 * @param namespace - Target namespace for permission checks (undefined = active namespace)
 * @param options - Optional configuration to check specific resources only
 * @returns Persona, permissions object, and loading state
 *
 * @example
 * // Check all permissions
 * const { persona, permissions, loading } = useAPIManagementRBAC(namespace);
 *
 * @example
 * // Check only apikeys permissions (performance optimization)
 * const { permissions, loading } = useAPIManagementRBAC(namespace, {
 *   resources: ['apikeys']
 * });
 */
export function useAPIManagementRBAC(
  namespace?: string,
  options?: UseAPIManagementRBACOptions,
): APIManagementRBAC {
  const [activeNamespace] = useActiveNamespace();
  const targetNamespace = namespace || activeNamespace;

  const [permissions, setPermissions] = useState<APIManagementPermissions>({
    apikeys: { canCreate: false, canUpdate: false, canDelete: false, canList: false },
    apiproducts: { canCreate: false, canUpdate: false, canDelete: false, canList: false },
    apikeyapprovals: { canCreate: false, canUpdate: false, canDelete: false, canList: false },
    apikeyrequests: { canCreate: false, canUpdate: false, canDelete: false, canList: false },
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const resourcesToCheck = options?.resources || [
      'apikeys',
      'apiproducts',
      'apikeyapprovals',
      'apikeyrequests',
    ];

    const checkPermissions = async () => {
      try {
        const checks = resourcesToCheck.flatMap((resource) => {
          const verbs = ['create', 'update', 'delete', 'list'] as const;
          return verbs.map(async (verb) => {
            const result = await checkAccess({
              group: 'devportal.kuadrant.io',
              resource: resource,
              verb,
              namespace: targetNamespace,
            });
            return {
              resource,
              verb,
              allowed: result.status?.allowed || false,
            };
          });
        });

        const results = await Promise.all(checks);

        if (!isMounted) return;

        setPermissions((prevPermissions) => {
          const newPermissions = { ...prevPermissions };
          results.forEach(({ resource, verb, allowed }) => {
            if (verb === 'create') newPermissions[resource].canCreate = allowed;
            if (verb === 'update') newPermissions[resource].canUpdate = allowed;
            if (verb === 'delete') newPermissions[resource].canDelete = allowed;
            if (verb === 'list') newPermissions[resource].canList = allowed;
          });
          return newPermissions;
        });
      } catch (error) {
        console.error('Failed to check API Management permissions:', error);
        // Permissions remain in initial denied state (safe default)
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    checkPermissions();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetNamespace, options?.resources?.join(',')]);

  const persona = derivePersona(permissions);

  return { persona, permissions, loading };
}

/**
 * Derives user persona from permission set.
 *
 * Based on permission matrix from RBAC design doc:
 * - Admin: cluster-wide APIKey write access
 * - Owner: can create APIProducts and APIKeyApprovals in namespace
 * - Consumer: can create APIKeys in namespace
 */
function derivePersona(permissions: APIManagementPermissions): Persona {
  // Admin: can manage APIKeys (troubleshooting capability)
  if (permissions.apikeys.canCreate && permissions.apikeys.canUpdate) {
    return 'admin';
  }

  // Owner: can create APIProducts and APIKeyApprovals
  if (permissions.apiproducts.canCreate && permissions.apikeyapprovals.canCreate) {
    return 'owner';
  }

  // Consumer: can create APIKeys but not APIProducts
  if (permissions.apikeys.canCreate && !permissions.apiproducts.canCreate) {
    return 'consumer';
  }

  return null;
}

/**
 * Helper to check if user has specific permission.
 * Useful for inline permission checks in JSX.
 */
export function hasPermission(
  permissions: APIManagementPermissions,
  resource: keyof APIManagementPermissions,
  action: keyof ResourcePermissions,
): boolean {
  return permissions[resource][action];
}
