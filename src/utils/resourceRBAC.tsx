import { checkAccess, K8sVerb } from '@openshift-console/dynamic-plugin-sdk';
import { useEffect, useState } from 'react';

type Resource = {
  group: string;
  version: string;
  kind: string;
  namespace?: string;
};

const verbs: K8sVerb[] = ['list', 'create', 'update', 'delete'];

function RBACPermissions(resource: Resource[]) {
  const [RBAC, setRBAC] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const checkRBAC = async () => {
      const results = await Promise.all(
        resource.flatMap(({ group, kind }) =>
          verbs.map(async (verb) => {
            const result = await checkAccess({
              group,
              resource: kind,
              verb,
            });
            return { key: `${kind}-${verb}`, isAllowed: result.status?.allowed };
          }),
        ),
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
}

export default RBACPermissions;
