import * as React from 'react';
import Helmet from 'react-helmet';
import {
  PageSection,
  Title,
  TextInput,
  TextArea,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Form,
  Radio,
  Button,
  ActionGroup,
  Tabs,
  Tab,
  TabTitleText,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import './kuadrant.css';
import './css/gateway-api-plugin.css';
import {
  ResourceYAMLEditor,
  getGroupVersionKindForResource,
  useK8sModel,
  useK8sWatchResource,
  K8sResourceCommon,
  useActiveNamespace,
} from '@openshift-console/dynamic-plugin-sdk';
import { useNavigate, useLocation } from 'react-router';
import HTTPRouteSelect from './httproute/HTTPRouteSelect';
import * as yaml from 'js-yaml';
import KuadrantCreateUpdate from './KuadrantCreateUpdate';
import { handleCancel } from '../utils/cancel';
import { resourceGVKMapping } from '../utils/resources';

type AuthType = 'apiKey' | 'anonymous' | 'jwt';

interface AuthRule {
  name: string;
  type: AuthType;
  headerName?: string;
  issuerUrl?: string;
}

interface AuthPolicyEdit extends K8sResourceCommon {
  spec?: {
    targetRef?: {
      group?: string;
      kind?: string;
      name?: string;
    };
    rules?: {
      authentication?: Record<string, unknown>;
      response?: {
        unauthorized?: {
          body?: { value?: string };
          headers?: { 'content-type'?: { value?: string } };
        };
      };
    };
  };
}

const KuadrantAuthPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');
  const [policyName, setPolicyName] = React.useState('');
  const [selectedNamespace] = useActiveNamespace();
  const [selectedRoute, setSelectedRoute] = React.useState({ name: '', namespace: '' });
  const [authRules, setAuthRules] = React.useState<AuthRule[]>([
    { name: '', type: 'apiKey', headerName: 'X-API-Key' },
  ]);
  const [unauthorizedBody, setUnauthorizedBody] = React.useState('');
  const [contentType, setContentType] = React.useState('application/json');
  const [creationTimestamp, setCreationTimestamp] = React.useState('');
  const [resourceVersion, setResourceVersion] = React.useState('');
  const [formDisabled, setFormDisabled] = React.useState(false);
  const [create, setCreate] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<number>(0);

  function createAuthPolicy() {
    const authentication: Record<string, unknown> = {};
    authRules.forEach((rule) => {
      if (rule.name === '') return;
      if (rule.type === 'anonymous') {
        authentication[rule.name] = { anonymous: {} };
      } else if (rule.type === 'apiKey') {
        authentication[rule.name] = {
          apiKey: {
            selector: {
              matchLabels: { 'authorino.kuadrant.io/managed-by': 'authorino' },
            },
            allNamespaces: true,
          },
          credentials: {
            customHeader: { name: rule.headerName || 'X-API-Key' },
          },
        };
      } else if (rule.type === 'jwt') {
        authentication[rule.name] = {
          jwt: { issuerUrl: rule.issuerUrl || '' },
        };
      }
    });

    return {
      apiVersion:
        resourceGVKMapping['AuthPolicy'].group + '/' + resourceGVKMapping['AuthPolicy'].version,
      kind: resourceGVKMapping['AuthPolicy'].kind,
      metadata: {
        name: policyName,
        namespace: selectedNamespace,
        ...(creationTimestamp ? { creationTimestamp } : {}),
        ...(resourceVersion ? { resourceVersion } : {}),
      },
      spec: {
        targetRef: {
          group: 'gateway.networking.k8s.io',
          kind: 'HTTPRoute',
          name: selectedRoute.name,
        },
        rules: {
          ...(Object.keys(authentication).length > 0 ? { authentication } : {}),
          ...(unauthorizedBody || contentType
            ? {
                response: {
                  unauthorized: {
                    ...(unauthorizedBody ? { body: { value: unauthorizedBody } } : {}),
                    ...(contentType ? { headers: { 'content-type': { value: contentType } } } : {}),
                  },
                },
              }
            : {}),
        },
      },
    };
  }

  const [yamlInput, setYamlInput] = React.useState(createAuthPolicy);
  const authPolicy = createAuthPolicy();
  const authPolicyGVK = getGroupVersionKindForResource({
    apiVersion: `${resourceGVKMapping['AuthPolicy'].group}/${resourceGVKMapping['AuthPolicy'].version}`,
    kind: resourceGVKMapping['AuthPolicy'].kind,
  });
  const [authPolicyModel] = useK8sModel({
    group: authPolicyGVK.group,
    version: authPolicyGVK.version,
    kind: authPolicyGVK.kind,
  });

  const navigate = useNavigate();
  const location = useLocation();
  const pathSplit = location.pathname.split('/');
  const nameEdit = pathSplit[6];
  const namespaceEdit = pathSplit[3];

  const authResource = nameEdit
    ? {
        groupVersionKind: authPolicyGVK,
        isList: false,
        name: nameEdit,
        namespace: namespaceEdit,
      }
    : null;

  const [authData, authLoaded, authError] = useK8sWatchResource(authResource);
  const hasInitializedFromResource = React.useRef(false);

  React.useEffect(() => {
    if (authLoaded && !authError && authData) {
      if (!Array.isArray(authData)) {
        const authPolicyUpdate = authData as AuthPolicyEdit;
        setCreationTimestamp(authPolicyUpdate.metadata?.creationTimestamp || '');
        setResourceVersion(authPolicyUpdate.metadata?.resourceVersion || '');
        if (!hasInitializedFromResource.current) {
          setFormDisabled(true);
          setCreate(false);
          setPolicyName(authPolicyUpdate.metadata?.name || '');
          setSelectedRoute({
            name: authPolicyUpdate.spec?.targetRef?.name || '',
            namespace: authPolicyUpdate.metadata?.namespace || '',
          });
          const rules = authPolicyUpdate.spec?.rules?.authentication || {};
          const reconstructed: AuthRule[] = Object.entries(rules).map(([name, value]) => {
            const rule = value as {
              anonymous?: unknown;
              jwt?: { issuerUrl?: string };
              apiKey?: unknown;
              credentials?: { customHeader?: { name?: string } };
            };
            if (rule.anonymous !== undefined) return { name, type: 'anonymous' };
            if (rule.jwt) return { name, type: 'jwt', issuerUrl: rule.jwt.issuerUrl || '' };
            return {
              name,
              type: 'apiKey',
              headerName: rule.credentials?.customHeader?.name || '',
            };
          });
          setAuthRules(
            reconstructed.length > 0
              ? reconstructed
              : [{ name: '', type: 'apiKey', headerName: 'X-API-Key' }],
          );
          setUnauthorizedBody(
            authPolicyUpdate.spec?.rules?.response?.unauthorized?.body?.value || '',
          );
          setContentType(
            authPolicyUpdate.spec?.rules?.response?.unauthorized?.headers?.['content-type']
              ?.value || '',
          );
          hasInitializedFromResource.current = true;
        }
      }
    } else if (authError) {
      console.error('Failed to fetch the resource:', authError);
    }
  }, [authData, authLoaded, authError]);

  const handleYAMLChange = (yamlInputValue: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsedYaml = yaml.load(yamlInputValue) as Record<string, any>;
      setPolicyName(parsedYaml.metadata?.name || '');
      setSelectedRoute({
        name: parsedYaml.spec?.targetRef?.name || '',
        namespace: parsedYaml.metadata?.namespace || '',
      });
      const rules = parsedYaml.spec?.rules?.authentication || {};
      const reconstructed: AuthRule[] = Object.entries(rules).map(([name, value]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rule = value as any;
        if (rule.anonymous !== undefined) return { name, type: 'anonymous' };
        if (rule.jwt) return { name, type: 'jwt', issuerUrl: rule.jwt.issuerUrl || '' };
        return {
          name,
          type: 'apiKey',
          headerName: rule.credentials?.customHeader?.name || '',
        };
      });
      setAuthRules(
        reconstructed.length > 0
          ? reconstructed
          : [{ name: '', type: 'apiKey', headerName: 'X-API-Key' }],
      );
      setUnauthorizedBody(parsedYaml.spec?.rules?.response?.unauthorized?.body?.value || '');
      setContentType(
        parsedYaml.spec?.rules?.response?.unauthorized?.headers?.['content-type']?.value || '',
      );
    } catch (e) {
      console.error(t('Error parsing YAML:'), e);
    }
  };

  React.useEffect(() => {
    setYamlInput(authPolicy);
  }, [
    policyName,
    selectedNamespace,
    selectedRoute,
    authRules,
    unauthorizedBody,
    contentType,
    creationTimestamp,
    resourceVersion,
  ]);

  const addAuthRule = () =>
    setAuthRules([...authRules, { name: '', type: 'apiKey', headerName: 'X-API-Key' }]);

  const removeAuthRule = (i: number) => {
    if (authRules.length > 1) setAuthRules(authRules.filter((_, idx) => idx !== i));
  };

  const updateAuthRule = (i: number, field: keyof AuthRule, value: string) => {
    const updated = [...authRules];
    updated[i] = { ...updated[i], [field]: value };
    setAuthRules(updated);
  };

  const isFormValid = !!(
    policyName &&
    selectedRoute.name &&
    authRules.some((rule) => rule.name !== '')
  );

  const handleCancelResource = () => {
    handleCancel(navigate);
  };

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">
          {create ? t('Create AuthPolicy') : t('Edit AuthPolicy')}
        </title>
      </Helmet>
      <PageSection hasBodyWrapper={false}>
        <div className="co-m-nav-title">
          <Title headingLevel="h1">{create ? t('Create AuthPolicy') : t('Edit AuthPolicy')}</Title>
        </div>
        <FormGroup role="radiogroup" isInline fieldId="create-type-radio-group">
          <Radio
            name="create-type-radio"
            label={t('Form')}
            id="create-type-radio-form"
            isChecked={createView === 'form'}
            onChange={() => setCreateView('form')}
          />
          <Radio
            name="create-type-radio"
            label={t('YAML')}
            id="create-type-radio-yaml"
            isChecked={createView === 'yaml'}
            onChange={() => setCreateView('yaml')}
          />
        </FormGroup>
        {createView === 'form' ? (
          <Tabs activeKey={activeTab} onSelect={(_event, key) => setActiveTab(key as number)}>
            <Tab eventKey={0} title={<TabTitleText>{t('Basic')}</TabTitleText>}>
              <PageSection hasBodyWrapper={false}>
                <Form className="co-m-pane__form">
                  <FormGroup label={t('Policy name')} isRequired fieldId="policy-name">
                    <TextInput
                      isRequired
                      type="text"
                      id="policy-name"
                      name="policy-name"
                      value={policyName}
                      onChange={(_event, value) => setPolicyName(value)}
                      isDisabled={formDisabled}
                      placeholder={t('Policy name')}
                    />
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem>{t('Unique name of the AuthPolicy')}</HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  </FormGroup>
                  <HTTPRouteSelect
                    selectedRoute={selectedRoute}
                    onChange={setSelectedRoute}
                    namespace={selectedNamespace}
                    isDisabled={formDisabled}
                  />
                </Form>
              </PageSection>
            </Tab>
            <Tab eventKey={1} title={<TabTitleText>{t('Authentication')}</TabTitleText>}>
              <PageSection hasBodyWrapper={false}>
                <FormGroup label={t('Authentication Rules')} fieldId="authentication-rules">
                  {authRules.map((rule, i) => (
                    <div key={i} className="pf-u-mb-md">
                      <Title headingLevel="h3" size="md">
                        {t('Authentication Rules')} {i + 1}
                      </Title>
                      <FormGroup label={t('Rule Name')} isRequired fieldId={`auth-rule-name-${i}`}>
                        <TextInput
                          isRequired
                          id={`auth-rule-name-${i}`}
                          value={rule.name}
                          onChange={(_event, value) => updateAuthRule(i, 'name', value)}
                        />
                      </FormGroup>
                      <FormGroup
                        label={t('Auth Type')}
                        role="radiogroup"
                        isInline
                        fieldId={`auth-type-${i}`}
                      >
                        <Radio
                          name={`auth-type-${i}`}
                          label={t('API Key')}
                          id={`auth-type-api-key-${i}`}
                          isChecked={rule.type === 'apiKey'}
                          onChange={() => updateAuthRule(i, 'type', 'apiKey')}
                        />
                        <Radio
                          name={`auth-type-${i}`}
                          label={t('Anonymous')}
                          id={`auth-type-anonymous-${i}`}
                          isChecked={rule.type === 'anonymous'}
                          onChange={() => updateAuthRule(i, 'type', 'anonymous')}
                        />
                        <Radio
                          name={`auth-type-${i}`}
                          label={t('JWT')}
                          id={`auth-type-jwt-${i}`}
                          isChecked={rule.type === 'jwt'}
                          onChange={() => updateAuthRule(i, 'type', 'jwt')}
                        />
                      </FormGroup>
                      {rule.type === 'apiKey' && (
                        <FormGroup
                          label={t('Custom Header Name')}
                          fieldId={`auth-header-name-${i}`}
                        >
                          <TextInput
                            id={`auth-header-name-${i}`}
                            value={rule.headerName || ''}
                            onChange={(_event, value) => updateAuthRule(i, 'headerName', value)}
                            placeholder={t('X-API-Key')}
                          />
                          <FormHelperText>
                            <HelperText>
                              <HelperTextItem>
                                {t('HTTP header name for API key credential (default: X-API-Key)')}
                              </HelperTextItem>
                            </HelperText>
                          </FormHelperText>
                        </FormGroup>
                      )}
                      {rule.type === 'jwt' && (
                        <FormGroup label={t('Issuer URL')} fieldId={`auth-issuer-url-${i}`}>
                          <TextInput
                            type="url"
                            id={`auth-issuer-url-${i}`}
                            value={rule.issuerUrl || ''}
                            onChange={(_event, value) => updateAuthRule(i, 'issuerUrl', value)}
                            placeholder={t('https://auth.example.com')}
                          />
                        </FormGroup>
                      )}
                      <Button
                        variant="danger"
                        onClick={() => removeAuthRule(i)}
                        isDisabled={authRules.length === 1}
                        aria-label={t('Remove Authentication Rule')}
                      >
                        {t('Remove Authentication Rule')}
                      </Button>
                    </div>
                  ))}
                  <Button variant="secondary" onClick={addAuthRule}>
                    {t('Add Authentication Rule')}
                  </Button>
                </FormGroup>
              </PageSection>
            </Tab>
            <Tab eventKey={2} title={<TabTitleText>{t('Response')}</TabTitleText>}>
              <PageSection hasBodyWrapper={false}>
                <FormGroup
                  label={t('Unauthorized response body (optional, JSON)')}
                  fieldId="unauthorized-body"
                >
                  <TextArea
                    id="unauthorized-body"
                    value={unauthorizedBody}
                    onChange={(_event, value) => setUnauthorizedBody(value)}
                    rows={8}
                  />
                </FormGroup>
                <FormGroup
                  label={t('Content-Type header value for unauthorized response (optional)')}
                  fieldId="content-type"
                >
                  <TextInput
                    id="content-type"
                    value={contentType}
                    onChange={(_event, value) => setContentType(value)}
                  />
                </FormGroup>
              </PageSection>
            </Tab>
          </Tabs>
        ) : (
          <div className="kuadrant-authpolicy-yaml-editor">
            <React.Suspense fallback={<div>{t('Loading...')}</div>}>
              <ResourceYAMLEditor
                initialResource={yamlInput}
                create={create}
                onChange={handleYAMLChange}
              />
            </React.Suspense>
          </div>
        )}
        <ActionGroup className="pf-u-mt-0">
          <KuadrantCreateUpdate
            model={authPolicyModel}
            resource={authPolicy}
            policyType="auth"
            navigate={navigate}
            validation={isFormValid}
          />
          <Button variant="link" onClick={handleCancelResource}>
            {t('Cancel')}
          </Button>
        </ActionGroup>
      </PageSection>
    </>
  );
};

export default KuadrantAuthPolicyCreatePage;
