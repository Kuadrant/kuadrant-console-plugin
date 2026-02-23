import { checkAccess, K8sVerb } from '@openshift-console/dynamic-plugin-sdk';
import { useEffect, useState } from 'react';

type Resource = {
  group: string;
  kind: string;
  namespace?: string;
};

const verbs: K8sVerb[] = ['list', 'create', 'update', 'delete'];

function useAccessReviews(resource: Resource[]) {
  const [userRBAC, setUserRBAC] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkRBAC = async () => {
      const results = await Promise.all(
        resource.flatMap(({ group, kind, namespace }) =>
          verbs.map(async (verb) => {
            const result = await checkAccess({
              group,
              resource: kind,
              verb,
              ...(namespace ? { namespace } : {}),
            });
            return { key: `${kind}-${verb}`, isAllowed: result.status?.allowed };
          }),
        ),
      );
      const RBACMap = results.reduce((acc, { key, isAllowed }) => {
        acc[key] = isAllowed;
        return acc;
      }, {} as Record<string, boolean>);
      setUserRBAC(RBACMap);
      setLoading(false);
    };

    checkRBAC();
  }, []);

  return { userRBAC, loading };
}

export default useAccessReviews;
