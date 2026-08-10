import * as React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useActiveNamespace } from '@openshift-console/dynamic-plugin-sdk';

/**
 * Custom hook for handling namespace-aware routing in Kuadrant pages
 *
 * Provides a consistent pattern for:
 * - Syncing URL namespace parameter with console's active namespace
 * - Handling namespace changes from the NamespaceBar
 * - Navigating between base and namespace-scoped routes
 * - Automatically preserving sub-paths (like tabs) when changing namespaces
 *
 * @param basePath - The base path for the page (e.g., '/apiproducts', '/policies')
 * @returns An object with handleNamespaceChange function and activeNamespace
 *
 * @example
 * ```tsx
 * // All pages use the same simple pattern
 * const { handleNamespaceChange, activeNamespace } = useKuadrantNamespaceChange('/policies');
 * ```
 *
 * URL patterns supported:
 * - /kuadrant/policies/all-namespaces (all namespaces, no subpath)
 * - /kuadrant/policies/all-namespaces/auth (all namespaces, auth tab)
 * - /kuadrant/policies/ns/test-1 (specific namespace, no subpath)
 * - /kuadrant/policies/ns/test-1/auth (specific namespace, auth tab)
 */
export const useKuadrantNamespaceChange = (basePath: string) => {
  const { ns } = useParams<{ ns: string }>();
  const [activeNamespace, setActiveNamespace] = useActiveNamespace();
  const navigate = useNavigate();
  const location = useLocation();
  const allNamespacesSubPath = '#ALL_NS#';

  // Sync URL namespace parameter with SDK active namespace
  // The 'ns' param can be either a namespace name or 'all-namespaces'
  React.useEffect(() => {
    if (ns && ns !== activeNamespace) {
      setActiveNamespace(ns);
    } else if (!ns && activeNamespace !== allNamespacesSubPath) {
      setActiveNamespace(allNamespacesSubPath);
    }
  }, [ns, activeNamespace, setActiveNamespace, allNamespacesSubPath]);

  /**
   * Extract current subpath from URL (e.g., active tab)
   * Handles three patterns:
   * - /kuadrant/policies/all-namespaces/auth -> /auth
   * - /kuadrant/policies/ns/test-1/auth -> /auth
   * - /kuadrant/policies/auth -> /auth (legacy, shouldn't occur with namespaced navigation)
   */
  const getCurrentSubPath = React.useCallback(() => {
    const pathParts = location.pathname.split('/').filter(Boolean);
    const basePathSegment = basePath.substring(1); // Remove leading slash
    const baseIndex = pathParts.indexOf(basePathSegment);

    if (baseIndex === -1) return '';

    const nextSegment = pathParts[baseIndex + 1];

    if (nextSegment === 'ns') {
      // Pattern: /kuadrant/policies/ns/namespace/[tab]
      const tabSegment = pathParts[baseIndex + 3];
      return tabSegment ? `/${tabSegment}` : '';
    } else if (nextSegment === 'all-namespaces') {
      // Pattern: /kuadrant/policies/all-namespaces/[tab]
      const tabSegment = pathParts[baseIndex + 2];
      return tabSegment ? `/${tabSegment}` : '';
    } else {
      // Legacy pattern: /kuadrant/policies/[tab] (for backwards compatibility)
      const tabSegment = nextSegment;
      return tabSegment ? `/${tabSegment}` : '';
    }
  }, [location.pathname, basePath]);

  /**
   * Handle namespace changes from the NamespaceBar
   * Navigates to the appropriate route based on selected namespace
   * Automatically preserves any subpath (e.g., active tab)
   * Patterns:
   * - All namespaces: /kuadrant{basePath}/all-namespaces[/subPath]
   * - Specific namespace: /kuadrant{basePath}/ns/:ns[/subPath]
   * Example: /kuadrant/policies/ns/test-1/auth
   */
  const handleNamespaceChange = React.useCallback(
    (newNamespace: string) => {
      const subPath = getCurrentSubPath();

      if (newNamespace !== allNamespacesSubPath) {
        navigate(`/kuadrant${basePath}/ns/${newNamespace}${subPath}`, { replace: true });
      } else {
        navigate(`/kuadrant${basePath}/all-namespaces${subPath}`, { replace: true });
      }
    },
    [navigate, basePath, allNamespacesSubPath, getCurrentSubPath],
  );

  return {
    handleNamespaceChange,
    activeNamespace,
  };
};
