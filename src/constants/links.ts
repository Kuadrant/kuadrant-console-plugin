// Internal Links
export const INTERNAL_LINKS = {
  createPolicies: '/kuadrant/all-namespaces/policies',
  addNewGateway: (namespace: string) =>
    `/k8s/ns/${
      namespace === '#ALL_NS#' ? 'default' : namespace
    }/gateway.networking.k8s.io~v1~Gateway/~new`,
  observabilitySetup:
    'https://docs.kuadrant.io/latest/kuadrant-operator/doc/observability/examples/',
  certManagerOperator: (namespace: string) =>
    `/operatorhub/ns/${
      namespace === '#ALL_NS#' ? 'default' : namespace
    }?keyword=cert-manager&details-item=openshift-cert-manager-operator-redhat-operators-openshift-marketplace`,
};

// External Links
export const EXTERNAL_LINKS = {
  // TODO: Update these when available for real
  documentation: 'https://docs.kuadrant.io',
  releaseNotes: 'https://github.com/Kuadrant/kuadrant-operator/releases',
  quickStarts:
    'https://docs.kuadrant.io/latest/kuadrant-operator/doc/user-guides/secure-protect-connect/',
  highlights: 'https://kuadrant.io/blog/',
  blog: 'https://kuadrant.io/blog/',
};
