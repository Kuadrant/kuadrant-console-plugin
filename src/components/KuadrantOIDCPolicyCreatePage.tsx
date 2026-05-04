import * as React from 'react';
import Helmet from 'react-helmet';
import {
  PageSection,
  Title,
  TextInput,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Form,
  Radio,
  Button,
  ActionGroup,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import './kuadrant.css';
import {
  ResourceYAMLEditor,
  getGroupVersionKindForResource,
  useK8sModel,
  useK8sWatchResource,
  K8sResourceCommon,
  useActiveNamespace,
} from '@openshift-console/dynamic-plugin-sdk';
import { useNavigate, useLocation } from 'react-router-dom-v5-compat';
import * as yaml from 'js-yaml';
import GatewaySelect from './gateway/GatewaySelect';
import { Gateway } from './gateway/types';
import KuadrantCreateUpdate from './KuadrantCreateUpdate';
import { handleCancel } from '../utils/cancel';
import { resourceGVKMapping } from '../utils/resources';

// Extends K8sResourceCommon to include OIDCPolicy-specific spec fields
// used when loading an existing resource for editing
interface OIDCPolicyEdit extends K8sResourceCommon {
  spec?: {
    targetRef?: {
      group?: string;
      kind?: string;
      name?: string;
    };
    clientID?: string;
    issuerURL?: string;
  };
}

const KuadrantOIDCPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const navigate = useNavigate();
  const location = useLocation();

  // Parse URL path to detect edit mode (e.g. /k8s/ns/default/.../my-policy/edit)
  const pathSplit = location.pathname.split('/');
  const nameEdit = pathSplit[6];
  const namespaceEdit = pathSplit[3];

  // ── Form state ────────────────────────────────────────────────────────────
  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');
  const [policyName, setPolicyName] = React.useState('');
  const [selectedNamespace] = useActiveNamespace();
  const [selectedGateway, setSelectedGateway] = React.useState<Gateway>({
    name: '',
    namespace: '',
  });
  const [clientID, setClientID] = React.useState('');
  const [issuerURL, setIssuerURL] = React.useState('');

  // Preserved for edit mode — required to patch (not replace) the resource
  const [creationTimestamp, setCreationTimestamp] = React.useState('');
  const [resourceVersion, setResourceVersion] = React.useState('');

  // In edit mode the policy name field is locked (matches DNS/TLS behaviour)
  const [formDisabled, setFormDisabled] = React.useState(false);
  const [create, setCreate] = React.useState(true);

  // ── Build K8s resource object from current form state ─────────────────────
  const createOIDCPolicy = () => ({
    apiVersion:
      resourceGVKMapping['OIDCPolicy'].group + '/' + resourceGVKMapping['OIDCPolicy'].version,
    kind: resourceGVKMapping['OIDCPolicy'].kind,
    metadata: {
      name: policyName,
      namespace: selectedNamespace,
      ...(creationTimestamp ? { creationTimestamp } : {}),
      ...(resourceVersion ? { resourceVersion } : {}),
    },
    spec: {
      targetRef: {
        group: 'gateway.networking.k8s.io',
        kind: 'Gateway',
        name: selectedGateway.name,
        ...(selectedGateway.namespace && selectedGateway.namespace !== selectedNamespace
          ? { namespace: selectedGateway.namespace }
          : {}),
      },
      clientID,
      issuerURL,
    },
  });

  // ── GVK + model (needed by KuadrantCreateUpdate) ───────────────────────────
  const oidcPolicyGVK = getGroupVersionKindForResource({
    apiVersion: `${resourceGVKMapping['OIDCPolicy'].group}/${resourceGVKMapping['OIDCPolicy'].version}`,
    kind: resourceGVKMapping['OIDCPolicy'].kind,
  });
  const [oidcPolicyModel] = useK8sModel({
    group: oidcPolicyGVK.group,
    version: oidcPolicyGVK.version,
    kind: oidcPolicyGVK.kind,
  });

  // ── Edit mode: watch existing resource ────────────────────────────────────
  // Pass null descriptor when not editing — SDK handles this cleanly
  const [oidcData, oidcLoaded, oidcError] = useK8sWatchResource(
    nameEdit
      ? {
          groupVersionKind: oidcPolicyGVK,
          isList: false,
          name: nameEdit,
          namespace: namespaceEdit,
        }
      : null,
  );

  // Populate form fields when existing resource data is loaded
  React.useEffect(() => {
    if (oidcLoaded && !oidcError) {
      if (!Array.isArray(oidcData)) {
        const existing = oidcData as OIDCPolicyEdit;
        setCreationTimestamp(existing.metadata.creationTimestamp || '');
        setResourceVersion(existing.metadata.resourceVersion || '');
        setFormDisabled(true);
        setCreate(false);
        setPolicyName(existing.metadata?.name || '');
        setSelectedGateway({
          name: existing.spec?.targetRef?.name || '',
          namespace: existing.metadata?.namespace || '',
        });
        setClientID(existing.spec?.clientID || '');
        setIssuerURL(existing.spec?.issuerURL || '');
        console.log('Initializing OIDC form with existing resource for update');
      }
    } else if (oidcError) {
      console.error('Failed to fetch OIDCPolicy resource:', oidcError);
    }
  }, [oidcData, oidcLoaded, oidcError]);

  // ── YAML ↔ Form bidirectional sync ────────────────────────────────────────
  const [yamlInput, setYamlInput] = React.useState(createOIDCPolicy);

  // Keep YAML view in sync whenever any form field changes
  React.useEffect(() => {
    setYamlInput(createOIDCPolicy());
  }, [policyName, selectedNamespace, selectedGateway, clientID, issuerURL]);

  // Parse YAML edits back into form state so toggling back to Form View
  // preserves whatever the user typed in YAML view
  const handleYAMLChange = (rawYaml: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed = yaml.load(rawYaml) as Record<string, any>;
      setPolicyName(parsed.metadata?.name || '');
      setSelectedGateway({
        name: parsed.spec?.targetRef?.name || '',
        namespace: parsed.metadata?.namespace || '',
      });
      setClientID(parsed.spec?.clientID || '');
      setIssuerURL(parsed.spec?.issuerURL || '');
    } catch (e) {
      console.error(t('Error parsing YAML:'), e);
    }
  };

  // ── Validation: gates the Save button in KuadrantCreateUpdate ─────────────
  const isFormValid: boolean = !!policyName && !!selectedGateway.name && !!clientID && !!issuerURL;

  // ── Cancel handler ────────────────────────────────────────────────────────
  const handleCancelResource = () => {
    handleCancel(selectedNamespace, createOIDCPolicy(), navigate);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Helmet>
        <title data-test="example-page-title">
          {create ? t('Create OIDC Policy') : t('Edit OIDC Policy')}
        </title>
      </Helmet>

      {/* ── Page header + Form / YAML toggle ── */}
      <PageSection hasBodyWrapper={false} className="pf-m-no-padding">
        <div className="co-m-nav-title">
          <Title headingLevel="h1">
            {create ? t('Create OIDC Policy') : t('Edit OIDC Policy')}
          </Title>
          <p className="help-block">
            {t(
              'OIDCPolicy configures OpenID Connect authentication for a Gateway, ' +
                'delegating identity verification to an external OIDC provider.',
            )}
          </p>
        </div>

        {/* Form / YAML radio toggle — identical to DNS and TLS pages */}
        <FormGroup
          className="kuadrant-editor-toggle"
          role="radiogroup"
          isInline
          fieldId="create-type-radio-group"
          label={t('Configure via')}
        >
          <Radio
            name="create-type-radio"
            label={t('Form View')}
            id="create-type-radio-form"
            isChecked={createView === 'form'}
            onChange={() => setCreateView('form')}
          />
          <Radio
            name="create-type-radio"
            label={t('YAML View')}
            id="create-type-radio-yaml"
            isChecked={createView === 'yaml'}
            onChange={() => setCreateView('yaml')}
          />
        </FormGroup>
      </PageSection>

      {/* ── Conditional render: Form or YAML ── */}
      {createView === 'form' ? (
        <PageSection hasBodyWrapper={false}>
          <Form className="co-m-pane__form">
            {/* Policy Name */}
            <FormGroup label={t('Policy name')} isRequired fieldId="oidc-policy-name">
              <TextInput
                isRequired
                type="text"
                id="oidc-policy-name"
                name="oidc-policy-name"
                value={policyName}
                onChange={(_event, value) => setPolicyName(value)}
                isDisabled={formDisabled}
                placeholder={t('Policy name')}
                validated={policyName ? 'default' : 'error'}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>{t('Unique name of the OIDC Policy')}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>

            {/* Target Gateway — reuses shared GatewaySelect component */}
            <GatewaySelect selectedGateway={selectedGateway} onChange={setSelectedGateway} />

            {/* Client ID */}
            <FormGroup label={t('Client ID')} isRequired fieldId="oidc-client-id">
              <TextInput
                isRequired
                type="text"
                id="oidc-client-id"
                name="oidc-client-id"
                value={clientID}
                onChange={(_event, value) => setClientID(value)}
                placeholder={t('e.g. my-app-client')}
                validated={clientID ? 'default' : 'error'}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {t(
                      'The client identifier registered with your OIDC provider ' +
                        '(e.g. Keycloak, Auth0, Okta)',
                    )}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>

            {/* Issuer URL */}
            <FormGroup label={t('Issuer URL')} isRequired fieldId="oidc-issuer-url">
              <TextInput
                isRequired
                type="url"
                id="oidc-issuer-url"
                name="oidc-issuer-url"
                value={issuerURL}
                onChange={(_event, value) => setIssuerURL(value)}
                placeholder={t('https://your-issuer.example.com/realms/myrealm')}
                validated={issuerURL ? 'default' : 'error'}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {t(
                      'The base URL of the OIDC provider. The discovery document will be ' +
                        'fetched from {{issuerURL}}/.well-known/openid-configuration',
                      { issuerURL: issuerURL || 'https://your-issuer.example.com' },
                    )}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>

            {/* Save / Cancel */}
            <ActionGroup className="pf-u-mt-0">
              <KuadrantCreateUpdate
                model={oidcPolicyModel}
                resource={createOIDCPolicy()}
                policyType="oidc"
                navigate={navigate}
                validation={isFormValid}
              />
              <Button variant="link" onClick={handleCancelResource}>
                {t('Cancel')}
              </Button>
            </ActionGroup>
          </Form>
        </PageSection>
      ) : (
        // YAML view — wrapped in Suspense matching DNS/TLS pattern
        <React.Suspense fallback={<div>{t('Loading...')}</div>}>
          <ResourceYAMLEditor
            initialResource={yamlInput}
            create={create}
            onChange={handleYAMLChange}
          />
        </React.Suspense>
      )}
    </>
  );
};

export default KuadrantOIDCPolicyCreatePage;
