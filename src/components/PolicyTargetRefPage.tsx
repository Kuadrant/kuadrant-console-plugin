import * as React from 'react';
import Helmet from 'react-helmet';
import { useTranslation } from 'react-i18next';
import {
  PageSection,
  Title,
  EmptyState,
  EmptyStateBody,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Skeleton,
} from '@patternfly/react-core';
import { useLocation } from 'react-router';
import {
  K8sResourceCommon,
  ResourceLink,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { SearchIcon } from '@patternfly/react-icons';
import './kuadrant.css';
import extractResourceNameFromURL, {
  extractKindFromURL,
  extractNamespaceFromURL,
} from '../utils/nameFromPath';
import { RESOURCES, ResourceKind } from '../utils/resources';
import { getStatusLabel } from '../utils/statusLabel';

type TargetRef = {
  group: string;
  kind: string;
  name: string;
  namespace?: string;
};

type PolicyResource = K8sResourceCommon & {
  spec?: {
    targetRef?: TargetRef;
  };
};

const PolicyTargetRefPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const location = useLocation();

  const policyName = extractResourceNameFromURL(location.pathname);
  const policyKindStr = extractKindFromURL(location.pathname);
  const policyNamespace = extractNamespaceFromURL(location.pathname);
  const policyMeta =
    policyKindStr && policyKindStr in RESOURCES
      ? RESOURCES[policyKindStr as ResourceKind]
      : undefined;

  const policyWatch =
    policyMeta && policyName && policyNamespace
      ? {
          groupVersionKind: policyMeta.gvk,
          namespace: policyNamespace,
          name: policyName,
          isList: false,
        }
      : null;
  const [policy, policyLoaded, policyLoadError] = useK8sWatchResource<PolicyResource>(policyWatch);

  const targetRef = policy?.spec?.targetRef;
  const targetMeta =
    targetRef && targetRef.kind in RESOURCES
      ? RESOURCES[targetRef.kind as ResourceKind]
      : undefined;
  // Fall back to policy's namespace when targetRef.namespace is omitted.
  const targetNamespace = targetRef?.namespace || policyNamespace || undefined;

  const targetWatch =
    targetMeta && targetRef && targetNamespace
      ? {
          groupVersionKind: targetMeta.gvk,
          namespace: targetNamespace,
          name: targetRef.name,
          isList: false,
        }
      : null;
  const [target, targetLoaded, targetLoadError] =
    useK8sWatchResource<K8sResourceCommon>(targetWatch);

  const renderStatus = () => {
    if (!targetLoaded) return <Skeleton width="80px" screenreaderText={t('Loading status')} />;
    if (targetLoadError) return <>{t('Error loading target')}</>;
    if (!target) return <>{t('Target not found')}</>;
    return <>{getStatusLabel(t, target)}</>;
  };

  const renderBody = () => {
    if (!policyMeta || !policyName || !policyNamespace) {
      return <div>{t('Could not determine policy from URL')}</div>;
    }
    if (!policyLoaded) return <div>{t('Loading...')}</div>;
    if (policyLoadError) {
      return (
        <div>{t('Error loading policy: {{message}}', { message: policyLoadError.message })}</div>
      );
    }
    if (!targetRef) {
      return (
        <EmptyState
          titleText={
            <Title headingLevel="h4" size="lg">
              {t('No target reference')}
            </Title>
          }
          icon={SearchIcon}
        >
          <EmptyStateBody>{t('This policy does not declare a spec.targetRef.')}</EmptyStateBody>
        </EmptyState>
      );
    }
    return (
      <DescriptionList isHorizontal>
        <DescriptionListGroup>
          <DescriptionListTerm>{t('Name')}</DescriptionListTerm>
          <DescriptionListDescription>
            {targetMeta ? (
              <ResourceLink
                groupVersionKind={targetMeta.gvk}
                name={targetRef.name}
                namespace={targetNamespace}
              />
            ) : (
              targetRef.name
            )}
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>{t('Type')}</DescriptionListTerm>
          <DescriptionListDescription>{targetRef.kind}</DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>{t('Namespace')}</DescriptionListTerm>
          <DescriptionListDescription>{targetNamespace || '-'}</DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>{t('Status')}</DescriptionListTerm>
          <DescriptionListDescription>{renderStatus()}</DescriptionListDescription>
        </DescriptionListGroup>
      </DescriptionList>
    );
  };

  return (
    <>
      <Helmet>
        <title data-test="policy-target-ref-page-title">{t('Target Reference')}</title>
      </Helmet>
      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h2">{t('Target Reference')}</Title>
        {renderBody()}
      </PageSection>
    </>
  );
};

export default PolicyTargetRefPage;
