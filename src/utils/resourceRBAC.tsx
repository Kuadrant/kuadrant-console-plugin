import { checkAccess, K8sVerb } from '@openshift-console/dynamic-plugin-sdk';
import { useEffect, useState } from 'react';
// interface GenericResource {
//     group: string;
//     resource: string;
//     verb?: string;
//     namespace?: string;
// }

const resources: { group: string; resource: string; verb: K8sVerb }[] = [
  { group: 'kuadrant.io', resource: 'authpolicies', verb: 'list' },
  { group: 'kuadrant.io', resource: 'dnspolicies', verb: 'list' },
  { group: 'kuadrant.io', resource: 'ratelimitpolicies', verb: 'list' },
  { group: 'kuadrant.io', resource: 'tlsPolicies', verb: 'list' },
  { group: 'kuadrant.io', resource: 'authpolicies', verb: 'create' },
  { group: 'kuadrant.io', resource: 'dnspolicies', verb: 'create' },
  { group: 'kuadrant.io', resource: 'ratelimitpolicies', verb: 'create' },
  { group: 'kuadrant.io', resource: 'tlsPolicies', verb: 'create' },
  { group: 'gateway.networking.k8s.io', resource: 'gateways', verb: 'list' },
  { group: 'gateway.networking.k8s.io', resource: 'httproutes', verb: 'list' },

];

// const RbacPermissions = (group: string, resource: string, verb: K8sVerb, namespace?:string) => {
//   return useAccessReview({
//     group,
//     resource,
//     verb,
//     namespace
//   });
// };

const RBACPermissions = () => {
  const [RBAC, setRBAC] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const checkPermissions = async () => {
      const results = await Promise.all(
        resources.map(async ({ group, resource, verb }) => {
          const result = await checkAccess({
            group,
            resource,
            verb,
          });

          return { key: `${resource}-${verb}`, isAllowed: result.status?.allowed };
        }),
      );
      const accessResultsMap = results.reduce((acc, { key, isAllowed }) => {
        acc[key] = isAllowed;
        return acc;
      }, {} as Record<string, boolean>);
      setRBAC(accessResultsMap);
    };

    checkPermissions();
  }, []);

  return RBAC;
};

export default RBACPermissions;
