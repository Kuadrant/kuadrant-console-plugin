import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom-v5-compat';
import {
  PageSection,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Label,
  Alert,
} from '@patternfly/react-core';
import { Timestamp } from '@openshift-console/dynamic-plugin-sdk';
import { APIKey } from '../../utils/resources';
import { formatLimits } from '../../utils/apiKeyUtils';
import APIKeyRevealModal from './APIKeyRevealModal';
import UsageExamples from './UsageExamples';
import { APIKeyStatusBadge } from './APIKeyStatusBadge';
import '../kuadrant.css';

interface APIKeyDetailsTabProps {
  apiKey: APIKey;
}

const APIKeyDetailsTab: React.FC<APIKeyDetailsTabProps> = ({ apiKey }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  // Get rejection reason from conditions
  const getRejectionReason = (): string | undefined => {
    if (apiKey.status?.phase !== 'Rejected' || !apiKey.status?.conditions) {
      return undefined;
    }
    // Look for Ready condition with status False and reason Rejected
    const rejectedCondition = apiKey.status.conditions.find(
      (c) => c.type === 'Ready' && c.status === 'False' && c.reason === 'Rejected',
    );
    return rejectedCondition?.message;
  };

  const rejectionReason = getRejectionReason();

  return (
    <PageSection hasBodyWrapper={false}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div>
          <DescriptionList>
            <DescriptionListGroup>
              <DescriptionListTerm>{t('Name')}</DescriptionListTerm>
              <DescriptionListDescription>{apiKey.metadata.name}</DescriptionListDescription>
            </DescriptionListGroup>
            {apiKey.spec?.useCase && (
              <DescriptionListGroup>
                <DescriptionListTerm>{t('Use Case')}</DescriptionListTerm>
                <DescriptionListDescription>{apiKey.spec.useCase}</DescriptionListDescription>
              </DescriptionListGroup>
            )}
            <DescriptionListGroup>
              <DescriptionListTerm>{t('Status')}</DescriptionListTerm>
              <DescriptionListDescription>
                <APIKeyStatusBadge phase={apiKey.status?.phase} />
                {rejectionReason && (
                  <Alert
                    variant="danger"
                    isInline
                    isPlain
                    customIcon={<></>}
                    title={t('Rejection Reason')}
                    style={{ marginTop: '8px' }}
                  >
                    {rejectionReason}
                  </Alert>
                )}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>{t('Tier')}</DescriptionListTerm>
              <DescriptionListDescription>
                {(() => {
                  const limitsText = formatLimits(apiKey.status?.limits);
                  return (
                    <>
                      {apiKey.spec?.planTier || limitsText ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {apiKey.spec?.planTier && <Label isCompact>{apiKey.spec.planTier}</Label>}
                          {limitsText && <span>{limitsText}</span>}
                        </div>
                      ) : (
                        '-'
                      )}
                    </>
                  );
                })()}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>{t('API Product')}</DescriptionListTerm>
              <DescriptionListDescription>
                {apiKey.spec?.apiProductRef?.name ? (
                  <Link
                    to={`/k8s/ns/${apiKey.metadata.namespace}/devportal.kuadrant.io~v1alpha1~APIProduct/${apiKey.spec.apiProductRef.name}`}
                  >
                    {apiKey.spec.apiProductRef.name}
                  </Link>
                ) : (
                  '-'
                )}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>{t('Requested Time')}</DescriptionListTerm>
              <DescriptionListDescription>
                {apiKey.metadata.creationTimestamp ? (
                  <Timestamp timestamp={apiKey.metadata.creationTimestamp} />
                ) : (
                  '-'
                )}
              </DescriptionListDescription>
            </DescriptionListGroup>
            {apiKey.status?.phase === 'Approved' && apiKey.status?.secretRef?.name && (
              <DescriptionListGroup>
                <DescriptionListTerm>{t('API Key')}</DescriptionListTerm>
                <DescriptionListDescription>
                  <APIKeyRevealModal apiKeyObj={apiKey} />
                </DescriptionListDescription>
              </DescriptionListGroup>
            )}
          </DescriptionList>
        </div>
        <div>
          <UsageExamples apiKey={apiKey} />
        </div>
      </div>
    </PageSection>
  );
};

export default APIKeyDetailsTab;
