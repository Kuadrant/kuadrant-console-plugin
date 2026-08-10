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
  ButtonVariant,
  ActionGroup,
  Alert,
  Modal,
  AlertVariant,
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
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { HTTPRouteResource, HTTPRouteMatch } from './types';
import {
  generateFiltersForYAML,
  parseFiltersFromYAML,
  getFilterSummary,
} from './filters/filterUtils';
import {
  generateMatchesForYAML,
  parseMatchesFromYAML,
  validateMatchesInRule,
  formatMatchesForDisplay,
} from './matchUtils';
import HTTPRouteRuleWizard from './HTTPRouteRuleWizard';
import KuadrantCreateUpdate from '../KuadrantCreateUpdate';
import { handleCancel } from '../../utils/cancel';
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

const HTTPRouteCreatePage: React.FC<HTTPRouteCreatePageProps> = ({ onFormChange }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');
  const [routeName, setRouteName] = React.useState('');
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
  };
  const [rules, setRules] = React.useState<RuleUI[]>([]);
  const [isRuleModalOpen, setIsRuleModalOpen] = React.useState(false);

  const [currentRule, setCurrentRule] = React.useState<RuleUI>({
    id: 'rule-1',
    matches: [], // Array of match objects
    filters: [], // Filters array
    serviceName: '', // Backend service name
    servicePort: 80, // Backend service port
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
        const formattedRules = hr.spec.rules.map((rule, index: number) => ({
          id: rules[index]?.id || `rule-${index + 1}`,
          matches: parseMatchesFromYAML(rule.matches),
          filters: parseFiltersFromYAML(rule.filters),
          serviceName: rule.backendRefs?.[0]?.name || '',
          servicePort: rule.backendRefs?.[0]?.port || 80,
        }));
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
      try {
        setYamlContent(httpRouteObject);
      } catch (error) {
        console.error('Error setting YAML content:', error);
      }
    }
    setCreateView(newView);
  };

  const handleRouteNameChange = (_event: React.FormEvent<HTMLInputElement>, name: string) => {
    setRouteName(name);
  };

  const formValidation = () => {
    const hasValidParentRef = parentRefs.some((ref) => ref.gatewayName);

    const hasValidRules =
      rules.length > 0 &&
      rules.every((rule) => {
        const basicFieldsValid = rule.id && rule.serviceName && rule.servicePort > 0;

        const matchesValid = validateMatchesInRule(rule.matches);

        return basicFieldsValid && matchesValid;
      });

    return !!(routeName && hasValidParentRef && hasValidRules);
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
      matches: [],
      filters: [],
      serviceName: '',
      servicePort: 80,
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
        <div className="kuadrant-gateway-editor-toggle">
          <span>{t('Create via:')}</span>
          <Radio
            name="create-type-radio"
            label={t('Form')}
            id="create-type-radio-form"
            isChecked={createView === 'form'}
            onChange={() => handleViewSwitch('form')}
          />
          <Radio
            name="create-type-radio"
            label={t('YAML')}
            id="create-type-radio-yaml"
            isChecked={createView === 'yaml'}
            onChange={() => handleViewSwitch('yaml')}
          />
        </div>
      </PageSection>

      {createView === 'form' ? (
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
                isDisabled={isEdit}
                placeholder={t('HTTPRoute Name')}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>{t('Unique name of the HTTPRoute')}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>

            <ParentReferencesSelect parentRefs={parentRefs} onChange={setParentRefs} />

            <FormGroup
              label={t('Hostnames')}
              fieldId={hostnames[0] !== undefined ? `hostname-0` : 'hostnames'}
            >
              {hostnames.map((hostname, index) => (
                <div
                  key={index}
                  className="pf-v6-c-form__group-control"
                  style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}
                >
                  <TextInput
                    type="text"
                    id={`hostname-${index}`}
                    value={hostname}
                    onChange={(_, value) => updateHostname(value, index)}
                    placeholder={t('example.com')}
                  />
                  {hostnames.length > 0 && (
                    <Button
                      variant={ButtonVariant.plain}
                      onClick={() => removeHostnameField(index)}
                      aria-label="Remove hostname"
                    >
                      <MinusCircleIcon />
                    </Button>
                  )}
                </div>
              ))}
              {
                <Button
                  variant={ButtonVariant.link}
                  icon={<PlusCircleIcon />}
                  onClick={addHostnameField}
                  isInline
                >
                  {t('Add hostname')}
                </Button>
              }
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>{t('Hostnames for this HTTPRoute')}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            <FormGroup
              label={
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                  }}
                >
                  <div>{t('Rules')}</div>
                  <Button variant="secondary" icon={<PlusCircleIcon />} onClick={handleAddRule}>
                    {t('Add rule')}
                  </Button>
                </div>
              }
              fieldId="rules"
            >
              {rules.length === 0 && (
                <Alert
                  variant={AlertVariant.warning}
                  isInline
                  title={t('No rules defined. HTTPRoute will use default routing.')}
                />
              )}

              {rules.length > 0 && !isRuleModalOpen && (
                <Table aria-label={t('Rules table')} variant="compact" borders={false}>
                  <Thead>
                    <Tr>
                      <Th width={15}>{t('Rule ID')}</Th>
                      <Th width={25}>{t('Matches')}</Th>
                      <Th width={20}>{t('Filters')}</Th>
                      <Th width={30}>{t('Backend references')}</Th>
                      <Th width={10}>{t('Actions')}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {rules.map((rule, index) => (
                      <Tr key={rule.id || index}>
                        <Td dataLabel={t('Rule ID')}>
                          <strong>{rule.id}</strong>
                        </Td>
                        <Td dataLabel={t('Matches')}>
                          <span
                            style={{
                              color:
                                rule.matches?.length > 0
                                  ? 'inherit'
                                  : 'var(--pf-v6-global--Color--200)',
                            }}
                          >
                            {formatMatchesForDisplay(rule.matches)}
                          </span>
                        </Td>
                        <Td dataLabel={t('Filters')}>
                          {rule.filters && rule.filters.length > 0 ? (
                            <div>
                              {rule.filters.map((filter, idx: number) => (
                                <div key={idx}>{getFilterSummary(filter, t)}</div>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--pf-v6-global--Color--200)' }}>—</span>
                          )}
                        </Td>
                        <Td dataLabel={t('Backend references')}>
                          {rule.serviceName ? (
                            <div>
                              <strong>{rule.serviceName}:</strong> {rule.servicePort}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--pf-v6-global--Color--200)' }}>—</span>
                          )}
                        </Td>
                        <Td dataLabel={t('Actions')}>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <Button
                              variant="plain"
                              onClick={() => handleEditRule(index)}
                              aria-label={t('Edit rule')}
                            >
                              <EditIcon />
                            </Button>
                            <Button
                              variant="plain"
                              onClick={() => handleRemoveRule(index)}
                              isDanger
                              aria-label={t('Delete rule')}
                            >
                              <TrashIcon />
                            </Button>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
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
      ) : (
        <>
          {yamlError && (
            <PageSection>
              <Alert variant="warning" title={t('Error: YAML Validation')} isInline>
                {yamlError}
              </Alert>
            </PageSection>
          )}
          <React.Suspense fallback={<div>{t('Loading YAML editor...')}</div>}>
            <ResourceYAMLEditor
              initialResource={yamlContent}
              onChange={handleYAMLChange}
              create={!isEdit}
            />
          </React.Suspense>
        </>
      )}
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
          setCurrentRule={setCurrentRule}
          editingRuleIndex={editingRuleIndex}
          t={t}
        />
      </Modal>
    </>
  );
};

export default HTTPRouteCreatePage;
