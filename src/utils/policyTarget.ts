import { RESOURCES, ResourceKind, getTargetKindsForPolicy } from './resources';
import { validateK8sName } from './validation';

// query params that tell a policy create page which resource to target
const TARGET_KIND_PARAM = 'targetKind';
const TARGET_NAME_PARAM = 'targetName';

export type PolicyTargetKind = 'Gateway' | 'HTTPRoute' | 'GRPCRoute';

// a target in the same namespace as the policy (targetRef has no namespace)
export interface PolicyTarget {
  kind: PolicyTargetKind;
  name: string;
}

export const canPolicyTarget = (policyKind: ResourceKind, kind: string): kind is PolicyTargetKind =>
  getTargetKindsForPolicy(policyKind).includes(kind as ResourceKind);

export const getCreatePolicyUrl = (
  policyKind: ResourceKind,
  namespace: string,
  target?: PolicyTarget,
): string => {
  const { group, version, kind } = RESOURCES[policyKind].gvk;
  const url = `/k8s/ns/${namespace}/${group}~${version}~${kind}/~new`;
  if (!target) {
    return url;
  }
  const params = new URLSearchParams({
    [TARGET_KIND_PARAM]: target.kind,
    [TARGET_NAME_PARAM]: target.name,
  });
  return `${url}?${params.toString()}`;
};

// null unless the query string names a target this policy kind accepts
export const getPolicyTargetFromSearch = (
  policyKind: ResourceKind,
  search: string,
): PolicyTarget | null => {
  const params = new URLSearchParams(search);
  const kind = params.get(TARGET_KIND_PARAM);
  const name = params.get(TARGET_NAME_PARAM);
  if (!kind || !name || validateK8sName(name) || !canPolicyTarget(policyKind, kind)) {
    return null;
  }
  return { kind, name };
};
