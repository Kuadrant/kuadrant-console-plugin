import * as React from 'react';
import Helmet from 'react-helmet';
import {
  ActionGroup,
  Button,
  ExpandableSection,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  PageSection,
  Radio,
  TextInput,
  Title,
  TextArea,
  Select,
  SelectOption,
  SelectList,
  MenuToggle,
  MenuToggleElement,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import {
  ResourceYAMLEditor,
  useActiveNamespace,
  useK8sWatchResource,
  getGroupVersionKindForResource,
  useK8sModel,
  K8sResourceCommon,
} from '@openshift-console/dynamic-plugin-sdk';
import { useNavigate, useLocation } from 'react-router-dom-v5-compat';
import * as yaml from 'js-yaml';
import { resourceGVKMapping } from '../utils/resources';
import GatewaySelect from './gateway/GatewaySelect';
import KuadrantCreateUpdate from './KuadrantCreateUpdate';
import { handleCancel } from '../utils/cancel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthRule {
  name: string;
  type: 'apiKey' | 'jwt' | 'anonymous' | 'plain';
  // apiKey
  apiKeySelector?: string;
  // jwt
  issuerUrl?: string;
  // plain
  plainSelector?: string;
}

interface AuthzRule {
  name: string;
  type: 'opa' | 'patternMatching' | 'kubernetesSubjectAccessReview';
  // opa
  rego?: string;
  // patternMatching
  patterns?: string; // JSON string of pattern array
}

interface ResponseConfig {
  unauthorizedBody?: string;
  unauthorizedContentType?: string;
  unauthenticatedBody?: string;
  unauthenticatedContentType?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const emptyAuthRule = (): AuthRule => ({
  name: '',
  type: 'jwt',
  issuerUrl: '',
});

const emptyAuthzRule = (): AuthzRule => ({
  name: '',
  type: 'opa',
  rego: 'allow = false',
});

const buildAuthSpec = (
  authnRules: AuthRule[],
  authzRules: AuthzRule[],
  response: ResponseConfig,
  selectedGateway: { name: string; namespace: string },
  targetKind: string,
) => {
  // Build authentication object
  const authentication: Record<string, unknown> = {};
  authnRules.forEach((rule) => {
    if (!rule.name) return;
    if (rule.type === 'jwt') {
      authentication[rule.name] = {
        jwt: { issuerUrl: rule.issuerUrl || '' },
      };
    } else if (rule.type === 'apiKey') {
      authentication[rule.name] = {
        apiKey: {
          selector: rule.apiKeySelector ? yaml.load(rule.apiKeySelector) : {},
        },
      };
    } else if (rule.type === 'anonymous') {
      authentication[rule.name] = { anonymous: {} };
    } else if (rule.type === 'plain') {
      authentication[rule.name] = {
        plain: {
          selector: rule.plainSelector || '',
        },
      };
    }
  });

  // Build authorization object
  const authorization: Record<string, unknown> = {};
  authzRules.forEach((rule) => {
    if (!rule.name) return;
    if (rule.type === 'opa') {
      authorization[rule.name] = {
        opa: { rego: rule.rego || '' },
      };
    } else if (rule.type === 'patternMatching') {
      try {
        authorization[rule.name] = {
          patternMatching: {
            patterns: rule.patterns ? JSON.parse(rule.patterns) : [],
          },
        };
      } catch {
        authorization[rule.name] = { patternMatching: { patterns: [] } };
      }
    } else if (rule.type === 'kubernetesSubjectAccessReview') {
      authorization[rule.name] = { kubernetesSubjectAccessReview: {} };
    }
  });

  // Build response object
  const responseObj: Record<string, unknown> = {};
  if (response.unauthorizedBody || response.unauthorizedContentType) {
    responseObj.unauthorized = {
      ...(response.unauthorizedBody && {
        body: { value: response.unauthorizedBody },
      }),
      ...(response.unauthorizedContentType && {
        headers: {
          'content-type': { value: response.unauthorizedContentType },
        },
      }),
    };
  }
  if (response.unauthenticatedBody || response.unauthenticatedContentType) {
    responseObj.unauthenticated = {
      ...(response.unauthenticatedBody && {
        body: { value: response.unauthenticatedBody },
      }),
      ...(response.unauthenticatedContentType && {
        headers: {
          'content-type': { value: response.unauthenticatedContentType },
        },
      }),
    };
  }

  const rules: Record<string, unknown> = {};
  if (Object.keys(authentication).length > 0) rules.authentication = authentication;
  if (Object.keys(authorization).length > 0) rules.authorization = authorization;
  if (Object.keys(responseObj).length > 0) rules.response = responseObj;

  return {
    targetRef: {
      group: 'gateway.networking.k8s.io',
      kind: targetKind,
      name: selectedGateway.name,
    },
    ...(Object.keys(rules).length > 0 && { rules }),
  };
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface AuthRuleRowProps {
  rule: AuthRule;
  index: number;
  onChange: (index: number, updated: AuthRule) => void;
  onRemove: (index: number) => void;
  t: (key: string) => string;
}

const AUTH_RULE_TYPES = ['jwt', 'apiKey', 'anonymous', 'plain'] as const;

const AuthRuleRow: React.FC<AuthRuleRowProps> = ({ rule, index, onChange, onRemove, t }) => {
  const [typeOpen, setTypeOpen] = React.useState(false);

  return (
    <div
      style={{
        border: '1px solid var(--pf-v6-global--BorderColor--100)',
        borderRadius: '4px',
        padding: '16px',
        marginBottom: '12px',
        background: 'var(--pf-v6-global--BackgroundColor--200)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
        <strong>
          {t('Authentication Rule')} {index + 1}
        </strong>
        <Button variant="plain" onClick={() => onRemove(index)} aria-label={t('Remove rule')}>
          ✕
        </Button>
      </div>

      <FormGroup label={t('Rule Name')} isRequired fieldId={`authn-name-${index}`}>
        <TextInput
          isRequired
          id={`authn-name-${index}`}
          value={rule.name}
          onChange={(_e, v) => onChange(index, { ...rule, name: v })}
          placeholder="e.g. my-jwt-rule"
          validated={rule.name ? 'default' : 'error'}
        />
      </FormGroup>

      <FormGroup
        label={t('Type')}
        isRequired
        fieldId={`authn-type-${index}`}
        style={{ marginTop: '8px' }}
      >
        <Select
          id={`authn-type-${index}`}
          isOpen={typeOpen}
          onOpenChange={setTypeOpen}
          selected={rule.type}
          onSelect={(_e, v) => {
            onChange(index, { ...rule, type: v as AuthRule['type'] });
            setTypeOpen(false);
          }}
          toggle={(ref: React.Ref<MenuToggleElement>) => (
            <MenuToggle ref={ref} onClick={() => setTypeOpen(!typeOpen)} isExpanded={typeOpen}>
              {rule.type}
            </MenuToggle>
          )}
        >
          <SelectList>
            {AUTH_RULE_TYPES.map((type) => (
              <SelectOption key={type} value={type}>
                {type}
              </SelectOption>
            ))}
          </SelectList>
        </Select>
      </FormGroup>

      {rule.type === 'jwt' && (
        <FormGroup
          label={t('Issuer URL')}
          isRequired
          fieldId={`authn-issuer-${index}`}
          style={{ marginTop: '8px' }}
        >
          <TextInput
            isRequired
            id={`authn-issuer-${index}`}
            value={rule.issuerUrl || ''}
            onChange={(_e, v) => onChange(index, { ...rule, issuerUrl: v })}
            placeholder="https://accounts.google.com"
            validated={rule.issuerUrl ? 'default' : 'error'}
          />
        </FormGroup>
      )}

      {rule.type === 'apiKey' && (
        <FormGroup
          label={t('API Key Label Selector (YAML)')}
          fieldId={`authn-apikey-${index}`}
          style={{ marginTop: '8px' }}
        >
          <TextArea
            id={`authn-apikey-${index}`}
            value={rule.apiKeySelector || ''}
            onChange={(_e, v) => onChange(index, { ...rule, apiKeySelector: v })}
            placeholder={'matchLabels:\n  api-key: "true"'}
            rows={3}
          />
        </FormGroup>
      )}

      {rule.type === 'plain' && (
        <FormGroup
          label={t('Selector')}
          isRequired
          fieldId={`authn-plain-${index}`}
          style={{ marginTop: '8px' }}
        >
          <TextInput
            isRequired
            id={`authn-plain-${index}`}
            value={rule.plainSelector || ''}
            onChange={(_e, v) => onChange(index, { ...rule, plainSelector: v })}
            placeholder="auth.identity.username"
          />
        </FormGroup>
      )}
    </div>
  );
};

interface AuthzRuleRowProps {
  rule: AuthzRule;
  index: number;
  onChange: (index: number, updated: AuthzRule) => void;
  onRemove: (index: number) => void;
  t: (key: string) => string;
}

const AUTHZ_RULE_TYPES = ['opa', 'patternMatching', 'kubernetesSubjectAccessReview'] as const;

const AuthzRuleRow: React.FC<AuthzRuleRowProps> = ({ rule, index, onChange, onRemove, t }) => {
  const [typeOpen, setTypeOpen] = React.useState(false);

  return (
    <div
      style={{
        border: '1px solid var(--pf-v6-global--BorderColor--100)',
        borderRadius: '4px',
        padding: '16px',
        marginBottom: '12px',
        background: 'var(--pf-v6-global--BackgroundColor--200)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
        <strong>
          {t('Authorization Rule')} {index + 1}
        </strong>
        <Button variant="plain" onClick={() => onRemove(index)} aria-label={t('Remove rule')}>
          ✕
        </Button>
      </div>

      <FormGroup label={t('Rule Name')} isRequired fieldId={`authz-name-${index}`}>
        <TextInput
          isRequired
          id={`authz-name-${index}`}
          value={rule.name}
          onChange={(_e, v) => onChange(index, { ...rule, name: v })}
          placeholder="e.g. deny-all"
          validated={rule.name ? 'default' : 'error'}
        />
      </FormGroup>

      <FormGroup
        label={t('Type')}
        isRequired
        fieldId={`authz-type-${index}`}
        style={{ marginTop: '8px' }}
      >
        <Select
          id={`authz-type-${index}`}
          isOpen={typeOpen}
          onOpenChange={setTypeOpen}
          selected={rule.type}
          onSelect={(_e, v) => {
            onChange(index, { ...rule, type: v as AuthzRule['type'] });
            setTypeOpen(false);
          }}
          toggle={(ref: React.Ref<MenuToggleElement>) => (
            <MenuToggle ref={ref} onClick={() => setTypeOpen(!typeOpen)} isExpanded={typeOpen}>
              {rule.type}
            </MenuToggle>
          )}
        >
          <SelectList>
            {AUTHZ_RULE_TYPES.map((type) => (
              <SelectOption key={type} value={type}>
                {type}
              </SelectOption>
            ))}
          </SelectList>
        </Select>
      </FormGroup>

      {rule.type === 'opa' && (
        <FormGroup
          label={t('Rego Policy')}
          isRequired
          fieldId={`authz-rego-${index}`}
          style={{ marginTop: '8px' }}
        >
          <TextArea
            isRequired
            id={`authz-rego-${index}`}
            value={rule.rego || ''}
            onChange={(_e, v) => onChange(index, { ...rule, rego: v })}
            placeholder={'allow {\n  input.auth.identity.email == "admin@example.com"\n}'}
            rows={5}
            style={{ fontFamily: 'monospace' }}
            validated={rule.rego ? 'default' : 'error'}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>{t('OPA Rego policy expression')}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      )}

      {rule.type === 'patternMatching' && (
        <FormGroup
          label={t('Patterns (JSON array)')}
          isRequired
          fieldId={`authz-patterns-${index}`}
          style={{ marginTop: '8px' }}
        >
          <TextArea
            isRequired
            id={`authz-patterns-${index}`}
            value={rule.patterns || ''}
            onChange={(_e, v) => onChange(index, { ...rule, patterns: v })}
            placeholder={
              '[{"selector": "auth.identity.role", "operator": "eq", "value": "admin"}]'
            }
            rows={4}
            style={{ fontFamily: 'monospace' }}
          />
        </FormGroup>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const KuadrantAuthPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [selectedNamespace] = useActiveNamespace();
  const location = useLocation();
  const navigate = useNavigate();

  // ── Detect edit mode ──
  const pathSplit = location.pathname.split('/');
  const nameEdit = pathSplit[6];
  const namespaceEdit = pathSplit[3];
  const isEditMode = !!nameEdit;

  // ── View state ──
  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');

  // ── Form state ──
  const [policyName, setPolicyName] = React.useState('');
  const [selectedGateway, setSelectedGateway] = React.useState({ name: '', namespace: '' });
  const [targetKind, setTargetKind] = React.useState<'Gateway' | 'HTTPRoute'>('Gateway');
  const [targetKindOpen, setTargetKindOpen] = React.useState(false);
  const [authnRules, setAuthnRules] = React.useState<AuthRule[]>([]);
  const [authzRules, setAuthzRules] = React.useState<AuthzRule[]>([]);
  const [response, setResponse] = React.useState<ResponseConfig>({});
  const [authnExpanded, setAuthnExpanded] = React.useState(true);
  const [authzExpanded, setAuthzExpanded] = React.useState(false);
  const [responseExpanded, setResponseExpanded] = React.useState(false);
  const [creationTimestamp, setCreationTimestamp] = React.useState('');
  const [resourceVersion, setResourceVersion] = React.useState('');
  const [formDisabled, setFormDisabled] = React.useState(false);

  // ── Get model ──
  const authPolicyGVK = getGroupVersionKindForResource({
    apiVersion: `${resourceGVKMapping['AuthPolicy'].group}/${resourceGVKMapping['AuthPolicy'].version}`,
    kind: resourceGVKMapping['AuthPolicy'].kind,
  });
  const [authPolicyModel] = useK8sModel({
    group: authPolicyGVK.group,
    version: authPolicyGVK.version,
    kind: authPolicyGVK.kind,
  });

  // ── Load existing resource in edit mode ──
  interface AuthPolicyEdit extends K8sResourceCommon {
    spec?: {
      targetRef?: {
        group?: string;
        kind?: string;
        name?: string;
      };
      rules?: {
        authentication?: Record<string, Record<string, unknown>>;
        authorization?: Record<string, Record<string, unknown>>;
        response?: Record<string, Record<string, unknown>>;
      };
    };
  }

  let authResource = null;
  if (nameEdit) {
    authResource = {
      groupVersionKind: authPolicyGVK,
      isList: false,
      name: nameEdit,
      namespace: namespaceEdit,
    };
  }

  const [authData, authLoaded, authError] = authResource
    ? useK8sWatchResource(authResource)
    : [null, false, null];

  React.useEffect(() => {
    if (authLoaded && !authError && authData) {
      if (!Array.isArray(authData)) {
        const authPolicyUpdate = authData as AuthPolicyEdit;
        setCreationTimestamp(authPolicyUpdate.metadata.creationTimestamp);
        setResourceVersion(authPolicyUpdate.metadata.resourceVersion);
        setFormDisabled(true);
        setPolicyName(authPolicyUpdate.metadata?.name || '');
        setSelectedGateway({
          name: authPolicyUpdate.spec?.targetRef?.name || '',
          namespace: authPolicyUpdate.metadata?.namespace || '',
        });
        if (authPolicyUpdate.spec?.targetRef?.kind === 'HTTPRoute') {
          setTargetKind('HTTPRoute');
        }

        // Parse authentication rules
        if (authPolicyUpdate.spec?.rules?.authentication) {
          const authn = authPolicyUpdate.spec.rules.authentication;
          const parsed: AuthRule[] = Object.entries(authn).map(([name, config]) => {
            if (config.jwt) {
              const jwt = config.jwt as Record<string, string>;
              return { name, type: 'jwt', issuerUrl: jwt.issuerUrl || '' };
            }
            if (config.apiKey)
              return {
                name,
                type: 'apiKey',
                apiKeySelector: yaml.dump(
                  (config.apiKey as Record<string, unknown>).selector || {},
                ),
              };
            if (config.anonymous) return { name, type: 'anonymous' };
            if (config.plain)
              return {
                name,
                type: 'plain',
                plainSelector: String((config.plain as Record<string, unknown>).selector || ''),
              };
            return { name, type: 'jwt' };
          });
          setAuthnRules(parsed);
        }

        // Parse authorization rules
        if (authPolicyUpdate.spec?.rules?.authorization) {
          const authz = authPolicyUpdate.spec.rules.authorization;
          const parsed: AuthzRule[] = Object.entries(authz).map(([name, config]) => {
            if (config.opa)
              return {
                name,
                type: 'opa',
                rego: String((config.opa as Record<string, string>).rego || ''),
              };
            if (config.patternMatching)
              return {
                name,
                type: 'patternMatching',
                patterns: JSON.stringify(
                  (config.patternMatching as Record<string, unknown>).patterns || [],
                  null,
                  2,
                ),
              };
            if (config.kubernetesSubjectAccessReview)
              return { name, type: 'kubernetesSubjectAccessReview' };
            return { name, type: 'opa', rego: '' };
          });
          setAuthzRules(parsed);
        }

        // Parse response config
        if (authPolicyUpdate.spec?.rules?.response) {
          const resp = authPolicyUpdate.spec.rules.response;
          const unauth = resp.unauthorized as Record<string, unknown> | undefined;
          const unauthenticated = resp.unauthenticated as Record<string, unknown> | undefined;
          setResponse({
            unauthorizedBody: (unauth?.body as Record<string, string>)?.value || '',
            unauthorizedContentType:
              ((unauth?.headers as Record<string, Record<string, string>>)?.['content-type'])
                ?.value || '',
            unauthenticatedBody: (unauthenticated?.body as Record<string, string>)?.value || '',
            unauthenticatedContentType:
              ((unauthenticated?.headers as Record<string, Record<string, string>>)?.[
                'content-type'
              ])?.value || '',
          });
        }
      }
    } else if (authError) {
      console.error('Failed to fetch the resource:', authError);
    }
  }, [authData, authLoaded, authError]);

  // ── Build policy object ──
  const createPolicy = () => ({
    apiVersion: `${resourceGVKMapping['AuthPolicy'].group}/${resourceGVKMapping['AuthPolicy'].version}`,
    kind: resourceGVKMapping['AuthPolicy'].kind,
    metadata: {
      name: policyName,
      namespace: selectedNamespace,
      ...(creationTimestamp ? { creationTimestamp } : {}),
      ...(resourceVersion ? { resourceVersion } : {}),
    },
    spec: buildAuthSpec(authnRules, authzRules, response, selectedGateway, targetKind),
  });

  // ── Validation ──
  const authnRulesValid = authnRules.every((r) => {
    if (!r.name) return false;
    if (r.type === 'jwt' && !r.issuerUrl) return false;
    return true;
  });

  const authzRulesValid = authzRules.every((r) => {
    if (!r.name) return false;
    if (r.type === 'opa' && !r.rego) return false;
    return true;
  });

  const isFormValid = !!(policyName && selectedGateway.name && authnRulesValid && authzRulesValid);

  // ── YAML → form sync ──
  const handleYAMLChange = (yamlStr: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed = yaml.load(yamlStr) as Record<string, any>;
      setPolicyName(parsed.metadata?.name || '');
      setSelectedGateway({
        name: parsed.spec?.targetRef?.name || '',
        namespace: parsed.metadata?.namespace || '',
      });
      if (parsed.spec?.targetRef?.kind === 'HTTPRoute') {
        setTargetKind('HTTPRoute');
      }
    } catch {
      // invalid yaml mid-edit, ignore
    }
  };

  // ── Authn rule handlers ──
  const addAuthnRule = () => setAuthnRules([...authnRules, emptyAuthRule()]);
  const removeAuthnRule = (i: number) => setAuthnRules(authnRules.filter((_, idx) => idx !== i));
  const updateAuthnRule = (i: number, updated: AuthRule) => {
    const next = [...authnRules];
    next[i] = updated;
    setAuthnRules(next);
  };

  // ── Authz rule handlers ──
  const addAuthzRule = () => setAuthzRules([...authzRules, emptyAuthzRule()]);
  const removeAuthzRule = (i: number) => setAuthzRules(authzRules.filter((_, idx) => idx !== i));
  const updateAuthzRule = (i: number, updated: AuthzRule) => {
    const next = [...authzRules];
    next[i] = updated;
    setAuthzRules(next);
  };

  const handleCancelResource = () => {
    handleCancel(selectedNamespace, createPolicy(), navigate);
  };

  const [yamlInput, setYamlInput] = React.useState(createPolicy);

  React.useEffect(() => {
    setYamlInput(createPolicy());
  }, [
    policyName,
    selectedNamespace,
    selectedGateway,
    targetKind,
    authnRules,
    authzRules,
    response,
  ]);

  return (
    <>
      <Helmet>
        <title>{t(isEditMode ? 'Edit AuthPolicy' : 'Create AuthPolicy')}</title>
      </Helmet>
      <PageSection hasBodyWrapper={false} className="pf-m-no-padding">
        <div className="co-m-nav-title">
          <Title headingLevel="h1">
            {t(isEditMode ? 'Edit AuthPolicy' : 'Create AuthPolicy')}
          </Title>
          <p className="help-block">
            {t('AuthPolicy configures authentication and authorization for Gateway or HTTPRoute')}
          </p>
        </div>
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

      {createView === 'form' ? (
        <PageSection hasBodyWrapper={false}>
          <Form className="co-m-pane__form">
            {/* ── Policy Name ── */}
            <FormGroup label={t('Policy Name')} isRequired fieldId="policy-name">
              <TextInput
                isRequired
                type="text"
                id="policy-name"
                value={policyName}
                onChange={(_e, v) => setPolicyName(v)}
                validated={policyName ? 'default' : 'error'}
                placeholder="my-auth-policy"
                isDisabled={formDisabled}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>{t('A unique name for this AuthPolicy')}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>

            {/* ── Target Kind ── */}
            <FormGroup label={t('Target Kind')} isRequired fieldId="target-kind">
              <Select
                id="target-kind"
                isOpen={targetKindOpen}
                onOpenChange={setTargetKindOpen}
                selected={targetKind}
                onSelect={(_e, v) => {
                  setTargetKind(v as 'Gateway' | 'HTTPRoute');
                  setTargetKindOpen(false);
                }}
                toggle={(ref: React.Ref<MenuToggleElement>) => (
                  <MenuToggle
                    ref={ref}
                    onClick={() => setTargetKindOpen(!targetKindOpen)}
                    isExpanded={targetKindOpen}
                  >
                    {targetKind}
                  </MenuToggle>
                )}
              >
                <SelectList>
                  <SelectOption value="Gateway">Gateway</SelectOption>
                  <SelectOption value="HTTPRoute">HTTPRoute</SelectOption>
                </SelectList>
              </Select>
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {t('The Kubernetes resource this policy applies to')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>

            {/* ── Target Gateway/HTTPRoute ── */}
            <GatewaySelect selectedGateway={selectedGateway} onChange={setSelectedGateway} />

            {/* ── Authentication Rules ── */}
            <ExpandableSection
              toggleText={
                authnExpanded
                  ? t('Hide Authentication Rules')
                  : t(`Authentication Rules (${authnRules.length})`)
              }
              isExpanded={authnExpanded}
              onToggle={(_e, val) => setAuthnExpanded(val)}
            >
              <FormHelperText style={{ marginBottom: '12px' }}>
                <HelperText>
                  <HelperTextItem>
                    {t(
                      'Define how requests are authenticated. Each rule corresponds to a different auth method.',
                    )}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
              {authnRules.map((rule, i) => (
                <AuthRuleRow
                  key={i}
                  rule={rule}
                  index={i}
                  onChange={updateAuthnRule}
                  onRemove={removeAuthnRule}
                  t={t}
                />
              ))}
              <Button variant="secondary" onClick={addAuthnRule} style={{ marginTop: '4px' }}>
                {t('+ Add Authentication Rule')}
              </Button>
            </ExpandableSection>

            {/* ── Authorization Rules ── */}
            <ExpandableSection
              toggleText={
                authzExpanded
                  ? t('Hide Authorization Rules')
                  : t(`Authorization Rules (${authzRules.length})`)
              }
              isExpanded={authzExpanded}
              onToggle={(_e, val) => setAuthzExpanded(val)}
            >
              <FormHelperText style={{ marginBottom: '12px' }}>
                <HelperText>
                  <HelperTextItem>
                    {t(
                      'Define what authenticated requests are allowed to do. Uses OPA, pattern matching, or Kubernetes RBAC.',
                    )}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
              {authzRules.map((rule, i) => (
                <AuthzRuleRow
                  key={i}
                  rule={rule}
                  index={i}
                  onChange={updateAuthzRule}
                  onRemove={removeAuthzRule}
                  t={t}
                />
              ))}
              <Button variant="secondary" onClick={addAuthzRule} style={{ marginTop: '4px' }}>
                {t('+ Add Authorization Rule')}
              </Button>
            </ExpandableSection>

            {/* ── Response Configuration ── */}
            <ExpandableSection
              toggleText={
                responseExpanded
                  ? t('Hide Response Configuration')
                  : t('Response Configuration (optional)')
              }
              isExpanded={responseExpanded}
              onToggle={(_e, val) => setResponseExpanded(val)}
            >
              <FormHelperText style={{ marginBottom: '12px' }}>
                <HelperText>
                  <HelperTextItem>
                    {t(
                      'Customize error response bodies and content types for unauthorized and unauthenticated requests.',
                    )}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>

              <FormGroup label={t('Unauthorized Response Body')} fieldId="resp-unauth-body">
                <TextArea
                  id="resp-unauth-body"
                  value={response.unauthorizedBody || ''}
                  onChange={(_e, v) => setResponse({ ...response, unauthorizedBody: v })}
                  placeholder={'{"error": "Forbidden"}'}
                  rows={3}
                  style={{ fontFamily: 'monospace' }}
                />
              </FormGroup>

              <FormGroup
                label={t('Unauthorized Content-Type')}
                fieldId="resp-unauth-ct"
                style={{ marginTop: '8px' }}
              >
                <TextInput
                  id="resp-unauth-ct"
                  value={response.unauthorizedContentType || ''}
                  onChange={(_e, v) => setResponse({ ...response, unauthorizedContentType: v })}
                  placeholder="application/json"
                />
              </FormGroup>

              <FormGroup
                label={t('Unauthenticated Response Body')}
                fieldId="resp-unauthn-body"
                style={{ marginTop: '8px' }}
              >
                <TextArea
                  id="resp-unauthn-body"
                  value={response.unauthenticatedBody || ''}
                  onChange={(_e, v) => setResponse({ ...response, unauthenticatedBody: v })}
                  placeholder={'{"error": "Unauthorized"}'}
                  rows={3}
                  style={{ fontFamily: 'monospace' }}
                />
              </FormGroup>

              <FormGroup
                label={t('Unauthenticated Content-Type')}
                fieldId="resp-unauthn-ct"
                style={{ marginTop: '8px' }}
              >
                <TextInput
                  id="resp-unauthn-ct"
                  value={response.unauthenticatedContentType || ''}
                  onChange={(_e, v) =>
                    setResponse({ ...response, unauthenticatedContentType: v })
                  }
                  placeholder="application/json"
                />
              </FormGroup>
            </ExpandableSection>

            <ActionGroup className="pf-u-mt-0">
              <KuadrantCreateUpdate
                model={authPolicyModel}
                resource={createPolicy()}
                policyType="auth"
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
        <React.Suspense fallback={<div>{t('Loading...')}</div>}>
          <ResourceYAMLEditor
            initialResource={yamlInput}
            create={!isEditMode}
            onChange={handleYAMLChange}
          />
        </React.Suspense>
      )}
    </>
  );
};

export default KuadrantAuthPolicyCreatePage;
