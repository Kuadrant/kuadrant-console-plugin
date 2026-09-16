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
  const [activeNamespace] = useActiveNamespace();
  const navigate = useNavigate();
  const location = useLocation();
  const allNamespacesSubPath = '#ALL_NS#';

  // Sync URL namespace parameter with SDK active namespace
  // Priority: activeNamespace changes should trigger URL navigation
  // This handles the case where NamespaceBar creates a new namespace
  // and sets activeNamespace directly without calling handleNamespaceChange
  React.useEffect(() => {
    // If activeNamespace changed but URL doesn't match, navigate to match activeNamespace
    if (activeNamespace && activeNamespace !== allNamespacesSubPath && activeNamespace !== ns) {
      const targetUrl = `/kuadrant${basePath}/ns/${activeNamespace}`;
      navigate(targetUrl, { replace: true });
    } else if (activeNamespace === allNamespacesSubPath && ns !== 'all-namespaces') {
      const targetUrl = `/kuadrant${basePath}/all-namespaces`;
      navigate(targetUrl, { replace: true });
    }
  }, [activeNamespace, ns, navigate, basePath, allNamespacesSubPath]);

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
        const targetUrl = `/kuadrant${basePath}/ns/${newNamespace}${subPath}`;
        navigate(targetUrl, { replace: true });
      } else {
        const targetUrl = `/kuadrant${basePath}/all-namespaces${subPath}`;
        navigate(targetUrl, { replace: true });
      }
    },
    [navigate, basePath, allNamespacesSubPath, getCurrentSubPath],
  );

  return {
    handleNamespaceChange,
    activeNamespace,
  };
};
