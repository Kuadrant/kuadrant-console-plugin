import * as React from 'react';
import {
  Card,
  CardBody,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  TextInput,
  TextArea,
  Radio,
  Button,
  ActionGroup,
  Grid,
  GridItem,
  Title,
  Tooltip,
} from '@patternfly/react-core';
import { HelpIcon } from '@patternfly/react-icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom-v5-compat';
import { RESOURCES } from '../../utils/resources';
import { getModelFromResource } from '../../utils/getModelFromResource';
import { APIProduct } from './types';
import HTTPRouteSelect from '../httproute/HTTPRouteSelect';
import AssociatedPoliciesList from '../httproute/AssociatedPoliciesList';
import TagsMultiSelect from './TagsMultiSelect';
import LifecycleStatusSelector from './LifecycleStatusSelector';
import KuadrantCreateUpdate from '../KuadrantCreateUpdate';

interface APIProductFormProps {
  obj?: APIProduct;
  namespace: string;
  formData: APIProductFormData;
  onFormDataChange: (data: APIProductFormData) => void;
  isResourceNameManual: boolean;
  setIsResourceNameManual: (value: boolean) => void;
  isEditMode?: boolean;
}

export interface APIProductFormData {
  displayName: string;
  resourceName: string;
  version: string;
  description: string;
  tags: string[];
  publishStatus: string;
  approvalMode: string;
  openAPISpecURL: string;
  docsURL: string;
  httpRoute: {
    name: string;
    namespace: string;
  } | null;
}

const APIProductForm: React.FC<APIProductFormProps> = ({
  obj,
  namespace,
  formData,
  onFormDataChange,
  isResourceNameManual,
  setIsResourceNameManual,
  isEditMode: isEditModeProp,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const navigate = useNavigate();
  const isEditMode = isEditModeProp ?? !!obj;

  // Store the suffix once and reuse it
  const suffixRef = React.useRef<number | null>(null);

  // Auto-generate resource name from display name with unique suffix
  React.useEffect(() => {
    if (!isResourceNameManual && !isEditMode && formData.displayName) {
      // Generate suffix only once
      if (suffixRef.current === null) {
        suffixRef.current = Math.floor(1000 + Math.random() * 9000);
      }

      const baseName = formData.displayName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      const generatedName = baseName ? `${baseName}-${suffixRef.current}` : '';

      // Only update if the generated name is different to prevent infinite loops
      if (generatedName !== formData.resourceName) {
        onFormDataChange({ ...formData, resourceName: generatedName });
      }
    }
  }, [formData, isResourceNameManual, isEditMode, onFormDataChange]);

  // Construct the APIProduct resource
  const constructResource = (): APIProduct => {
    const apiVersion = `${RESOURCES.APIProduct.gvk.group}/${RESOURCES.APIProduct.gvk.version}`;
    const resource: any = {
      apiVersion,
      kind: RESOURCES.APIProduct.gvk.kind,
      metadata: {
        name: formData.resourceName,
        namespace,
      },
      spec: {
        displayName: formData.displayName,
        description: formData.description,
        tags: formData.tags,
        publishStatus: formData.publishStatus as 'Draft' | 'Published' | 'Deprecated' | 'Retired',
        approvalMode: formData.approvalMode as 'automatic' | 'manual',
        targetRef: formData.httpRoute
          ? {
              group: 'gateway.networking.k8s.io',
              kind: 'HTTPRoute',
              name: formData.httpRoute.name,
              namespace: formData.httpRoute.namespace,
            }
          : {
              group: '',
              kind: '',
              name: '',
            },
      },
    };

    // Add version if provided
    if (formData.version) {
      resource.spec.version = formData.version;
    }

    // Add documentation object if any URL is provided
    if (formData.openAPISpecURL || formData.docsURL) {
      resource.spec.documentation = {};
      if (formData.openAPISpecURL) {
        resource.spec.documentation.openAPISpecURL = formData.openAPISpecURL;
      }
      if (formData.docsURL) {
        resource.spec.documentation.docsURL = formData.docsURL;
      }
    }

    // Add metadata fields if editing
    if (obj?.metadata?.creationTimestamp) {
      resource.metadata.creationTimestamp = obj.metadata.creationTimestamp;
    }
    if (obj?.metadata?.resourceVersion) {
      resource.metadata.resourceVersion = obj.metadata.resourceVersion;
    }

    return resource as APIProduct;
  };

  // Form validation
  const isFormValid = (): boolean => {
    // RFC1123 DNS subdomain validation
    const rfc1123Regex = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/;
    const isValidResourceName =
      formData.resourceName.trim() !== '' &&
      formData.resourceName.length <= 253 &&
      rfc1123Regex.test(formData.resourceName);

    return formData.displayName.trim() !== '' && isValidResourceName && formData.httpRoute !== null;
  };

  const handleDisplayNameChange = (displayName: string) => {
    onFormDataChange({ ...formData, displayName });
  };

  const handleResourceNameChange = (resourceName: string) => {
    setIsResourceNameManual(true);
    onFormDataChange({ ...formData, resourceName });
  };

  const handleHTTPRouteChange = (httpRoute: { name: string; namespace: string } | null) => {
    onFormDataChange({ ...formData, httpRoute });
  };

  const handleTagsChange = (tags: string[]) => {
    onFormDataChange({ ...formData, tags });
  };

  const handlePublishStatusChange = (
    publishStatus: 'Draft' | 'Published' | 'Deprecated' | 'Retired',
  ) => {
    onFormDataChange({ ...formData, publishStatus });
  };

  const handleApprovalModeChange = (approvalMode: 'automatic' | 'manual') => {
    onFormDataChange({ ...formData, approvalMode });
  };

  return (
    <Card style={{ maxWidth: '1100px' }}>
      <CardBody>
        <Form>
          {/* API product info section */}
          <Title
            headingLevel="h2"
            size="md"
            style={{
              marginBottom: 'var(--pf-v6-global--spacer--md)',
              marginTop: 'var(--pf-v6-global--spacer--md)',
            }}
          >
            {t('API product info')}
          </Title>
          <div>
            <Grid hasGutter>
              <GridItem span={6}>
                <FormGroup label={t('API product name')} isRequired fieldId="display-name">
                  <TextInput
                    isRequired
                    type="text"
                    id="display-name"
                    name="display-name"
                    value={formData.displayName}
                    onChange={(_event, value) => handleDisplayNameChange(value)}
                    placeholder=""
                    style={{ maxWidth: '400px' }}
                  />
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>
                        {t('Display name for your API product (shown to users)')}
                        <Tooltip
                          content={t('This is the human-readable name shown in the API catalog')}
                        >
                          <button
                            type="button"
                            aria-label="More info"
                            onClick={(e) => e.preventDefault()}
                            style={{
                              marginLeft: '0.5rem',
                              border: 'none',
                              background: 'none',
                              padding: 0,
                              cursor: 'help',
                              color: 'var(--pf-v6-global--Color--200)',
                            }}
                          >
                            <HelpIcon />
                          </button>
                        </Tooltip>
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
              </GridItem>

              <GridItem span={6}>
                <FormGroup label={t('Kubernetes resource name')} isRequired fieldId="resource-name">
                  <TextInput
                    isRequired
                    type="text"
                    id="resource-name"
                    name="resource-name"
                    value={formData.resourceName}
                    onChange={(_event, value) => handleResourceNameChange(value)}
                    isDisabled={isEditMode}
                    placeholder=""
                    style={{ maxWidth: '400px' }}
                  />
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>
                        {t(
                          'Auto-generated from product name. Only lowercase, numbers, and hyphens allowed.',
                        )}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
              </GridItem>

              <GridItem span={6}>
                <FormGroup label={t('Version')} fieldId="version">
                  <TextInput
                    type="text"
                    id="version"
                    name="version"
                    value={formData.version}
                    onChange={(_event, value) => onFormDataChange({ ...formData, version: value })}
                    placeholder="v1"
                    style={{ maxWidth: '400px' }}
                  />
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>{t('Give a version to your API product')}</HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
              </GridItem>

              <GridItem span={6}>
                <FormGroup label={t('Tag')} fieldId="apiproduct-tags">
                  <TagsMultiSelect selectedTags={formData.tags} onChange={handleTagsChange} />
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>{t('Add a tag to your API product')}</HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
              </GridItem>

              <GridItem span={12}>
                <FormGroup label={t('Description')} fieldId="description">
                  <TextArea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={(_event, value) =>
                      onFormDataChange({ ...formData, description: value })
                    }
                    placeholder=""
                    rows={3}
                    style={{ maxWidth: '800px' }}
                  />
                </FormGroup>
              </GridItem>
            </Grid>
          </div>

          {/* Add API and Associate route section */}
          <Title
            headingLevel="h2"
            size="md"
            style={{
              marginTop: 'var(--pf-v6-global--spacer--xl)',
              marginBottom: 'var(--pf-v6-global--spacer--md)',
            }}
          >
            {t('Add API and Associate route')}
          </Title>
          <div>
            <Grid hasGutter>
              <GridItem span={12}>
                <FormGroup label={t('OpenAPI Spec URL')} fieldId="openapi-spec-url">
                  <TextInput
                    type="text"
                    id="openapi-spec-url"
                    name="openapi-spec-url"
                    value={formData.openAPISpecURL}
                    onChange={(_event, value) =>
                      onFormDataChange({ ...formData, openAPISpecURL: value })
                    }
                    placeholder={t('Enter the full path to your API spec file')}
                    style={{ maxWidth: '800px' }}
                  />
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>
                        {t('Enter the full path to your API spec file')}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
              </GridItem>

              <GridItem span={12}>
                <FormGroup label={t('Documentation URL')} fieldId="api-docs-url">
                  <TextInput
                    type="text"
                    id="api-docs-url"
                    name="api-docs-url"
                    value={formData.docsURL}
                    onChange={(_event, value) => onFormDataChange({ ...formData, docsURL: value })}
                    placeholder={t('Link to external documentation for this API')}
                    style={{ maxWidth: '800px' }}
                  />
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>
                        {t('Link to external documentation for this API')}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
              </GridItem>

              <GridItem span={12}>
                <FormGroup label={t('HTTPRoute')} isRequired fieldId="apiproduct-httproute">
                  <HTTPRouteSelect
                    selectedRoute={formData.httpRoute || { name: '', namespace }}
                    onChange={handleHTTPRouteChange}
                  />
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>
                        {t(
                          'Select an HTTPRoute. APIProduct will be created in the same namespace.',
                        )}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
              </GridItem>
            </Grid>

            {formData.httpRoute && (
              <FormGroup label={t('HTTPRoute policies')} fieldId="httproute-policies">
                <AssociatedPoliciesList
                  routeName={formData.httpRoute.name}
                  routeNamespace={formData.httpRoute.namespace}
                />
              </FormGroup>
            )}
          </div>

          {/* Lifecycle and Visibility section */}
          <Title
            headingLevel="h2"
            size="md"
            style={{
              marginTop: 'var(--pf-v6-global--spacer--xl)',
              marginBottom: 'var(--pf-v6-global--spacer--md)',
            }}
          >
            {t('Lifecycle and Visibility')}
          </Title>
          <div>
            <Grid hasGutter>
              <GridItem span={12}>
                <FormGroup
                  label={t('Publish Status')}
                  isRequired
                  fieldId="apiproduct-publishstatus"
                >
                  <LifecycleStatusSelector
                    status={
                      formData.publishStatus as 'Draft' | 'Published' | 'Deprecated' | 'Retired'
                    }
                    onChange={handlePublishStatusChange}
                  />
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>
                        {t('Controls catalog visibility (Draft = hidden from consumers)')}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
              </GridItem>
            </Grid>
          </div>

          {/* API key approval section */}
          <Title
            headingLevel="h2"
            size="md"
            style={{
              marginTop: 'var(--pf-v6-global--spacer--xl)',
              marginBottom: 'var(--pf-v6-global--spacer--md)',
            }}
          >
            {t('API key approval')}
          </Title>
          <div>
            <FormGroup fieldId="approval-mode">
              <Radio
                isChecked={formData.approvalMode === 'manual'}
                name="approval-mode"
                onChange={() => handleApprovalModeChange('manual')}
                label={t('Need manual approval')}
                id="approval-manual"
                description={t('Requires approval for requesting the API.')}
              />
              <Radio
                isChecked={formData.approvalMode === 'automatic'}
                name="approval-mode"
                onChange={() => handleApprovalModeChange('automatic')}
                label={t('Automatic approval')}
                id="approval-automatic"
                description={t('Keys are created without need to be approved.')}
              />
            </FormGroup>
          </div>

          <ActionGroup style={{ marginTop: 'var(--pf-v6-global--spacer--lg)' }}>
            <KuadrantCreateUpdate
              model={getModelFromResource(constructResource())}
              resource={constructResource()}
              policyType="apiproduct"
              navigate={navigate}
              validation={isFormValid()}
              update={isEditMode}
            />
            <Button variant="link" onClick={() => navigate(`/kuadrant/ns/${namespace}`)}>
              {t('Cancel')}
            </Button>
          </ActionGroup>
        </Form>
      </CardBody>
    </Card>
  );
};

export default APIProductForm;
