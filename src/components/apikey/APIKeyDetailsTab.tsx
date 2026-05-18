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
import { Timestamp, k8sGet, useK8sModel } from '@openshift-console/dynamic-plugin-sdk';
import { EyeIcon, EyeSlashIcon } from '@patternfly/react-icons';
import { APIKey, getAPIKeyPhase, Secret } from '../../utils/resources';
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
  const [showRevealModal, setShowRevealModal] = React.useState(false);
  const [isViewed, setIsViewed] = React.useState(false);

  // Get the Secret model
  const [secretModel] = useK8sModel({ version: 'v1', kind: 'Secret' });

  // Check if secret has been viewed on mount
  React.useEffect(() => {
    const checkViewed = async () => {
      if (
        !secretModel ||
        !apiKey.spec?.secretRef?.name ||
        !apiKey.metadata.namespace ||
        getAPIKeyPhase(apiKey) !== 'Approved'
      ) {
        return;
      }

      try {
        const secret = await k8sGet<Secret>({
          model: secretModel,
          name: apiKey.spec.secretRef.name,
          ns: apiKey.metadata.namespace,
        });

        const viewed =
          secret.metadata?.annotations?.['devportal.kuadrant.io/apikey-viewed'] === 'true';
        setIsViewed(viewed);
      } catch (err) {
        console.error('Error checking secret viewed status:', err);
      }
    };

    checkViewed();
  }, [secretModel, apiKey]);

  // Get denial reason from conditions
  const getDenialReason = (): string | undefined => {
    if (getAPIKeyPhase(apiKey) !== 'Denied' || !apiKey.status?.conditions) {
      return undefined;
    }
    // Look for Denied condition with status True
    const deniedCondition = apiKey.status.conditions.find(
      (c) => c.type === 'Denied' && c.status === 'True',
    );
    return deniedCondition?.message;
  };

  const denialReason = getDenialReason();

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
                <APIKeyStatusBadge phase={getAPIKeyPhase(apiKey)} />
                {denialReason && (
                  <Alert
                    variant="danger"
                    isInline
                    isPlain
                    customIcon={<></>}
                    title={t('Denial Reason')}
                    style={{ marginTop: '8px' }}
                  >
                    {denialReason}
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
            {getAPIKeyPhase(apiKey) === 'Approved' && apiKey.spec?.secretRef?.name && (
              <DescriptionListGroup>
                <DescriptionListTerm>{t('API Key')}</DescriptionListTerm>
                <DescriptionListDescription>
                  {isViewed ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: 'var(--pf-v6-global--disabled-color--100)',
                      }}
                    >
                      <EyeSlashIcon />
                      <span>{t('Already viewed')}</span>
                    </div>
                  ) : (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowRevealModal(true);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowRevealModal(true);
                        }
                      }}
                      aria-label={t('Reveal API key')}
                    >
                      <span style={{ fontFamily: 'monospace' }}>••••••••••••••••</span>
                      <EyeIcon style={{ color: 'var(--pf-v6-global--primary-color--100)' }} />
                    </div>
                  )}
                </DescriptionListDescription>
              </DescriptionListGroup>
            )}
          </DescriptionList>
        </div>
        <div>
          <UsageExamples apiKey={apiKey} />
        </div>
      </div>

      {/* Reveal API Key Modal */}
      {showRevealModal && (
        <APIKeyRevealModal
          apiKeyObj={apiKey}
          onClose={() => {
            setShowRevealModal(false);
            setIsViewed(true);
          }}
        />
      )}
    </PageSection>
  );
};

export default APIKeyDetailsTab;
