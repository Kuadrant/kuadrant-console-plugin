import { ResourceKind, RESOURCES, getPoliciesForResource } from '../resources';

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

  const [namespace, name] = resourceName.includes('/')
    ? resourceName.split('/')
    : [null, resourceName];

  const url = namespace
    ? `/k8s/ns/${namespace}/${finalGVK.group}~${finalGVK.version}~${finalGVK.kind}/${name}`
    : `/k8s/cluster/${finalGVK.group}~${finalGVK.version}~${finalGVK.kind}/${name}`;

  window.location.href = url;
};

// navigate to policy creation page
export const navigateToCreatePolicy = (policyType: string) => {
  const resourceKind = policyType as ResourceKind;
  const resource = RESOURCES[resourceKind];
  if (!resource) {
    console.error(`Resource not found for policy type: ${policyType}`);
    return;
  }
  const url = `/k8s/ns/default/${resource.gvk.group}~${resource.gvk.version}~${resource.gvk.kind}/~new`;
  window.location.href = url;
};
