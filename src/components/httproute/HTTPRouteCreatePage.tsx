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
  Button,
  ButtonVariant,
  ActionGroup,
  Alert,
  Modal,
  AlertVariant,
  Tabs,
  Tab,
  TabTitleText,
  ValidatedOptions,
  FormSelect,
  FormSelectOption,
  FormFieldGroupExpandable,
  FormFieldGroupHeader,
} from '@patternfly/react-core';
import { PlusCircleIcon, MinusCircleIcon, TrashIcon, EditIcon } from '@patternfly/react-icons';
import { useTranslation } from 'react-i18next';
import {
  ResourceYAMLEditor,
  getGroupVersionKindForResource,
  useK8sModel,
  useK8sWatchResource,
  useActiveNamespace,
} from '@openshift-console/dynamic-plugin-sdk';
import { useLocation, useNavigate } from 'react-router';
import * as yaml from 'js-yaml';
import ParentReferencesSelect from '../../utils/ParentReferencesSelect';
import { HTTPRouteResource, HTTPRouteMatch, HTTPRoutePathType, HTTPRouteMethod } from './types';
import {
  generateFiltersForYAML,
  parseFiltersFromYAML,
  getFilterSummary,
} from './filters/filterUtils';
import { generateMatchesForYAML, parseMatchesFromYAML, validateMatchesInRule } from './matchUtils';
import HTTPRouteRuleWizard from './HTTPRouteRuleWizard';
import KuadrantCreateUpdate from '../KuadrantCreateUpdate';
import { handleCancel } from '../../utils/cancel';
import { validateRequired, validateK8sName } from '../../utils/validation';
import '../css/gateway-api-plugin.css';

interface ParentReference {
  id: string;
  gatewayName: string;
  gatewayNamespace: string;
  sectionName: string;
  port: number;
  isExpanded?: boolean;
}

interface HTTPRouteCreatePageProps {
  onFormChange?: (resource: HTTPRouteResource, isValid: boolean) => void;
}

// UI-only categorisation of a rule's primary matching criteria — HTTPRoute matches don't
// carry this distinction in the API, it just drives which fields we seed on "Add rule"
// and how the rule panel below is summarised.
type RuleType = 'path' | 'header' | 'query' | 'method';

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  path: 'Path match',
  header: 'Header match',
  query: 'Query param match',
  method: 'Method match',
};

const seedMatchForRuleType = (ruleType: RuleType): HTTPRouteMatch => {
  const base: HTTPRouteMatch = {
    id: `match-${Date.now().toString(36)}`,
    pathType: '' as HTTPRoutePathType,
    pathValue: '/',
    method: '' as HTTPRouteMethod,
    headers: [],
    queryParams: [],
  };
  switch (ruleType) {
    case 'path':
      return { ...base, pathType: 'Exact', pathValue: '/path' };
    case 'header':
      return {
        ...base,
        headers: [{ id: `header-${Date.now().toString(36)}`, type: 'Exact', name: '', value: '' }],
      };
    case 'query':
      return {
        ...base,
        queryParams: [
          { id: `queryparam-${Date.now().toString(36)}`, type: 'Exact', name: '', value: '' },
        ],
      };
    case 'method':
      return { ...base, method: 'GET' };
    default:
      return base;
  }
};

// Infer a rule's type from its matches when it wasn't created through the "Rule type"
// picker (e.g. parsed from YAML or an existing resource being edited).
const inferRuleType = (matches: HTTPRouteMatch[]): RuleType => {
  const match = matches?.[0];
  if (!match) return 'path';
  if (match.headers?.some((h) => h.name)) return 'header';
  if (match.queryParams?.some((q) => q.name)) return 'query';
  if (match.method && !match.pathValue) return 'method';
  return 'path';
};

const HTTPRouteCreatePage: React.FC<HTTPRouteCreatePageProps> = ({ onFormChange }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');
  const [routeName, setRouteName] = React.useState('');
  const [routeNameError, setRouteNameError] = React.useState<string | null>(null);
  const [routeNameTouched, setRouteNameTouched] = React.useState(false);
  const [hostnames, setHostnames] = React.useState<string[]>([]);
  const [selectedNamespaceRaw] = useActiveNamespace();

  // YAML editor state
  const [yamlContent, setYamlContent] = React.useState<unknown>(null);
  const [yamlError, setYamlError] = React.useState<string | null>(null);
  const [parentRefs, setParentRefs] = React.useState<ParentReference[]>([]);

  // Metadata for determining edit/create mode
  const [originalMetadata, setOriginalMetadata] = React.useState<
    HTTPRouteResource['metadata'] | null
  >(null);

  //   Determine mode by checking originalMetadata
  const isEdit = !!originalMetadata;
  type RuleUI = {
    id: string;
    matches: HTTPRouteMatch[];
    filters: ReturnType<typeof parseFiltersFromYAML>;
    serviceName: string;
    servicePort: number;
    ruleType: RuleType;
  };
  const [rules, setRules] = React.useState<RuleUI[]>([]);
  const [isRuleModalOpen, setIsRuleModalOpen] = React.useState(false);
  const [selectedRuleType, setSelectedRuleType] = React.useState<RuleType>('path');

  const [currentRule, setCurrentRule] = React.useState<RuleUI>({
    id: 'rule-1',
    matches: [], // Array of match objects
    filters: [], // Filters array
    serviceName: '', // Backend service name
    servicePort: 80, // Backend service port
    ruleType: 'path',
  });

  const [editingRuleIndex, setEditingRuleIndex] = React.useState<number | null>(null);

  const location = useLocation();
  const navigate = useNavigate();
  const segments = location.pathname.split('/');
  const nsIndex = segments.indexOf('ns');
  const namespaceEdit = nsIndex >= 0 ? segments[nsIndex + 1] : undefined;
  const resourceIndex = segments.findIndex((s) => s.includes('~'));
  const nameEdit = resourceIndex >= 0 ? segments[resourceIndex + 1] : undefined;
  const selectedNamespace =
    !selectedNamespaceRaw || selectedNamespaceRaw === '#ALL_NS#' ? 'default' : selectedNamespaceRaw;
  // Function to add a new hostname field
  const addHostnameField = () => {
    setHostnames([...hostnames, '']);
  };

  //Function to remove a hostname field
  const removeHostnameField = (index: number) => {
    const newHostnames = hostnames.filter((_, i) => i !== index);
    setHostnames(newHostnames);
  };

  // Function to update a hostname value
  const updateHostname = (value: string, index: number) => {
    const newHostnames = [...hostnames];
    newHostnames[index] = value;
    setHostnames(newHostnames);
  };

  // When form completed, build HTTPRoute resource object from form data (following Gateway pattern)
  const httpRouteObject = React.useMemo(() => {
    // Filter out empty hostnames
    const validHostnames = hostnames.filter((h) => h.trim().length > 0);
    const validParentRefs = parentRefs.filter((ref) => ref.gatewayName);

    const httpRoute = {
      apiVersion: 'gateway.networking.k8s.io/v1',
      kind: 'HTTPRoute',
      metadata: originalMetadata
        ? {
            ...originalMetadata,
            name: routeName,
          }
        : {
            name: routeName,
            namespace: selectedNamespace,
          },
      spec: {
        parentRefs: validParentRefs.map((ref) => ({
          name: ref.gatewayName,
          ...(ref.gatewayNamespace !== selectedNamespace
            ? { namespace: ref.gatewayNamespace }
            : {}),
          ...(ref.sectionName ? { sectionName: ref.sectionName } : {}),
          ...(ref.sectionName && ref.port ? { port: ref.port } : {}),
        })),
        ...(validHostnames.length > 0 ? { hostnames: validHostnames } : {}),
        rules: rules.map((rule) => ({
          ...(rule.matches.length > 0 ? { matches: generateMatchesForYAML(rule.matches) } : {}),
          ...(rule.filters && rule.filters.length > 0
            ? { filters: generateFiltersForYAML(rule.filters) }
            : {}),
          ...(rule.serviceName
            ? {
                backendRefs: [
                  {
                    name: rule.serviceName,
                    port: rule.servicePort,
                  },
                ],
              }
            : {}),
        })),
      },
    };

    return httpRoute;
  }, [routeName, hostnames, parentRefs, rules, selectedNamespace, originalMetadata]);

  const populateFormFromHTTPRoute = (httpRoute: unknown) => {
    try {
      const hr = httpRoute as Partial<HTTPRouteResource>;
      if (hr.metadata?.name && hr.metadata.name !== routeName) setRouteName(hr.metadata.name);

      if (hr.spec?.hostnames) {
        const newHostnames = hr.spec.hostnames;
        if (JSON.stringify(newHostnames) !== JSON.stringify(hostnames)) setHostnames(newHostnames);
      }

      if (hr.spec?.parentRefs && hr.spec.parentRefs.length > 0) {
        const formattedParentRefs: ParentReference[] = hr.spec.parentRefs.map(
          (ref, index: number) => ({
            id: `parent-${Date.now()}-${index}`,
            gatewayName: ref.name || '',
            gatewayNamespace: ref.namespace || selectedNamespace,
            sectionName: ref.sectionName || '',
            port: ref.port || 0,
          }),
        );
        if (JSON.stringify(formattedParentRefs) !== JSON.stringify(parentRefs))
          setParentRefs(formattedParentRefs);
      }

      if (hr.spec?.rules && hr.spec.rules.length > 0) {
        const formattedRules = hr.spec.rules.map((rule, index: number) => {
          const matches = parseMatchesFromYAML(rule.matches);
          return {
            id: rules[index]?.id || `rule-${index + 1}`,
            matches,
            filters: parseFiltersFromYAML(rule.filters),
            serviceName: rule.backendRefs?.[0]?.name || '',
            servicePort: rule.backendRefs?.[0]?.port || 80,
            ruleType: rules[index]?.ruleType || inferRuleType(matches),
          };
        });
        if (JSON.stringify(formattedRules) !== JSON.stringify(rules)) setRules(formattedRules);
      }

      // Keep form enabled in edit mode to allow changes
    } catch (error) {
      console.error('Error populating form from HTTPRoute:', error);
    }
  };

  const httpRouteGVK = React.useMemo(
    () =>
      getGroupVersionKindForResource({
        apiVersion: 'gateway.networking.k8s.io/v1',
        kind: 'HTTPRoute',
      }),
    [],
  );

  const [httpRouteModel] = useK8sModel({
    group: httpRouteGVK.group,
    version: httpRouteGVK.version,
    kind: httpRouteGVK.kind,
  });

  // Check if there is an HTTPRoute for editing
  const httpRouteWatchResource = React.useMemo(
    () =>
      nameEdit && nameEdit !== '~new'
        ? {
            groupVersionKind: httpRouteGVK,
            isList: false,
            name: nameEdit,
            namespace: namespaceEdit,
          }
        : null,
    [nameEdit, namespaceEdit, httpRouteGVK],
  );

  const [httpRouteData, httpRouteLoaded, httpRouteError] =
    useK8sWatchResource(httpRouteWatchResource);

  const hasInitializedFromResource = React.useRef(false);

  React.useEffect(() => {
    if (
      httpRouteWatchResource &&
      httpRouteLoaded &&
      !httpRouteError &&
      !Array.isArray(httpRouteData)
    ) {
      const httpRouteUpdate = httpRouteData as HTTPRouteResource;
      setOriginalMetadata(httpRouteUpdate.metadata);

      if (!hasInitializedFromResource.current) {
        populateFormFromHTTPRoute(httpRouteUpdate);
        hasInitializedFromResource.current = true;

        // Set initial YAML content if in YAML view
        if (createView === 'yaml') {
          setYamlContent(httpRouteUpdate);
        }
      }
    } else if (httpRouteError) {
      console.error('Failed to fetch the HTTPRoute resource:', httpRouteError);
    }
  }, [httpRouteData, httpRouteLoaded, httpRouteError, httpRouteWatchResource, createView]);

  const parseYAMLToForm = (yamlInput: string) => {
    setYamlError(null);
    try {
      const parsedHTTPRoute = yaml.load(yamlInput);
      if (parsedHTTPRoute && typeof parsedHTTPRoute === 'object') {
        populateFormFromHTTPRoute(parsedHTTPRoute);
      }
    } catch (error: unknown) {
      const err = error as Error;
      const errorMessage =
        err?.message ||
        'Invalid YAML syntax. Please review the HTTPRoute Resource YAML and try again.';
      setYamlError(errorMessage);
      console.warn('Invalid YAML syntax, not updating form:', error);
    }
  };

  const handleYAMLChange = (yamlInput: string) => {
    setYamlContent(yamlInput);
  };

  const handleViewSwitch = (newView: 'form' | 'yaml') => {
    if (newView === 'form' && createView === 'yaml') {
      // Switching from YAML to form - sync YAML to form
      if (yamlContent) {
        parseYAMLToForm(
          typeof yamlContent === 'string' ? yamlContent : JSON.stringify(yamlContent),
        );
      }
    } else if (newView === 'yaml' && createView === 'form') {
      setYamlContent(httpRouteObject);
      setYamlError(null);
    }
    setCreateView(newView);
  };

  // Validation function
  const validateRouteName = React.useCallback(
    (value: string) => {
      const requiredError = validateRequired(value);
      if (requiredError) return t(requiredError);
      const formatError = validateK8sName(value);
      if (formatError) return t(formatError);
      return null;
    },
    [t],
  );

  const handleRouteNameChange = (_event: React.FormEvent<HTMLInputElement>, name: string) => {
    setRouteName(name);
  };

  const formValidation = () => {
    const hasValidParentRef = parentRefs.some((ref) => ref.gatewayName);

    const hasValidRules =
      rules.length === 0 ||
      rules.every((rule) => {
        const basicFieldsValid = rule.id && rule.serviceName && rule.servicePort > 0;

        const matchesValid = validateMatchesInRule(rule.matches);

        return basicFieldsValid && matchesValid;
      });

    return !!(validateRouteName(routeName) === null && hasValidParentRef && hasValidRules);
  };

  const onFormChangeRef = React.useRef(onFormChange);
  onFormChangeRef.current = onFormChange;

  React.useEffect(() => {
    if (onFormChangeRef.current) {
      onFormChangeRef.current(httpRouteObject as HTTPRouteResource, formValidation());
    }
  }, [httpRouteObject]);

  const redirectNamespace = originalMetadata?.namespace ?? namespaceEdit ?? selectedNamespace;
  const redirectPath = `/k8s/ns/${redirectNamespace}/${httpRouteModel?.apiGroup}~${httpRouteModel?.apiVersion}~${httpRouteModel?.kind}/${routeName}`;

  const handleAddRule = () => {
    setEditingRuleIndex(null);
    setCurrentRule({
      id: `rule-${Date.now().toString(36)}`,
      matches: [seedMatchForRuleType(selectedRuleType)],
      filters: [],
      serviceName: '',
      servicePort: 80,
      ruleType: selectedRuleType,
    });
    setIsRuleModalOpen(true);
  };

  const handleRuleModalClose = () => {
    setIsRuleModalOpen(false);
  };

  const handleRuleSave = () => {
    let newRules: RuleUI[];
    if (editingRuleIndex !== null) {
      // EDIT mode - replace existing rule
      newRules = [...rules];
      newRules[editingRuleIndex] = { ...currentRule };
    } else {
      // CREATE mode - add new rule
      newRules = [...rules, { ...currentRule }];
    }
    setRules(newRules);
    setIsRuleModalOpen(false);
  };

  const handleEditRule = (index: number) => {
    setEditingRuleIndex(index); // Edit mode
    setCurrentRule({ ...rules[index], filters: rules[index].filters || [] }); // Load data into form
    setIsRuleModalOpen(true); // Open modal
  };

  const handleRemoveRule = (index: number) => {
    const newRules = rules.filter((_, i) => i !== index);
    setRules(newRules);
  };

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">
          {isEdit ? t('Edit HTTPRoute') : t('Create HTTPRoute')}
        </title>
      </Helmet>
      <PageSection hasBodyWrapper={false}>
        <div className="co-m-nav-title">
          <Title headingLevel="h1">{isEdit ? t('Edit HTTPRoute') : t('Create HTTPRoute')}</Title>
          <p className="help-block co-m-pane__heading-help-text">
            {t('HTTPRoute provides a way to route HTTP requests to backends.')}
          </p>
        </div>
        <Tabs
          activeKey={createView}
          onSelect={(_e, key) => handleViewSwitch(key as 'form' | 'yaml')}
        >
          <Tab eventKey="form" title={<TabTitleText>{t('Form')}</TabTitleText>}>
            <br />
            <PageSection hasBodyWrapper={false}>
              <Form className="co-m-pane__form">
                <FormGroup label={t('HTTPRoute Name')} isRequired fieldId="httproute-name">
                  <TextInput
                    isRequired
                    type="text"
                    id="httproute-name"
                    name="httproute-name"
                    value={routeName}
                    onChange={handleRouteNameChange}
                    onBlur={() => {
                      setRouteNameTouched(true);
                      setRouteNameError(validateRouteName(routeName));
                    }}
                    validated={
                      routeNameTouched && routeNameError
                        ? ValidatedOptions.error
                        : ValidatedOptions.default
                    }
                    isDisabled={isEdit}
                    placeholder={t('HTTPRoute Name')}
                  />
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem
                        variant={routeNameTouched && routeNameError ? 'error' : 'default'}
                      >
                        {routeNameTouched && routeNameError
                          ? routeNameError
                          : t('Unique name of the HTTPRoute')}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>

                <ParentReferencesSelect parentRefs={parentRefs} onChange={setParentRefs} />

                <FormGroup
                  label={t('Hostnames')}
                  fieldId={hostnames[0] !== undefined ? `hostname-0` : 'hostnames'}
                >
                  <Button
                    variant={ButtonVariant.link}
                    icon={<PlusCircleIcon />}
                    onClick={addHostnameField}
                    isInline
                    style={{ marginBottom: '16px' }}
                  >
                    {t('Add hostname')}
                  </Button>
                  {hostnames.map((hostname, index) => (
                    <div
                      key={index}
                      className="pf-v6-c-form__group-control"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '8px',
                      }}
                    >
                      <TextInput
                        type="text"
                        id={`hostname-${index}`}
                        value={hostname}
                        onChange={(_, value) => updateHostname(value, index)}
                        placeholder={t('example.com')}
                      />
                      <Button
                        variant={ButtonVariant.link}
                        icon={<MinusCircleIcon />}
                        isDanger
                        onClick={() => removeHostnameField(index)}
                      >
                        {t('Remove')}
                      </Button>
                    </div>
                  ))}
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>{t('Hostnames for this HTTPRoute')}</HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
                <FormGroup label={t('Rules')} fieldId="rules">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-end',
                      gap: '16px',
                      marginBottom: '16px',
                    }}
                  >
                    <FormGroup label={t('Rule type')} fieldId="rule-type">
                      <FormSelect
                        id="rule-type"
                        value={selectedRuleType}
                        onChange={(_e, value) => setSelectedRuleType(value as RuleType)}
                        aria-label={t('Select rule type')}
                      >
                        {(Object.keys(RULE_TYPE_LABELS) as RuleType[]).map((ruleType) => (
                          <FormSelectOption
                            key={ruleType}
                            value={ruleType}
                            label={t(RULE_TYPE_LABELS[ruleType])}
                          />
                        ))}
                      </FormSelect>
                    </FormGroup>
                    <Button variant="secondary" icon={<PlusCircleIcon />} onClick={handleAddRule}>
                      {t('Add rule')}
                    </Button>
                  </div>

                  {rules.length === 0 && (
                    <Alert
                      variant={AlertVariant.warning}
                      isInline
                      title={t('No rules defined. HTTPRoute will use default routing.')}
                    />
                  )}

                  {rules.length > 0 && !isRuleModalOpen && (
                    <>
                      {rules.map((rule, index) => {
                        const match = rule.matches?.[0];
                        return (
                          <FormFieldGroupExpandable
                            key={rule.id || index}
                            isExpanded
                            toggleAriaLabel={t(RULE_TYPE_LABELS[rule.ruleType])}
                            header={
                              <FormFieldGroupHeader
                                titleText={{
                                  text: t(RULE_TYPE_LABELS[rule.ruleType]),
                                  id: `rule-${rule.id || index}`,
                                }}
                                actions={
                                  <>
                                    <Button
                                      variant="link"
                                      icon={<EditIcon />}
                                      onClick={() => handleEditRule(index)}
                                    >
                                      {t('Edit')}
                                    </Button>
                                    <Button
                                      variant="link"
                                      icon={<TrashIcon />}
                                      isDanger
                                      onClick={() => handleRemoveRule(index)}
                                    >
                                      {t('Remove')}
                                    </Button>
                                  </>
                                }
                              />
                            }
                            style={{
                              marginBottom: '16px',
                              border: '1px solid var(--pf-t--global--border--color--default)',
                              borderRadius: '4px',
                            }}
                          >
                            <div style={{ paddingRight: '16px', display: 'grid', gap: '8px' }}>
                              {rule.ruleType === 'path' && (
                                <>
                                  <div>
                                    <strong>{t('Match type')}:</strong> {match?.pathType || '—'}
                                  </div>
                                  <div>
                                    <strong>{t('Path match')}:</strong> {match?.pathValue || '—'}
                                  </div>
                                </>
                              )}
                              {rule.ruleType === 'method' && (
                                <div>
                                  <strong>{t('HTTP method')}:</strong> {match?.method || '—'}
                                </div>
                              )}
                              {rule.ruleType === 'header' &&
                                (match?.headers?.length ? (
                                  match.headers.map((header) => (
                                    <div key={header.id}>
                                      <strong>{t('Header')}</strong> ({header.type}): {header.name}{' '}
                                      = {header.value}
                                    </div>
                                  ))
                                ) : (
                                  <div>—</div>
                                ))}
                              {rule.ruleType === 'query' &&
                                (match?.queryParams?.length ? (
                                  match.queryParams.map((queryParam) => (
                                    <div key={queryParam.id}>
                                      <strong>{t('Query param')}</strong> ({queryParam.type}):{' '}
                                      {queryParam.name} = {queryParam.value}
                                    </div>
                                  ))
                                ) : (
                                  <div>—</div>
                                ))}
                              {rule.filters && rule.filters.length > 0 && (
                                <div>
                                  <strong>{t('Filters')}:</strong>{' '}
                                  {rule.filters.map((filter, idx: number) => (
                                    <span key={idx}>{getFilterSummary(filter, t)} </span>
                                  ))}
                                </div>
                              )}
                              <div>
                                <strong>{t('Backend')}:</strong>{' '}
                                {rule.serviceName ? `${rule.serviceName}:${rule.servicePort}` : '—'}
                              </div>
                            </div>
                          </FormFieldGroupExpandable>
                        );
                      })}
                    </>
                  )}

                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>
                        {t('Rules define how to route HTTP requests to backend services')}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>

                <ActionGroup>
                  <KuadrantCreateUpdate
                    validation={formValidation()}
                    model={httpRouteModel}
                    resource={httpRouteObject}
                    policyType="HTTPRoute"
                    navigate={navigate}
                    redirectPath={redirectPath}
                    update={isEdit}
                  />
                  <Button variant="link" onClick={() => handleCancel(navigate)}>
                    {t('Cancel')}
                  </Button>
                </ActionGroup>
              </Form>
            </PageSection>
          </Tab>
          <Tab eventKey="yaml" title={<TabTitleText>{t('YAML')}</TabTitleText>}>
            <div className="kuadrant-httproute-yaml-editor">
              {yamlError && (
                <Alert
                  variant="warning"
                  title={t('Error: YAML Validation')}
                  isInline
                  className="pf-v6-u-mt-md"
                >
                  {yamlError}
                </Alert>
              )}
              {createView === 'yaml' && (
                <React.Suspense fallback={<div>{t('Loading YAML editor...')}</div>}>
                  <ResourceYAMLEditor
                    initialResource={yamlContent}
                    onChange={handleYAMLChange}
                    create={!isEdit}
                  />
                </React.Suspense>
              )}
            </div>
          </Tab>
        </Tabs>
      </PageSection>
      <Modal
        variant="large"
        title={editingRuleIndex !== null ? t('Edit rule') : t('Add rule')}
        isOpen={isRuleModalOpen}
      >
        <HTTPRouteRuleWizard
          isOpen={isRuleModalOpen}
          onClose={handleRuleModalClose}
          onSave={handleRuleSave}
          currentRule={currentRule}
          setCurrentRule={(rule) =>
            setCurrentRule((prev) => ({ ...rule, ruleType: prev.ruleType }))
          }
          editingRuleIndex={editingRuleIndex}
          t={t}
        />
      </Modal>
    </>
  );
};

export default HTTPRouteCreatePage;
