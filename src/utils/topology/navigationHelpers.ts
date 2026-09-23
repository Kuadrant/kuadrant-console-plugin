import { ResourceKind, RESOURCES, getPoliciesForResource } from '../resources';
import { canPolicyTarget, getCreatePolicyUrl } from '../policyTarget';

export interface PolicyConfig {
  key: ResourceKind;
  displayName: string;
}

// get available policy configurations for a given resource type
export const getPolicyConfigsForResource = (resourceType: string): PolicyConfig[] => {
  const policies = getPoliciesForResource(resourceType as ResourceKind);
  return policies
    .filter((policyKind) => RESOURCES[policyKind])
    .map((policyKind) => ({
      key: policyKind,
      displayName: `Create ${policyKind.replace(/Policy$/, ' Policy')}`,
    }));
};

// node labels are "namespace/name", or just "name" for cluster-scoped resources
const parseNodeLabel = (label: string): { namespace: string | null; name: string } => {
  const [namespace, name] = label.includes('/') ? label.split('/') : [null, label];
  return { namespace, name };
};

// navigate to a resource detail page
export const goToResource = (resourceType: string, resourceName: string) => {
  let lookupType = resourceType as ResourceKind;

  // special cases for synthetic topology nodes
  if (resourceType === 'Listener') {
    lookupType = 'Gateway';
  } else if (resourceType === 'HTTPRouteRule') {
    lookupType = 'HTTPRoute';
  }

  const finalGVK = RESOURCES[lookupType]?.gvk;
  if (!finalGVK) {
    console.warn(
      `Cannot navigate: resource type '${resourceType}' not found in registry. This may be a synthetic topology node.`,
    );
    return;
  }

  const { namespace, name } = parseNodeLabel(resourceName);

  const url = namespace
    ? `/k8s/ns/${namespace}/${finalGVK.group}~${finalGVK.version}~${finalGVK.kind}/${name}`
    : `/k8s/cluster/${finalGVK.group}~${finalGVK.version}~${finalGVK.kind}/${name}`;

  window.location.href = url;
};

// create page for a policy targeting the node's resource, in that resource's namespace
export const getCreatePolicyUrlForNode = (
  policyType: string,
  resourceType: string,
  resourceName: string,
): string | null => {
  const policyKind = policyType as ResourceKind;
  if (!RESOURCES[policyKind] || !canPolicyTarget(policyKind, resourceType)) {
    return null;
  }
  const { namespace, name } = parseNodeLabel(resourceName);
  if (!namespace) {
    return null;
  }
  return getCreatePolicyUrl(policyKind, namespace, { kind: resourceType, name });
};

// navigate to policy creation page
export const navigateToCreatePolicy = (
  policyType: string,
  resourceType: string,
  resourceName: string,
) => {
  const url = getCreatePolicyUrlForNode(policyType, resourceType, resourceName);
  if (!url) {
    console.error(`Cannot create ${policyType} for ${resourceType} '${resourceName}'`);
    return;
  }
  window.location.href = url;
};
