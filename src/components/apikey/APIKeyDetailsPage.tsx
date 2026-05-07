import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom-v5-compat';
import {
  PageSection,
  Title,
  Card,
  CardBody,
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  Label,
  Divider,
  Button,
  ClipboardCopy,
  Alert,
  Spinner,
} from '@patternfly/react-core';
import {
  ResourceLink,
  Timestamp,
  useK8sWatchResource,
  k8sGet,
} from '@openshift-console/dynamic-plugin-sdk';
import { RESOURCES } from '../../utils/resources';
import { APIKey } from './types';
import { getStatusLabel } from '../../utils/statusLabel';
import '../kuadrant.css';

const APIKeyDetailsPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const { ns, name } = useParams<{ ns: string; name: string }>();

  const [apiKey, loaded, loadError] = useK8sWatchResource<APIKey>({
    groupVersionKind: RESOURCES.APIKey.gvk,
    namespace: ns,
    name: name,
  });

  const [secretValue, setSecretValue] = React.useState<string | null>(null);
  const [isRevealing, setIsRevealing] = React.useState(false);
  const [revealError, setRevealError] = React.useState<string | null>(null);

  const revealKey = async () => {
    if (!apiKey?.spec.secretRef.name) return;
    setIsRevealing(true);
    setRevealError(null);
    try {
      const secret = await k8sGet({
        model: { version: 'v1', kind: 'Secret' },
        name: apiKey.spec.secretRef.name,
        ns: apiKey.metadata!.namespace!,
      });
      const encoded = secret.data?.api_key || secret.data?.password || '';
      setSecretValue(window.atob(encoded));
    } catch (err: any) {
      setRevealError(err.message || t('Failed to reveal secret'));
    } finally {
      setIsRevealing(false);
    }
  };

  if (loadError) {
    return (
      <PageSection>
        <Alert variant="danger" title={t('Error loading API Key')}>
          {loadError.message}
        </Alert>
      </PageSection>
    );
  }

  if (!loaded) {
    return (
      <PageSection>
        <Spinner />
      </PageSection>
    );
  }

  return (
    <PageSection>
      <div className="co-m-nav-title--row">
        <Title headingLevel="h1">
          {apiKey.metadata?.name} <Label color="blue">APIKey</Label>
        </Title>
      </div>
      <Card style={{ marginTop: '1rem' }}>
        <CardBody>
          <DescriptionList isHorizontal>
            <DescriptionListGroup>
              <DescriptionListTerm>{t('Status')}</DescriptionListTerm>
              <DescriptionListDescription>{getStatusLabel(apiKey)}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>{t('API Product')}</DescriptionListTerm>
              <DescriptionListDescription>
                <ResourceLink
                  groupVersionKind={RESOURCES.APIProduct.gvk}
                  name={apiKey.spec.apiProductRef.name}
                  namespace={apiKey.spec.apiProductRef.namespace}
                />
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>{t('Plan Tier')}</DescriptionListTerm>
              <DescriptionListDescription>
                <Label color="blue">{apiKey.spec.planTier}</Label>
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>{t('Requested By')}</DescriptionListTerm>
              <DescriptionListDescription>
                {apiKey.spec.requestedBy?.userId || '-'}
                {apiKey.spec.requestedBy?.email && ` (${apiKey.spec.requestedBy.email})`}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>{t('Created')}</DescriptionListTerm>
              <DescriptionListDescription>
                <Timestamp timestamp={apiKey.metadata?.creationTimestamp} />
              </DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>

          <Divider style={{ margin: '1.5rem 0' }} />

          <Title headingLevel="h2" size="md">
            {t('API Key Value')}
          </Title>
          <div style={{ marginTop: '0.5rem' }}>
            {secretValue ? (
              <ClipboardCopy isReadOnly>{secretValue}</ClipboardCopy>
            ) : (
              <div>
                <Button variant="secondary" onClick={revealKey} isLoading={isRevealing}>
                  {t('Reveal API Key')}
                </Button>
                {revealError && (
                  <Alert
                    variant="danger"
                    isInline
                    title={revealError}
                    style={{ marginTop: '0.5rem' }}
                  />
                )}
              </div>
            )}
          </div>

          <Divider style={{ margin: '1.5rem 0' }} />

          <Title headingLevel="h2" size="md">
            {t('Conditions')}
          </Title>
          <div style={{ marginTop: '1rem' }}>
            {apiKey.status?.conditions?.length ? (
              <DescriptionList isHorizontal>
                {apiKey.status.conditions.map((condition, index) => (
                  <DescriptionListGroup key={index} style={{ marginBottom: '1rem' }}>
                    <DescriptionListTerm>{condition.type}</DescriptionListTerm>
                    <DescriptionListDescription>
                      <div>
                        <Label color={condition.status === 'True' ? 'green' : 'red'}>
                          {condition.status}
                        </Label>
                        <span style={{ marginLeft: '1rem' }}>
                          <Timestamp timestamp={condition.lastTransitionTime} />
                        </span>
                      </div>
                      {condition.reason && (
                        <div style={{ fontWeight: 'bold', marginTop: '0.25rem' }}>
                          {condition.reason}
                        </div>
                      )}
                      {condition.message && (
                        <div style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
                          {condition.message}
                        </div>
                      )}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                ))}
              </DescriptionList>
            ) : (
              <div>{t('No conditions available')}</div>
            )}
          </div>
        </CardBody>
      </Card>
    </PageSection>
  );
};

export default APIKeyDetailsPage;
