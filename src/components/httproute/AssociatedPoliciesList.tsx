import { useK8sWatchResource, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import {
  HelperText,
  HelperTextItem,
  SimpleList,
  SimpleListItem,
  Label,
  Tooltip,
} from '@patternfly/react-core';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { RESOURCES } from '../../utils/resources';

interface AssociatedPoliciesListProps {
  routeName: string;
  routeNamespace: string;
}

interface Policy extends K8sResourceCommon {
  spec?: {
    targetRef?: {
      group?: string;
      kind?: string;
      name?: string;
    };
  };
}

const AssociatedPoliciesList: React.FC<AssociatedPoliciesListProps> = ({
  routeName,
  routeNamespace,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [routeLevelPolicies, setRouteLevelPolicies] = React.useState<
    Array<{ name: string; kind: string; level: 'route' | 'gateway' }>
  >([]);

  // Watch AuthPolicy resources
  const authPolicyResource = {
    groupVersionKind: RESOURCES.AuthPolicy.gvk,
    isList: true,
    namespace: routeNamespace,
  };
  const [authPolicies, authLoaded] = useK8sWatchResource<Policy[]>(authPolicyResource);

  // Watch RateLimitPolicy resources
  const rateLimitPolicyResource = {
    groupVersionKind: RESOURCES.RateLimitPolicy.gvk,
    isList: true,
    namespace: routeNamespace,
  };
  const [rateLimitPolicies, rlpLoaded] = useK8sWatchResource<Policy[]>(rateLimitPolicyResource);

  // Watch PlanPolicy resources
  const planPolicyResource = {
    groupVersionKind: RESOURCES.PlanPolicy.gvk,
    isList: true,
    namespace: routeNamespace,
  };
  const [planPolicies, planLoaded] = useK8sWatchResource<Policy[]>(planPolicyResource);

  // Watch HTTPRoute to get gateway reference
  const routeResource = routeName
    ? {
        groupVersionKind: RESOURCES.HTTPRoute.gvk,
        isList: false,
        name: routeName,
        namespace: routeNamespace,
      }
    : null;
  const [routeData, routeDataLoaded] = useK8sWatchResource<K8sResourceCommon>(routeResource);

  React.useEffect(() => {
    if (!routeName || !authLoaded || !rlpLoaded || !planLoaded || !routeDataLoaded) {
      return;
    }

    const policies: Array<{ name: string; kind: string; level: 'route' | 'gateway' }> = [];

    // Get all gateway names from route's parentRefs
    const gatewayNames = new Set<string>();
    if (routeData && !Array.isArray(routeData)) {
      const parentRefs = (routeData as any)?.spec?.parentRefs as
        | Array<{ group?: string; kind?: string; name?: string }>
        | undefined;
      parentRefs
        ?.filter((parentRef) => !parentRef.kind || parentRef.kind === 'Gateway')
        .forEach((parentRef) => {
          if (parentRef.name) {
            gatewayNames.add(parentRef.name);
          }
        });
    }

    // Helper to check if policy targets route or gateway
    const processPolicies = (policyList: Policy[], kind: string) => {
      if (!Array.isArray(policyList)) return;

      policyList.forEach((policy) => {
        const targetName = policy.spec?.targetRef?.name;
        const targetKind = policy.spec?.targetRef?.kind;

        if (targetKind === 'HTTPRoute' && targetName === routeName) {
          policies.push({ name: policy.metadata.name, kind, level: 'route' });
        } else if (targetKind === 'Gateway' && targetName && gatewayNames.has(targetName)) {
          policies.push({ name: policy.metadata.name, kind, level: 'gateway' });
        }
      });
    };

    processPolicies(authPolicies as Policy[], 'AuthPolicy');
    processPolicies(rateLimitPolicies as Policy[], 'RateLimitPolicy');
    processPolicies(planPolicies as Policy[], 'PlanPolicy');

    setRouteLevelPolicies(policies);
  }, [
    routeName,
    routeNamespace,
    authPolicies,
    rateLimitPolicies,
    planPolicies,
    authLoaded,
    rlpLoaded,
    planLoaded,
    routeData,
    routeDataLoaded,
  ]);

  if (!routeName) {
    return null;
  }

  return (
    <div>
      <HelperText>
        <HelperTextItem>
          {t('Associated Policies')}
          <Tooltip
            content={t(
              'A consolidated view of all policies attached to this route (including gateway-level policies).',
            )}
          >
            <span style={{ marginLeft: '4px', cursor: 'help' }}>ⓘ</span>
          </Tooltip>
        </HelperTextItem>
      </HelperText>
      {routeLevelPolicies.length === 0 ? (
        <p style={{ fontSize: '14px', color: 'var(--pf-v6-global--Color--200)' }}>
          {t('No policies attached to this HTTPRoute')}
        </p>
      ) : (
        <SimpleList>
          {routeLevelPolicies.map((policy, index) => (
            <SimpleListItem key={index}>
              <Label color="blue">{policy.kind}</Label> {policy.name}
              {policy.level === 'gateway' && (
                <Label variant="outline" style={{ marginLeft: '8px' }}>
                  {t('inherited from gateway')}
                </Label>
              )}
            </SimpleListItem>
          ))}
        </SimpleList>
      )}
    </div>
  );
};

export default AssociatedPoliciesList;
