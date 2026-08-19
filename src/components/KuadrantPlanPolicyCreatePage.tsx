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
  Tabs,
  Tab,
  TabTitleText,
  Button,
  ActionGroup,
  Card,
  CardBody,
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

interface PlanLimit {
  daily?: number | null;
  weekly?: number | null;
  monthly?: number | null;
  yearly?: number | null;
  custom?: { limit: number; window: string }[];
}

interface Plan {
  tier: string;
  predicate: string;
  limits: PlanLimit;
}

const KuadrantPlanPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');
  const [policyName, setPolicyName] = React.useState('');
  const [selectedNamespace] = useActiveNamespace();
  const [selectedRoute, setSelectedRoute] = React.useState<{ name: string; namespace: string }>({
    name: '',
    namespace: '',
  });
  const [plans, setPlans] = React.useState<Plan[]>([
    { tier: '', predicate: '', limits: { daily: null } },
  ]);
  const [creationTimestamp, setCreationTimestamp] = React.useState('');
  const [resourceVersion, setResourceVersion] = React.useState('');
  const [formDisabled, setFormDisabled] = React.useState(false);
  const [create, setCreate] = React.useState(true);

  const createPlanPolicy = () => {
    return {
      apiVersion:
        resourceGVKMapping['PlanPolicy'].group + '/' + resourceGVKMapping['PlanPolicy'].version,
      kind: resourceGVKMapping['PlanPolicy'].kind,
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
        plans: plans
          .filter((p) => p.tier !== '')
          .map((p) => {
            const limits: Record<string, unknown> = {};
            if (p.limits.daily !== null && p.limits.daily !== undefined)
              limits.daily = p.limits.daily;
            if (p.limits.weekly !== null && p.limits.weekly !== undefined)
              limits.weekly = p.limits.weekly;
            if (p.limits.monthly !== null && p.limits.monthly !== undefined)
              limits.monthly = p.limits.monthly;
            if (p.limits.yearly !== null && p.limits.yearly !== undefined)
              limits.yearly = p.limits.yearly;
            if (p.limits.custom && p.limits.custom.length > 0) limits.custom = p.limits.custom;
            return {
              tier: p.tier,
              predicate: p.predicate,
              ...(Object.keys(limits).length > 0 ? { limits } : {}),
            };
          }),
      },
    };
  };

  const [yamlInput, setYamlInput] = React.useState(createPlanPolicy);
  const planPolicy = createPlanPolicy();
  const planPolicyGVK = getGroupVersionKindForResource({
    apiVersion: `${resourceGVKMapping['PlanPolicy'].group}/${resourceGVKMapping['PlanPolicy'].version}`,
    kind: resourceGVKMapping['PlanPolicy'].kind,
  });
  const [planPolicyModel] = useK8sModel({
    group: planPolicyGVK.group,
    version: planPolicyGVK.version,
    kind: planPolicyGVK.kind,
  });

  const navigate = useNavigate();
  const location = useLocation();
  const pathSplit = location.pathname.split('/');
  const nameEdit = pathSplit[6];
  const namespaceEdit = pathSplit[3];

  interface PlanPolicyEdit extends K8sResourceCommon {
    spec?: {
      targetRef?: {
        group?: string;
        kind?: string;
        name?: string;
      };
      plans?: Plan[];
    };
  }

  const planResource = nameEdit
    ? {
        groupVersionKind: planPolicyGVK,
        isList: false,
        name: nameEdit,
        namespace: namespaceEdit,
      }
    : null;

  const [planData, planLoaded, planError] = useK8sWatchResource(planResource);

  const hasInitializedFromResource = React.useRef(false);

  React.useEffect(() => {
    if (planLoaded && !planError && planData) {
      if (!Array.isArray(planData)) {
        const planPolicyUpdate = planData as PlanPolicyEdit;
        // Always keep resourceVersion/creationTimestamp current so Save doesn't
        // send a stale resourceVersion and hit a 409 conflict once the
        // controller writes status back to the resource.
        setCreationTimestamp(planPolicyUpdate.metadata?.creationTimestamp || '');
        setResourceVersion(planPolicyUpdate.metadata?.resourceVersion || '');
        if (!hasInitializedFromResource.current) {
          setFormDisabled(true);
          setCreate(false);
          setPolicyName(planPolicyUpdate.metadata?.name || '');
          setSelectedRoute({
            name: planPolicyUpdate.spec?.targetRef?.name || '',
            namespace: planPolicyUpdate.metadata?.namespace || '',
          });
          setPlans(
            planPolicyUpdate.spec?.plans || [{ tier: '', predicate: '', limits: { daily: null } }],
          );
          hasInitializedFromResource.current = true;
        }
      }
    } else if (planError) {
      console.error('Failed to fetch the resource:', planError);
    }
  }, [planData, planLoaded, planError]);

  const handleYAMLChange = (yamlInput: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsedYaml = yaml.load(yamlInput) as Record<string, any>;
      setPolicyName(parsedYaml.metadata?.name || '');
      setSelectedRoute({
        name: parsedYaml.spec?.targetRef?.name || '',
        namespace: parsedYaml.metadata?.namespace || '',
      });
      setPlans(parsedYaml.spec?.plans || [{ tier: '', predicate: '', limits: { daily: null } }]);
    } catch (e) {
      console.error(t('Error parsing YAML:'), e);
    }
  };

  React.useEffect(() => {
    setYamlInput(planPolicy);
  }, [policyName, selectedNamespace, selectedRoute, plans, creationTimestamp, resourceVersion]);

  const addPlan = () => {
    setPlans([...plans, { tier: '', predicate: '', limits: { daily: null } }]);
  };

  const removePlan = (index: number) => {
    if (plans.length > 1) {
      setPlans(plans.filter((_, i) => i !== index));
    }
  };

  const updatePlan = (index: number, field: keyof Plan, value: string | PlanLimit) => {
    const updated = [...plans];
    updated[index] = { ...updated[index], [field]: value };
    setPlans(updated);
  };

  const isFormValid = !!(
    policyName &&
    selectedRoute.name &&
    plans.some((p) => p.tier !== '') &&
    plans.filter((p) => p.tier !== '').every((p) => p.predicate !== '')
  );

  const handleCancelResource = () => {
    handleCancel(navigate);
  };

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">
          {create ? t('Create Plan Policy') : t('Edit Plan Policy')}
        </title>
      </Helmet>
      <PageSection hasBodyWrapper={false}>
        <div className="co-m-nav-title">
          <Title headingLevel="h1">
            {create ? t('Create Plan Policy') : t('Edit Plan Policy')}
          </Title>
          <p className="help-block">
            {t('PlanPolicy configures plan-based rate limiting for your HTTPRoute')}
          </p>
        </div>
        <Tabs activeKey={createView} onSelect={(_e, key) => setCreateView(key as 'form' | 'yaml')}>
          <Tab eventKey="form" title={<TabTitleText>{t('Form')}</TabTitleText>}>
            <PageSection hasBodyWrapper={false}>
              <Form className="co-m-pane__form">
                <FormGroup label={t('Policy Name')} isRequired fieldId="policy-name">
                  <TextInput
                    isRequired
                    type="text"
                    id="policy-name"
                    name="policy-name"
                    value={policyName}
                    onChange={(_event, val) => setPolicyName(val)}
                    isDisabled={formDisabled}
                    placeholder={t('Policy name')}
                  />
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>{t('Unique name of the Plan Policy')}</HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>

                <FormGroup label={t('Target HTTPRoute')} isRequired fieldId="target-route">
                  <HTTPRouteSelect
                    selectedRoute={selectedRoute}
                    onChange={setSelectedRoute}
                    isDisabled={formDisabled}
                  />
                </FormGroup>

                <FormGroup label={t('Plans')} fieldId="plans">
                  {plans.map((plan, i) => (
                    <Card key={i} className="pf-u-mb-sm pf-u-p-md" isPlain>
                      <CardBody>
                        <Title headingLevel="h3" size="md" className="pf-u-mb-md">
                          {t('Plan')} {i + 1}
                        </Title>
                        <FormGroup label={t('Tier')} isRequired fieldId={`plan-tier-${i}`}>
                          <TextInput
                            isRequired
                            type="text"
                            id={`plan-tier-${i}`}
                            value={plan.tier}
                            onChange={(_event, val) => updatePlan(i, 'tier', val)}
                            placeholder="e.g. gold, silver, free"
                          />
                        </FormGroup>
                        <FormGroup
                          label={t('Predicate')}
                          isRequired
                          fieldId={`plan-predicate-${i}`}
                          className="pf-u-mt-md"
                        >
                          <TextInput
                            isRequired
                            type="text"
                            id={`plan-predicate-${i}`}
                            value={plan.predicate}
                            onChange={(_event, val) => updatePlan(i, 'predicate', val)}
                            placeholder='e.g. auth.identity.tier == "gold"'
                          />
                          <FormHelperText>
                            <HelperText>
                              <HelperTextItem>
                                {t("CEL expression to match this plan's subscribers")}
                              </HelperTextItem>
                            </HelperText>
                          </FormHelperText>
                        </FormGroup>
                        <FormGroup
                          label={t('Daily Limit')}
                          fieldId={`plan-daily-${i}`}
                          className="pf-u-mt-md"
                        >
                          <TextInput
                            type="text"
                            id={`plan-daily-${i}`}
                            value={plan.limits.daily ?? ''}
                            onChange={(_event, val) => {
                              if (val === '' || /^\d+$/.test(val)) {
                                updatePlan(i, 'limits', {
                                  ...plan.limits,
                                  daily: val === '' ? null : Number(val),
                                });
                              }
                            }}
                            placeholder="e.g. 1000"
                          />
                          <FormHelperText>
                            <HelperText>
                              <HelperTextItem>
                                {t('Maximum requests per day (optional)')}
                              </HelperTextItem>
                            </HelperText>
                          </FormHelperText>
                        </FormGroup>
                        <FormGroup
                          label={t('Weekly Limit')}
                          fieldId={`plan-weekly-${i}`}
                          className="pf-u-mt-md"
                        >
                          <TextInput
                            type="text"
                            id={`plan-weekly-${i}`}
                            value={plan.limits.weekly ?? ''}
                            onChange={(_event, val) => {
                              if (val === '' || /^\d+$/.test(val)) {
                                updatePlan(i, 'limits', {
                                  ...plan.limits,
                                  weekly: val === '' ? null : Number(val),
                                });
                              }
                            }}
                            placeholder="e.g. 5000"
                          />
                          <FormHelperText>
                            <HelperText>
                              <HelperTextItem>
                                {t('Maximum requests per week (optional)')}
                              </HelperTextItem>
                            </HelperText>
                          </FormHelperText>
                        </FormGroup>
                        <FormGroup
                          label={t('Monthly Limit')}
                          fieldId={`plan-monthly-${i}`}
                          className="pf-u-mt-md"
                        >
                          <TextInput
                            type="text"
                            id={`plan-monthly-${i}`}
                            value={plan.limits.monthly ?? ''}
                            onChange={(_event, val) => {
                              if (val === '' || /^\d+$/.test(val)) {
                                updatePlan(i, 'limits', {
                                  ...plan.limits,
                                  monthly: val === '' ? null : Number(val),
                                });
                              }
                            }}
                            placeholder="e.g. 20000"
                          />
                          <FormHelperText>
                            <HelperText>
                              <HelperTextItem>
                                {t('Maximum requests per month (optional)')}
                              </HelperTextItem>
                            </HelperText>
                          </FormHelperText>
                        </FormGroup>
                        <FormGroup
                          label={t('Yearly Limit')}
                          fieldId={`plan-yearly-${i}`}
                          className="pf-u-mt-md"
                        >
                          <TextInput
                            type="text"
                            id={`plan-yearly-${i}`}
                            value={plan.limits.yearly ?? ''}
                            onChange={(_event, val) => {
                              if (val === '' || /^\d+$/.test(val)) {
                                updatePlan(i, 'limits', {
                                  ...plan.limits,
                                  yearly: val === '' ? null : Number(val),
                                });
                              }
                            }}
                            placeholder="e.g. 100000"
                          />
                          <FormHelperText>
                            <HelperText>
                              <HelperTextItem>
                                {t('Maximum requests per year (optional)')}
                              </HelperTextItem>
                            </HelperText>
                          </FormHelperText>
                        </FormGroup>
                        <FormGroup
                          label={t('Custom Limits')}
                          fieldId={`plan-custom-${i}`}
                          className="pf-u-mt-md"
                        >
                          <FormHelperText>
                            <HelperText>
                              <HelperTextItem>
                                {t('Custom rate limits (limit + time window, e.g. 500 per 1h)')}
                              </HelperTextItem>
                            </HelperText>
                          </FormHelperText>
                          {(plan.limits.custom || []).map((entry, j) => (
                            <div
                              key={j}
                              className="pf-u-display-flex pf-u-align-items-center pf-u-mt-sm"
                            >
                              <TextInput
                                type="text"
                                id={`plan-custom-limit-${i}-${j}`}
                                value={entry.limit}
                                onChange={(_event, val) => {
                                  if (val === '' || /^\d+$/.test(val)) {
                                    const updated = [...(plan.limits.custom || [])];
                                    updated[j] = {
                                      ...updated[j],
                                      limit: val === '' ? 0 : Number(val),
                                    };
                                    updatePlan(i, 'limits', { ...plan.limits, custom: updated });
                                  }
                                }}
                                placeholder={t('Limit')}
                                style={{ width: '120px', marginRight: '8px' }}
                              />
                              <TextInput
                                type="text"
                                id={`plan-custom-window-${i}-${j}`}
                                value={entry.window}
                                onChange={(_event, val) => {
                                  const updated = [...(plan.limits.custom || [])];
                                  updated[j] = { ...updated[j], window: val };
                                  updatePlan(i, 'limits', { ...plan.limits, custom: updated });
                                }}
                                placeholder="e.g. 1h, 60s"
                                style={{ width: '120px', marginRight: '8px' }}
                              />
                              <Button
                                variant="plain"
                                aria-label={t('Remove custom limit')}
                                onClick={() => {
                                  const updated = (plan.limits.custom || []).filter(
                                    (_, idx) => idx !== j,
                                  );
                                  updatePlan(i, 'limits', { ...plan.limits, custom: updated });
                                }}
                              >
                                ✕
                              </Button>
                            </div>
                          ))}
                          <Button
                            variant="link"
                            className="pf-u-mt-sm"
                            onClick={() => {
                              const updated = [
                                ...(plan.limits.custom || []),
                                { limit: 0, window: '' },
                              ];
                              updatePlan(i, 'limits', { ...plan.limits, custom: updated });
                            }}
                          >
                            {t('Add Custom Limit')}
                          </Button>
                        </FormGroup>
                        <div className="pf-u-mt-md">
                          <Button
                            variant="danger"
                            onClick={() => removePlan(i)}
                            isDisabled={plans.length === 1}
                          >
                            {t('Remove Plan')}
                          </Button>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                  <div className="pf-u-mt-md">
                    <Button variant="secondary" onClick={addPlan}>
                      {t('Add Plan')}
                    </Button>
                  </div>
                </FormGroup>

                <ActionGroup className="pf-u-mt-0">
                  <KuadrantCreateUpdate
                    model={planPolicyModel}
                    resource={planPolicy}
                    policyType="plan"
                    navigate={navigate}
                    validation={isFormValid}
                  />
                  <Button variant="link" onClick={handleCancelResource}>
                    {t('Cancel')}
                  </Button>
                </ActionGroup>
              </Form>
            </PageSection>
          </Tab>
          <Tab eventKey="yaml" title={<TabTitleText>{t('YAML')}</TabTitleText>}>
            <div className="kuadrant-planpolicy-yaml-editor">
              {createView === 'yaml' && (
                <React.Suspense fallback={<div>{t('Loading...')}</div>}>
                  <ResourceYAMLEditor
                    initialResource={yamlInput}
                    create={create}
                    onChange={handleYAMLChange}
                  />
                </React.Suspense>
              )}
            </div>
          </Tab>
        </Tabs>
      </PageSection>
    </>
  );
};

export default KuadrantPlanPolicyCreatePage;
