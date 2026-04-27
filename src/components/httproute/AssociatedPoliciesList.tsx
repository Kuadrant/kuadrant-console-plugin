import { useK8sWatchResource, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import {
  HelperText,
  HelperTextItem,
  SimpleList,
  SimpleListItem,
  Label,
  Tooltip,
  Button,
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
      namespace?: string;
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

  // Watch TokenRateLimitPolicy resources
  const tokenRateLimitPolicyResource = {
    groupVersionKind: RESOURCES.TokenRateLimitPolicy.gvk,
    isList: true,
    namespace: routeNamespace,
  };
  const [tokenRateLimitPolicies, trlpLoaded] = useK8sWatchResource<Policy[]>(
    tokenRateLimitPolicyResource,
  );

  // Watch OIDCPolicy resources
  const oidcPolicyResource = {
    groupVersionKind: RESOURCES.OIDCPolicy.gvk,
    isList: true,
    namespace: routeNamespace,
  };
  const [oidcPolicies, oidcLoaded] = useK8sWatchResource<Policy[]>(oidcPolicyResource);

  // Watch PlanPolicy resources
  const planPolicyResource = {
    groupVersionKind: RESOURCES.PlanPolicy.gvk,
    isList: true,
    namespace: routeNamespace,
  };
  const [planPolicies, planLoaded] = useK8sWatchResource<Policy[]>(planPolicyResource);

  // Watch DNSPolicy resources (for gateway-level policies)
  const dnsPolicyResource = {
    groupVersionKind: RESOURCES.DNSPolicy.gvk,
    isList: true,
    namespace: routeNamespace,
  };
  const [dnsPolicies, dnsLoaded] = useK8sWatchResource<Policy[]>(dnsPolicyResource);

  // Watch TLSPolicy resources (for gateway-level policies)
  const tlsPolicyResource = {
    groupVersionKind: RESOURCES.TLSPolicy.gvk,
    isList: true,
    namespace: routeNamespace,
  };
  const [tlsPolicies, tlsLoaded] = useK8sWatchResource<Policy[]>(tlsPolicyResource);

  // Watch HTTPRoute to get gateway reference
  const routeResource = routeName
    ? {
        groupVersionKind: RESOURCES.HTTPRoute.gvk,
        isList: false,
        name: routeName,
        namespace: routeNamespace,
      }
    : null;
  type HTTPRouteLike = K8sResourceCommon & {
    spec?: {
      parentRefs?: Array<{ group?: string; kind?: string; name?: string; namespace?: string }>;
    };
  };
  const [routeData, routeDataLoaded] = useK8sWatchResource<HTTPRouteLike>(routeResource);

  React.useEffect(() => {
    if (
      !routeName ||
      !authLoaded ||
      !rlpLoaded ||
      !trlpLoaded ||
      !oidcLoaded ||
      !planLoaded ||
      !dnsLoaded ||
      !tlsLoaded ||
      !routeDataLoaded
    ) {
      return;
    }

    const policies: Array<{ name: string; kind: string; level: 'route' | 'gateway' }> = [];

    // Get all gateway refs from route's parentRefs (namespace/name tuples)
    const gatewayRefs = new Set<string>();
    if (routeData && !Array.isArray(routeData)) {
      const parentRefs = routeData.spec?.parentRefs;
      parentRefs
        ?.filter((parentRef) => !parentRef.kind || parentRef.kind === 'Gateway')
        .forEach((parentRef) => {
          if (parentRef.name) {
            // Use parentRef namespace if provided, otherwise default to route's namespace
            const gatewayNamespace = parentRef.namespace ?? routeNamespace;
            gatewayRefs.add(`${gatewayNamespace}/${parentRef.name}`);
          }
        });
    }

    // Helper to check if policy targets route or gateway
    const processPolicies = (policyList: Policy[], kind: string) => {
      if (!Array.isArray(policyList)) return;

      policyList.forEach((policy) => {
        const targetName = policy.spec?.targetRef?.name;
        const targetKind = policy.spec?.targetRef?.kind;
        const targetNamespace = policy.spec?.targetRef?.namespace;

        if (targetKind === 'HTTPRoute' && targetName === routeName) {
          policies.push({ name: policy.metadata.name, kind, level: 'route' });
        } else if (targetKind === 'Gateway' && targetName) {
          // Match gateway using both namespace and name
          const gatewayNamespace = targetNamespace ?? policy.metadata.namespace;
          const gatewayRef = `${gatewayNamespace}/${targetName}`;
          if (gatewayRefs.has(gatewayRef)) {
            policies.push({ name: policy.metadata.name, kind, level: 'gateway' });
          }
        }
      });
    };

    processPolicies(authPolicies as Policy[], 'AuthPolicy');
    processPolicies(rateLimitPolicies as Policy[], 'RateLimitPolicy');
    processPolicies(tokenRateLimitPolicies as Policy[], 'TokenRateLimitPolicy');
    processPolicies(oidcPolicies as Policy[], 'OIDCPolicy');
    processPolicies(planPolicies as Policy[], 'PlanPolicy');
    processPolicies(dnsPolicies as Policy[], 'DNSPolicy');
    processPolicies(tlsPolicies as Policy[], 'TLSPolicy');

    setRouteLevelPolicies(policies);
  }, [
    routeName,
    routeNamespace,
    authPolicies,
    rateLimitPolicies,
    tokenRateLimitPolicies,
    oidcPolicies,
    planPolicies,
    dnsPolicies,
    tlsPolicies,
    authLoaded,
    rlpLoaded,
    trlpLoaded,
    oidcLoaded,
    planLoaded,
    dnsLoaded,
    tlsLoaded,
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
            <Button
              variant="plain"
              aria-label={t('Explain associated policies')}
              style={{
                marginLeft: '4px',
                padding: 0,
                minWidth: 'auto',
                fontSize: 'inherit',
                verticalAlign: 'baseline',
              }}
            >
              ⓘ
            </Button>
          </Tooltip>
        </HelperTextItem>
      </HelperText>
      {routeLevelPolicies.length === 0 ? (
        <p style={{ fontSize: '14px', color: 'var(--pf-v6-global--Color--200)' }}>
          {t('No policies attached to this HTTPRoute')}
        </p>
      ) : (
        <SimpleList>
          {routeLevelPolicies.map((policy) => (
            <SimpleListItem key={`${policy.kind}-${policy.level}-${policy.name}`}>
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
