import { checkAccess, K8sVerb } from '@openshift-console/dynamic-plugin-sdk';
import { useEffect, useState } from 'react';


// const resources: { group: string; resource: string; verb: K8sVerb }[] = [
// { group: 'kuadrant.io', resource: 'authpolicies', verb: 'list' },
// { group: 'kuadrant.io', resource: 'dnspolicies', verb: 'list' },
// { group: 'kuadrant.io', resource: 'ratelimitpolicies', verb: 'list' },
// { group: 'kuadrant.io', resource: 'tlsPolicies', verb: 'list' },
// { group: 'kuadrant.io', resource: 'authpolicies', verb: 'create' },
// { group: 'kuadrant.io', resource: 'dnspolicies', verb: 'create' },
// { group: 'kuadrant.io', resource: 'ratelimitpolicies', verb: 'create' },
// { group: 'kuadrant.io', resource: 'tlsPolicies', verb: 'create' },
// { group: 'gateway.networking.k8s.io', resource: 'gateways', verb: 'list' },
// { group: 'gateway.networking.k8s.io', resource: 'httproutes', verb: 'list' },

// ];

// const RbacPermissions = (group: string, resource: string, verb: K8sVerb, namespace?:string) => {
//   return useAccessReview({
//     group,
//     resource,
//     verb,
//     namespace
//   });
// };

function resourcesPerms(groups, resources, verbs) {
  const rules = [];

  groups.forEach((group) => {
    resources[group]?.forEach((resource) => {
      verbs.forEach((verb) => {
        rules.push({ group, resource, verb });
      });
    });
  });

  return rules;
}

const group: string[] = ['kuadrant.io', 'gateway.networking.k8s.io'];

const resources: Record<string, string[]> = {
  'kuadrant.io': ['authpolicies', 'dnspolicies', 'ratelimitpolicies', 'tlspolicies'],
  'gateway.networking.k8s.io': ['gateways', 'httproutes'],
};

const verbs: K8sVerb[] = ['list', 'create', 'update', 'delete'];

const rules = resourcesPerms(group, resources, verbs);
console.log('RULES', rules);

const RBACPermissions = () => {
  const [RBAC, setRBAC] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const checkRBAC = async () => {
      const results = await Promise.all(
        rules.map(async ({ group, resource, verb }) => {
          const result = await checkAccess({
            group,
            resource,
            verb,
          });

          return { key: `${resource}-${verb}`, isAllowed: result.status?.allowed };
        }),
      );
      const RBACMap = results.reduce((acc, { key, isAllowed }) => {
        acc[key] = isAllowed;
        return acc;
      }, {} as Record<string, boolean>);
      setRBAC(RBACMap);
    };

    checkRBAC();
  }, []);

  return RBAC;
};

export default RBACPermissions;
