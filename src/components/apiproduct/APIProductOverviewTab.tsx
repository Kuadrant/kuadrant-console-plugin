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
  ActionGroup,
  Divider,
  TextInput,
  FormSelect,
  FormSelectOption,
} from '@patternfly/react-core';
import { PencilAltIcon } from '@patternfly/react-icons';
import {
  useK8sWatchResource,
  useActiveNamespace,
  useAccessReview,
  Timestamp,
  k8sUpdate,
} from '@openshift-console/dynamic-plugin-sdk';
import { APIProduct, PlanSpec } from './types';
import { RESOURCES } from '../../utils/resources';
import extractResourceNameFromURL from '../../utils/nameFromPath';
import { getResourceNameFromKind } from '../../utils/getModelFromResource';
import { getModelFromResource } from '../../utils/getModelFromResource';
import NoPermissionsView from '../NoPermissionsView';
import ContactInfoEditModal from './ContactInfoEditModal';
import TagsEditModal from './TagsEditModal';
import PublishStatusEditModal from './PublishStatusEditModal';
import DocumentationEditModal from './DocumentationEditModal';
import { formatLimits } from '../../utils/apiKeyUtils';
import '../kuadrant.css';

type ContactField = 'team' | 'email' | 'slack' | 'url';
type DocumentationField = 'openAPISpecURL' | 'docsURL';

function useInlineEdit<T>(initialValue: T) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState<T>(initialValue);
  const [error, setError] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  const startEdit = (currentValue: T) => {
    setEditValue(currentValue);
    setError('');
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setError('');
  };

  const save = async (saveFn: () => Promise<void>) => {
    setIsSaving(true);
    setError('');
    try {
      await saveFn();
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  return {
    isEditing,
    editValue,
    setEditValue,
    error,
    setError,
    isSaving,
    startEdit,
    cancelEdit,
    save,
  };
}

const APIProductOverviewTab: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();
  const location = useLocation();
  const productName = extractResourceNameFromURL(location.pathname);
  const displayName = useInlineEdit('');
  const version = useInlineEdit('');
  const approvalMode = useInlineEdit<'manual' | 'automatic'>('manual');
  const description = useInlineEdit('');

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

  const updateAPIProduct = async (updatedSpec: Partial<APIProduct['spec']>) => {
    const model = getModelFromResource(apiProduct);
    const updatedResource: APIProduct = {
      ...apiProduct,
      spec: {
        ...apiProduct.spec,
        ...updatedSpec,
      },
    };

    await k8sUpdate({
      model,
      data: updatedResource,
    });
  };

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
            {displayName.isEditing ? (
              <>
                <TextInput
                  value={displayName.editValue}
                  onChange={(_event, value) => displayName.setEditValue(value)}
                  aria-label={t('Display Name')}
                  isDisabled={displayName.isSaving}
                />
                <ActionGroup style={{ marginTop: '8px' }}>
                  <Button
                    variant="primary"
                    onClick={() =>
                      displayName.save(() =>
                        updateAPIProduct({
                          displayName: displayName.editValue.trim() || apiProduct.metadata.name,
                        }),
                      )
                    }
                    isDisabled={displayName.isSaving}
                    isLoading={displayName.isSaving}
                  >
                    {t('Save')}
                  </Button>
                  <Button
                    variant="link"
                    onClick={displayName.cancelEdit}
                    isDisabled={displayName.isSaving}
                  >
                    {t('Cancel')}
                  </Button>
                </ActionGroup>
                {displayName.error && (
                  <Alert variant="danger" isInline title={t('Error updating display name')}>
                    {displayName.error}
                  </Alert>
                )}
              </>
            ) : (
              <>
                {apiProduct.spec.displayName || apiProduct.metadata.name}
                {canUpdate && !canUpdateLoading && (
                  <Button
                    variant="plain"
                    onClick={() =>
                      displayName.startEdit(apiProduct.spec.displayName || apiProduct.metadata.name)
                    }
                    aria-label={t('Edit display name')}
                    style={{ marginLeft: '8px', padding: '0 4px' }}
                  >
                    <PencilAltIcon />
                  </Button>
                )}
              </>
            )}
          </DescriptionListDescription>
        </DescriptionListGroup>

        <DescriptionListGroup>
          <DescriptionListTerm>{t('Description')}</DescriptionListTerm>
          <DescriptionListDescription>
            {description.isEditing ? (
              <>
                <TextInput
                  value={description.editValue}
                  onChange={(_event, value) => description.setEditValue(value)}
                  aria-label={t('Description')}
                  isDisabled={description.isSaving}
                />
                <ActionGroup style={{ marginTop: '8px' }}>
                  <Button
                    variant="primary"
                    onClick={() =>
                      description.save(() =>
                        updateAPIProduct({
                          description: description.editValue.trim() || undefined,
                        }),
                      )
                    }
                    isDisabled={description.isSaving}
                    isLoading={description.isSaving}
                  >
                    {t('Save')}
                  </Button>
                  <Button
                    variant="link"
                    onClick={description.cancelEdit}
                    isDisabled={description.isSaving}
                  >
                    {t('Cancel')}
                  </Button>
                </ActionGroup>
                {description.error && (
                  <Alert variant="danger" isInline title={t('Error updating description')}>
                    {description.error}
                  </Alert>
                )}
              </>
            ) : (
              <>
                <span
                  style={{
                    color: apiProduct.spec.description
                      ? 'inherit'
                      : 'var(--pf-v6-global--Color--200)',
                  }}
                >
                  {apiProduct.spec.description || t('Not set')}
                </span>
                {canUpdate && !canUpdateLoading && (
                  <Button
                    variant="plain"
                    onClick={() => description.startEdit(apiProduct.spec.description || '')}
                    aria-label={t('Edit description')}
                    style={{ marginLeft: '8px', padding: '0 4px' }}
                  >
                    <PencilAltIcon />
                  </Button>
                )}
              </>
            )}
          </DescriptionListDescription>
        </DescriptionListGroup>

        <DescriptionListGroup>
          <DescriptionListTerm>{t('Version')}</DescriptionListTerm>
          <DescriptionListDescription>
            {version.isEditing ? (
              <>
                <TextInput
                  value={version.editValue}
                  onChange={(_event, value) => version.setEditValue(value)}
                  aria-label={t('Version')}
                  isDisabled={version.isSaving}
                />
                <ActionGroup style={{ marginTop: '8px' }}>
                  <Button
                    variant="primary"
                    onClick={() =>
                      version.save(() =>
                        updateAPIProduct({
                          version: version.editValue.trim() || undefined,
                        }),
                      )
                    }
                    isDisabled={version.isSaving}
                    isLoading={version.isSaving}
                  >
                    {t('Save')}
                  </Button>
                  <Button variant="link" onClick={version.cancelEdit} isDisabled={version.isSaving}>
                    {t('Cancel')}
                  </Button>
                </ActionGroup>
                {version.error && (
                  <Alert variant="danger" isInline title={t('Error updating version')}>
                    {version.error}
                  </Alert>
                )}
              </>
            ) : (
              <>
                <span
                  style={{
                    color: apiProduct.spec.version ? 'inherit' : 'var(--pf-v6-global--Color--200)',
                  }}
                >
                  {apiProduct.spec.version || t('Not set')}
                </span>
                {canUpdate && !canUpdateLoading && (
                  <Button
                    variant="plain"
                    onClick={() => version.startEdit(apiProduct.spec.version || '')}
                    aria-label={t('Edit version')}
                    style={{ marginLeft: '8px', padding: '0 4px' }}
                  >
                    <PencilAltIcon />
                  </Button>
                )}
              </>
            )}
          </DescriptionListDescription>
        </DescriptionListGroup>

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
            <DescriptionListDescription>
              {approvalMode.isEditing ? (
                <>
                  <FormSelect
                    value={approvalMode.editValue}
                    onChange={(_event, value) =>
                      approvalMode.setEditValue(value as 'manual' | 'automatic')
                    }
                    aria-label={t('Approval Mode')}
                    isDisabled={approvalMode.isSaving}
                  >
                    <FormSelectOption value="manual" label={t('Manual')} />
                    <FormSelectOption value="automatic" label={t('Automatic')} />
                  </FormSelect>
                  <ActionGroup style={{ marginTop: '8px' }}>
                    <Button
                      variant="primary"
                      onClick={() =>
                        approvalMode.save(() =>
                          updateAPIProduct({ approvalMode: approvalMode.editValue }),
                        )
                      }
                      isDisabled={approvalMode.isSaving}
                      isLoading={approvalMode.isSaving}
                    >
                      {t('Save')}
                    </Button>
                    <Button
                      variant="link"
                      onClick={approvalMode.cancelEdit}
                      isDisabled={approvalMode.isSaving}
                    >
                      {t('Cancel')}
                    </Button>
                  </ActionGroup>
                  {approvalMode.error && (
                    <Alert variant="danger" isInline title={t('Error updating approval mode')}>
                      {approvalMode.error}
                    </Alert>
                  )}
                </>
              ) : (
                <>
                  {apiProduct.spec.approvalMode === 'automatic' ? t('Automatic') : t('Manual')}
                  {canUpdate && !canUpdateLoading && (
                    <Button
                      variant="plain"
                      onClick={() =>
                        approvalMode.startEdit(apiProduct.spec.approvalMode || 'manual')
                      }
                      aria-label={t('Edit approval mode')}
                      style={{ marginLeft: '8px', padding: '0 4px' }}
                    >
                      <PencilAltIcon />
                    </Button>
                  )}
                </>
              )}
            </DescriptionListDescription>
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
