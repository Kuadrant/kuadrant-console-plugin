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

  // Track previous values to prevent infinite loops
  const prevNsRef = React.useRef(ns);
  const prevActiveNamespaceRef = React.useRef(activeNamespace);

  // Bidirectional sync 1: URL → activeNamespace
  // When URL changes (e.g., deep links, in-app navigation), update activeNamespace
  React.useEffect(() => {
    // Only react if ns changed (not if activeNamespace changed)
    if (ns === prevNsRef.current) return;
    prevNsRef.current = ns;

    if (ns && ns !== 'all-namespaces' && ns !== activeNamespace) {
      setActiveNamespace(ns);
    } else if (ns === 'all-namespaces' && activeNamespace !== allNamespacesSubPath) {
      setActiveNamespace(allNamespacesSubPath);
    } else if (!ns && activeNamespace !== allNamespacesSubPath) {
      setActiveNamespace(allNamespacesSubPath);
    }
  }, [ns, activeNamespace, setActiveNamespace, allNamespacesSubPath]);

  // Bidirectional sync 2: activeNamespace → URL
  // When activeNamespace changes (e.g., NamespaceBar creates namespace), navigate to match
  React.useEffect(() => {
    // Only react if activeNamespace changed (not if ns changed)
    if (activeNamespace === prevActiveNamespaceRef.current) return;
    prevActiveNamespaceRef.current = activeNamespace;

    const getCurrentSubPath = () => {
      const pathParts = location.pathname.split('/').filter(Boolean);
      const basePathSegment = basePath.substring(1);
      const baseIndex = pathParts.indexOf(basePathSegment);
      if (baseIndex === -1) return '';
      const nextSegment = pathParts[baseIndex + 1];
      if (nextSegment === 'ns') {
        const tabSegment = pathParts[baseIndex + 3];
        return tabSegment ? `/${tabSegment}` : '';
      } else if (nextSegment === 'all-namespaces') {
        const tabSegment = pathParts[baseIndex + 2];
        return tabSegment ? `/${tabSegment}` : '';
      }
      return '';
    };

    const subPath = getCurrentSubPath();

    // Build expected URL for current activeNamespace
    let expectedUrl: string;
    if (activeNamespace && activeNamespace !== allNamespacesSubPath) {
      expectedUrl = `/kuadrant${basePath}/ns/${activeNamespace}${subPath}`;
    } else {
      expectedUrl = `/kuadrant${basePath}/all-namespaces${subPath}`;
    }

    // Only navigate if current pathname doesn't match expected URL
    // Special case: if activeNamespace is #ALL_NS# but we're on a namespace path (e.g., /ns/default),
    // don't navigate back to /all-namespaces - let the URL→state effect sync activeNamespace instead
    // This prevents redirect loops when RBAC redirects user to a namespace
    const isOnNamespacePath = location.pathname.includes(`${basePath}/ns/`);
    if (activeNamespace === allNamespacesSubPath && isOnNamespacePath) {
      // Don't navigate - URL→state effect will sync activeNamespace to match the URL
      return;
    }

    if (location.pathname !== expectedUrl) {
      navigate(expectedUrl, { replace: true });
    }
  }, [activeNamespace, navigate, basePath, allNamespacesSubPath, location.pathname]);

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
