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

  // namespace the url expresses: /ns/:ns, otherwise all namespaces
  const urlNamespace = ns || allNamespacesSubPath;

  // last namespace url and console state agreed on
  const syncedRef = React.useRef<string | undefined>(undefined);
  // url namespace already re-asserted once against a console reset
  const reassertedRef = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    if (urlNamespace !== syncedRef.current) {
      // url changed: deep link, tab, rbac redirect, NamespaceBar select. url wins
      syncedRef.current = urlNamespace;
      reassertedRef.current = undefined;
      if (activeNamespace !== urlNamespace) {
        setActiveNamespace(urlNamespace);
      }
      return;
    }

    if (activeNamespace === urlNamespace) return;

    if (activeNamespace === allNamespacesSubPath) {
      // console fell back to all namespaces (namespace get failed). re-assert url once,
      // then accept the console's decision rather than loop against it
      if (reassertedRef.current !== urlNamespace) {
        reassertedRef.current = urlNamespace;
        setActiveNamespace(urlNamespace);
      }
      return;
    }

    // namespace created or selected outside handleNamespaceChange: follow it
    syncedRef.current = activeNamespace;
    navigate(`/kuadrant${basePath}/ns/${activeNamespace}${getCurrentSubPath()}`, {
      replace: true,
    });
  }, [
    urlNamespace,
    activeNamespace,
    setActiveNamespace,
    navigate,
    basePath,
    allNamespacesSubPath,
    getCurrentSubPath,
  ]);

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
