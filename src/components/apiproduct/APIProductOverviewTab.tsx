import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom-v5-compat';
import {
  PageSection,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Label,
  LabelGroup,
  Alert,
  Spinner,
  Title,
  Button,
  Divider,
  ClipboardCopy,
} from '@patternfly/react-core';
import { PencilAltIcon } from '@patternfly/react-icons';
import {
  useK8sWatchResource,
  useActiveNamespace,
  useAccessReview,
  Timestamp,
  K8sResourceCommon,
} from '@openshift-console/dynamic-plugin-sdk';
import { APIProduct, PlanSpec } from './types';
import { RESOURCES } from '../../utils/resources';
import extractResourceNameFromURL from '../../utils/nameFromPath';
import { getResourceNameFromKind } from '../../utils/getModelFromResource';
import NoPermissionsView from '../NoPermissionsView';
import ContactInfoEditModal from './ContactInfoEditModal';
import TagsEditModal from './TagsEditModal';
import PublishStatusEditModal from './PublishStatusEditModal';
import DocumentationEditModal from './DocumentationEditModal';
import { formatLimits } from '../../utils/apiKeyUtils';
import '../kuadrant.css';

type ContactField = 'team' | 'email' | 'slack' | 'url';
type DocumentationField = 'openAPISpecURL' | 'docsURL';

// Minimal shape of the HTTPRoute the APIProduct targets - we only read the
// hostnames to derive the product's public address.
interface LinkedHTTPRoute extends K8sResourceCommon {
  spec?: {
    hostnames?: string[];
  };
}

const APIProductOverviewTab: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();
  const location = useLocation();
  const productName = extractResourceNameFromURL(location.pathname);
  const [editingField, setEditingField] = React.useState<ContactField | null>(null);
  const [editingDocField, setEditingDocField] = React.useState<DocumentationField | null>(null);
  const [isEditingTags, setIsEditingTags] = React.useState(false);
  const [isEditingPublishStatus, setIsEditingPublishStatus] = React.useState(false);

  const [canGet, canGetLoading] = useAccessReview({
    group: RESOURCES.APIProduct.gvk.group,
    resource: getResourceNameFromKind(RESOURCES.APIProduct.gvk.kind),
    verb: 'get',
    namespace: activeNamespace,
    name: productName,
  });

  const [canUpdate, canUpdateLoading] = useAccessReview({
    group: RESOURCES.APIProduct.gvk.group,
    resource: getResourceNameFromKind(RESOURCES.APIProduct.gvk.kind),
    verb: 'update',
    namespace: activeNamespace,
    name: productName,
  });

  const [apiProduct, loaded, loadError] = useK8sWatchResource<APIProduct>(
    canGet && !canGetLoading
      ? {
          groupVersionKind: RESOURCES.APIProduct.gvk,
          namespace: activeNamespace,
          name: productName,
          isList: false,
        }
      : null,
  );

  // The APIProduct's public address is derived from the HTTPRoute it targets:
  // its first hostname becomes the public URL. The APIProduct itself carries no
  // address field, so we resolve it from the linked route's spec.hostnames.
  const targetRef = apiProduct?.spec?.targetRef;

  // Cache the targetRef so a transient watch reconnection (where spec is briefly
  // absent) doesn't drop the linked route, matching APIProductPoliciesTab.
  const [cachedTargetRef, setCachedTargetRef] = React.useState<typeof targetRef>(undefined);
  React.useEffect(() => {
    if (targetRef) {
      setCachedTargetRef(targetRef);
    }
  }, [targetRef]);
  const targetRefToUse = targetRef || cachedTargetRef;

  const [httpRoute] = useK8sWatchResource<LinkedHTTPRoute>(
    targetRefToUse && targetRefToUse.kind === 'HTTPRoute'
      ? {
          groupVersionKind: RESOURCES.HTTPRoute.gvk,
          namespace: targetRefToUse.namespace || activeNamespace,
          name: targetRefToUse.name,
          isList: false,
        }
      : null,
  );

  // Use the first non-empty hostname as the public address.
  const publicUrl = React.useMemo(() => {
    const hostname = httpRoute?.spec?.hostnames?.find((h) => h.trim().length > 0);
    return hostname ? `https://${hostname}` : undefined;
  }, [httpRoute]);

  // Check if API Product has API Key authentication configured
  const hasApiKeyAuth = React.useMemo(() => {
    if (!apiProduct) return false;
    const authScheme = apiProduct.status?.discoveredAuthScheme;
    if (!authScheme?.authentication || typeof authScheme.authentication !== 'object') return false;

    // Check if at least one authentication entry has apiKey configured
    return Object.values(authScheme.authentication).some(
      (auth) => auth && typeof auth === 'object' && 'apiKey' in auth && auth.apiKey !== undefined,
    );
  }, [apiProduct]);

  // Get discovered plans
  const discoveredPlans = apiProduct?.status?.discoveredPlans || [];
  const hasPlans = discoveredPlans.length > 0;

  // Get authentication methods from discoveredAuthScheme
  const authMethods = React.useMemo(() => {
    const methods: string[] = [];
    const authScheme = apiProduct?.status?.discoveredAuthScheme;

    if (authScheme?.authentication && typeof authScheme.authentication === 'object') {
      Object.values(authScheme.authentication).forEach((auth) => {
        if (auth && typeof auth === 'object') {
          if ('apiKey' in auth && auth.apiKey !== undefined) {
            methods.push('API Key');
          }
          if ('jwt' in auth && auth.jwt !== undefined) {
            methods.push('OIDC (JWT)');
          }
        }
      });
    }

    return [...new Set(methods)]; // Remove duplicates
  }, [apiProduct?.status?.discoveredAuthScheme]);

  const hasAuthMethods = authMethods.length > 0;

  if (canGetLoading) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Spinner size="lg" />
      </PageSection>
    );
  }

  if (!canGet) {
    return (
      <NoPermissionsView primaryMessage={t('You do not have permission to view API Products')} />
    );
  }

  if (loadError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Alert variant="danger" isInline title={t('Error loading API Product')}>
          {loadError.message}
        </Alert>
      </PageSection>
    );
  }

  if (!loaded || !apiProduct) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Spinner size="lg" />
      </PageSection>
    );
  }

  const renderContactField = (
    field: ContactField,
    label: string,
    value: string | undefined,
    href?: string,
  ) => {
    const displayValue = value || t('Not set');
    const content =
      href && value ? (
        <a
          href={href}
          target={href.startsWith('http') ? '_blank' : undefined}
          rel="noopener noreferrer"
        >
          {displayValue}
        </a>
      ) : (
        <span style={{ color: value ? 'inherit' : 'var(--pf-v6-global--Color--200)' }}>
          {displayValue}
        </span>
      );

    return (
      <DescriptionListGroup>
        <DescriptionListTerm>{label}</DescriptionListTerm>
        <DescriptionListDescription>
          {content}
          {canUpdate && !canUpdateLoading && (
            <Button
              variant="plain"
              onClick={() => setEditingField(field)}
              aria-label={t('Edit {{field}}', { field: label })}
              style={{ marginLeft: '8px', padding: '0 4px' }}
            >
              <PencilAltIcon />
            </Button>
          )}
        </DescriptionListDescription>
      </DescriptionListGroup>
    );
  };

  const renderDocumentationField = (field: DocumentationField, label: string) => {
    const value = apiProduct.spec.documentation?.[field];
    const displayValue = value || t('Not set');
    const content = value ? (
      <a href={value} target="_blank" rel="noopener noreferrer">
        {displayValue}
      </a>
    ) : (
      <span style={{ color: 'var(--pf-v6-global--Color--200)' }}>{displayValue}</span>
    );

    return (
      <DescriptionListGroup>
        <DescriptionListTerm>{label}</DescriptionListTerm>
        <DescriptionListDescription>
          {content}
          {canUpdate && !canUpdateLoading && (
            <Button
              variant="plain"
              onClick={() => setEditingDocField(field)}
              aria-label={t('Edit {{field}}', { field: label })}
              style={{ marginLeft: '8px', padding: '0 4px' }}
            >
              <PencilAltIcon />
            </Button>
          )}
        </DescriptionListDescription>
      </DescriptionListGroup>
    );
  };

  return (
    <PageSection hasBodyWrapper={false}>
      <Title headingLevel="h2" size="lg" style={{ marginBottom: '8px' }}>
        {t('About')}
      </Title>
      <DescriptionList
        columnModifier={{
          default: '2Col',
        }}
      >
        <DescriptionListGroup>
          <DescriptionListTerm>{t('Display Name')}</DescriptionListTerm>
          <DescriptionListDescription>
            {apiProduct.spec.displayName || apiProduct.metadata.name}
          </DescriptionListDescription>
        </DescriptionListGroup>

        <DescriptionListGroup>
          <DescriptionListTerm>{t('Address')}</DescriptionListTerm>
          <DescriptionListDescription>
            {publicUrl ? (
              <ClipboardCopy
                isReadOnly
                hoverTip={t('Copy')}
                clickTip={t('Copied')}
                variant="inline-compact"
              >
                {publicUrl}
              </ClipboardCopy>
            ) : (
              <span style={{ color: 'var(--pf-v6-global--Color--200)' }}>{t('Not set')}</span>
            )}
          </DescriptionListDescription>
        </DescriptionListGroup>

        {apiProduct.spec.description && (
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Description')}</DescriptionListTerm>
            <DescriptionListDescription>{apiProduct.spec.description}</DescriptionListDescription>
          </DescriptionListGroup>
        )}

        {apiProduct.spec.version && (
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Version')}</DescriptionListTerm>
            <DescriptionListDescription>{apiProduct.spec.version}</DescriptionListDescription>
          </DescriptionListGroup>
        )}

        {apiProduct.spec.publishStatus && (
          <DescriptionListGroup>
            <DescriptionListTerm>
              {t('Publish Status')}
              {canUpdate && !canUpdateLoading && (
                <Button
                  variant="plain"
                  onClick={() => setIsEditingPublishStatus(true)}
                  aria-label={t('Edit publish status')}
                  style={{ marginLeft: '8px', padding: '0 4px' }}
                >
                  <PencilAltIcon />
                </Button>
              )}
            </DescriptionListTerm>
            <DescriptionListDescription>
              <Label
                isCompact
                color={
                  apiProduct.spec.publishStatus === 'Published'
                    ? 'green'
                    : apiProduct.spec.publishStatus === 'Deprecated'
                    ? 'orange'
                    : apiProduct.spec.publishStatus === 'Retired'
                    ? 'red'
                    : 'grey'
                }
              >
                {apiProduct.spec.publishStatus}
              </Label>
            </DescriptionListDescription>
          </DescriptionListGroup>
        )}

        {apiProduct.spec.approvalMode && hasApiKeyAuth && (
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Approval Mode')}</DescriptionListTerm>
            <DescriptionListDescription>{apiProduct.spec.approvalMode}</DescriptionListDescription>
          </DescriptionListGroup>
        )}

        <DescriptionListGroup>
          <DescriptionListTerm>
            {t('Tags')}
            {canUpdate && !canUpdateLoading && (
              <Button
                variant="plain"
                onClick={() => setIsEditingTags(true)}
                aria-label={t('Edit tags')}
                style={{ marginLeft: '8px', padding: '0 4px' }}
              >
                <PencilAltIcon />
              </Button>
            )}
          </DescriptionListTerm>
          <DescriptionListDescription>
            {apiProduct.spec.tags && apiProduct.spec.tags.length > 0 ? (
              <LabelGroup>
                {apiProduct.spec.tags.map((tag) => (
                  <Label key={tag} isCompact color="blue">
                    {tag}
                  </Label>
                ))}
              </LabelGroup>
            ) : (
              <span style={{ color: 'var(--pf-v6-global--Color--200)' }}>{t('No tags')}</span>
            )}
          </DescriptionListDescription>
        </DescriptionListGroup>

        {apiProduct.metadata.creationTimestamp && (
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Created at')}</DescriptionListTerm>
            <DescriptionListDescription>
              <Timestamp timestamp={apiProduct.metadata.creationTimestamp} />
            </DescriptionListDescription>
          </DescriptionListGroup>
        )}

        <DescriptionListGroup>
          <DescriptionListTerm>{t('Authentication Methods')}</DescriptionListTerm>
          <DescriptionListDescription>
            {hasAuthMethods ? (
              <LabelGroup>
                {authMethods.map((method) => (
                  <Label key={method} isCompact color="green">
                    {method}
                  </Label>
                ))}
              </LabelGroup>
            ) : (
              <span style={{ color: 'var(--pf-v6-global--Color--200)' }}>{t('Not set')}</span>
            )}
          </DescriptionListDescription>
        </DescriptionListGroup>

        <DescriptionListGroup>
          <DescriptionListTerm>{t('Plan Tiers')}</DescriptionListTerm>
          <DescriptionListDescription>
            {hasPlans ? (
              <>
                {discoveredPlans.map((plan: PlanSpec, index: number) => (
                  <div
                    key={plan.tier}
                    style={{ marginBottom: index < discoveredPlans.length - 1 ? '8px' : '0' }}
                  >
                    <Label isCompact color="blue">
                      {plan.tier}
                    </Label>
                    {formatLimits(plan.limits) && (
                      <span style={{ marginLeft: '8px' }}>{formatLimits(plan.limits)}</span>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <span style={{ color: 'var(--pf-v6-global--Color--200)' }}>{t('Not set')}</span>
            )}
          </DescriptionListDescription>
        </DescriptionListGroup>
      </DescriptionList>

      {/* Documentation Section */}
      <Divider style={{ margin: '24px 0' }} />
      <Title headingLevel="h2" size="lg" style={{ marginBottom: '8px' }}>
        {t('Documentation')}
      </Title>
      <DescriptionList
        columnModifier={{
          default: '2Col',
        }}
      >
        {renderDocumentationField('openAPISpecURL', t('API Specification'))}
        {renderDocumentationField('docsURL', t('API Documentation'))}
      </DescriptionList>

      {/* Contact Section */}
      <Divider style={{ margin: '24px 0' }} />
      <Title headingLevel="h2" size="lg" style={{ marginBottom: '8px' }}>
        {t('Contact')}
      </Title>
      <DescriptionList
        columnModifier={{
          default: '2Col',
        }}
      >
        {renderContactField('team', t('Contact Team'), apiProduct.spec.contact?.team)}
        {renderContactField(
          'email',
          t('Contact Email'),
          apiProduct.spec.contact?.email,
          apiProduct.spec.contact?.email ? `mailto:${apiProduct.spec.contact.email}` : undefined,
        )}
        {renderContactField('slack', t('Contact Slack'), apiProduct.spec.contact?.slack)}
        {renderContactField(
          'url',
          t('Contact URL'),
          apiProduct.spec.contact?.url,
          apiProduct.spec.contact?.url,
        )}
      </DescriptionList>

      {editingField && (
        <ContactInfoEditModal
          isOpen={true}
          onClose={() => setEditingField(null)}
          resource={apiProduct}
          field={editingField}
        />
      )}

      <TagsEditModal
        isOpen={isEditingTags}
        onClose={() => setIsEditingTags(false)}
        resource={apiProduct}
      />

      <PublishStatusEditModal
        isOpen={isEditingPublishStatus}
        onClose={() => setIsEditingPublishStatus(false)}
        resource={apiProduct}
      />

      {editingDocField && (
        <DocumentationEditModal
          isOpen={true}
          onClose={() => setEditingDocField(null)}
          resource={apiProduct}
          field={editingDocField}
        />
      )}
    </PageSection>
  );
};

export default APIProductOverviewTab;
