// Internal Links
export const INTERNAL_LINKS = {
  createPolicies: '/kuadrant/all-namespaces/policies',
  addNewGateway: (namespace: string) =>
    `/k8s/ns/${
      namespace === '#ALL_NS#' ? 'default' : namespace
    }/gateway.networking.k8s.io~v1~Gateway/~new`,
  observabilitySetup:
    'https://docs.kuadrant.io/latest/kuadrant-operator/doc/observability/examples/',
  certManagerOperator: (namespace: string, clusterVersion: string) => {
    // Parse version to compare (e.g., "4.20.1" -> 4.20)
    const versionMatch = clusterVersion?.match(/^(\d+)\.(\d+)/);
    const major = versionMatch ? parseInt(versionMatch[1], 10) : 4;
    const minor = versionMatch ? parseInt(versionMatch[2], 10) : 21;
    const link419 = `/operatorhub/ns/${
      namespace === '#ALL_NS#' ? 'default' : namespace
    }?keyword=cert-manager&details-item=openshift-cert-manager-operator-redhat-operators-openshift-marketplace`;
    const linkLatest = `/catalog/ns/${
      namespace === '#ALL_NS#' ? 'default' : namespace
    }?selectedId=openshift-cert-manager-operator-redhat-operators-openshift-marketplace`;

    // Determine link based on cluster version 4.20+ vs 4.19 and lower
    return major > 4 || (major === 4 && minor >= 20) ? linkLatest : link419;
  },
};

// External Links
export const EXTERNAL_LINKS = {
  // TODO: Update these when available for real
  documentation: 'https://docs.kuadrant.io',
  releaseNotes: 'https://github.com/Kuadrant/kuadrant-operator/releases',
  secureConnectProtect:
    'https://docs.kuadrant.io/latest/kuadrant-operator/doc/user-guides/full-walkthrough/secure-protect-connect/',
  highlights: 'https://kuadrant.io/blog/',
  blog: 'https://kuadrant.io/blog/',
};
