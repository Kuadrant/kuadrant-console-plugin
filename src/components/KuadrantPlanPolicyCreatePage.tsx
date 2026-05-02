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
  Divider,
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
import HTTPRouteSelect from './httproute/HTTPRouteSelect';
import KuadrantCreateUpdate from './KuadrantCreateUpdate';
import { handleCancel } from '../utils/cancel';
import { resourceGVKMapping } from '../utils/resources';

interface PlanLimitForm {
  key: string;
  value: string;
}

interface PlanForm {
  tier: string;
  predicate: string;
  limits: PlanLimitForm[];
}

interface PlanPolicyEdit extends K8sResourceCommon {
  spec?: {
    targetRef?: {
      group?: string;
      kind?: string;
      name?: string;
      namespace?: string;
    };
    plans?: Array<{
      tier?: string;
      predicate?: string;
      limits?: Record<string, number>;
    }>;
  };
}

const emptyPlan = (): PlanForm => ({
  tier: '',
  predicate: '',
  limits: [{ key: 'daily', value: '' }],
});

const KuadrantPlanPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const navigate = useNavigate();
  const location = useLocation();
  const pathSplit = location.pathname.split('/');
  const nameEdit = pathSplit[6];
  const namespaceEdit = pathSplit[3];

  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');
  const [policyName, setPolicyName] = React.useState('');
  const [selectedNamespace] = useActiveNamespace();
  const [selectedRoute, setSelectedRoute] = React.useState({ name: '', namespace: '' });
  const [plans, setPlans] = React.useState<PlanForm[]>([
    { tier: '', predicate: '', limits: [{ key: 'daily', value: '' }] },
  ]);
  const [creationTimestamp, setCreationTimestamp] = React.useState('');
  const [resourceVersion, setResourceVersion] = React.useState('');
  const [formDisabled, setFormDisabled] = React.useState(false);
  const [create, setCreate] = React.useState(true);

  const normalizeLimits = (limits: PlanLimitForm[]) => {
    const filtered = limits.filter((limit) => limit.key.trim() !== '' && limit.value !== '');
    if (filtered.length === 0) {
      return undefined;
    }

    return filtered.reduce((acc, limit) => {
      const parsedValue = Number(limit.value);
      if (Number.isFinite(parsedValue)) {
        acc[limit.key.trim()] = parsedValue;
      }
      return acc;
    }, {} as Record<string, number>);
  };

  const toPlanForm = (plan: {
    tier?: string;
    predicate?: string;
    limits?: Record<string, number>;
  }) => {
    const parsedLimits = plan.limits
      ? Object.entries(plan.limits).map(([key, value]) => ({
          key,
          value: Number.isFinite(Number(value)) ? String(value) : '',
        }))
      : [];

    return {
      tier: plan.tier || '',
      predicate: plan.predicate || '',
      limits: parsedLimits.length > 0 ? parsedLimits : [{ key: 'daily', value: '' }],
    } as PlanForm;
  };

  const createPlanPolicy = () => {
    const planSpecs = plans
      .filter((plan) => plan.tier.trim() !== '')
      .map((plan) => {
        const limits = normalizeLimits(plan.limits);
        return {
          tier: plan.tier.trim(),
          ...(plan.predicate.trim() ? { predicate: plan.predicate } : {}),
          ...(limits ? { limits } : {}),
        };
      });

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
          ...(selectedRoute.namespace && selectedRoute.namespace !== selectedNamespace
            ? { namespace: selectedRoute.namespace }
            : {}),
        },
        ...(planSpecs.length > 0 ? { plans: planSpecs } : {}),
      },
    };
  };

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

  let planResource = null;
  if (nameEdit) {
    planResource = {
      groupVersionKind: planPolicyGVK,
      isList: false,
      name: nameEdit,
      namespace: namespaceEdit,
    };
  }

  const [planData, planLoaded, planError] = planResource
    ? useK8sWatchResource(planResource)
    : [null, false, null];

  React.useEffect(() => {
    if (planLoaded && !planError) {
      if (!Array.isArray(planData)) {
        const planPolicyUpdate = planData as PlanPolicyEdit;
        setCreationTimestamp(planPolicyUpdate.metadata.creationTimestamp);
        setResourceVersion(planPolicyUpdate.metadata.resourceVersion);
        setFormDisabled(true);
        setCreate(false);
        setPolicyName(planPolicyUpdate.metadata?.name || '');
        const targetRef = planPolicyUpdate.spec?.targetRef;
        setSelectedRoute({
          name: targetRef?.name || '',
          namespace: targetRef?.namespace || planPolicyUpdate.metadata?.namespace || '',
        });
        const parsedPlans = Array.isArray(planPolicyUpdate.spec?.plans)
          ? planPolicyUpdate.spec?.plans
          : [];
        setPlans(parsedPlans.length > 0 ? parsedPlans.map(toPlanForm) : [emptyPlan()]);
      }
    } else if (planError) {
      console.error('Failed to fetch the resource:', planError);
    }
  }, [planData, planLoaded, planError]);

  const [yamlInput, setYamlInput] = React.useState(createPlanPolicy);

  const handleYAMLChange = (rawYaml: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsedYaml = yaml.load(rawYaml) as Record<string, any>;
      setPolicyName(parsedYaml.metadata?.name || '');
      setSelectedRoute({
        name: parsedYaml.spec?.targetRef?.name || '',
        namespace: parsedYaml.spec?.targetRef?.namespace || parsedYaml.metadata?.namespace || '',
      });
      const parsedPlans = Array.isArray(parsedYaml.spec?.plans) ? parsedYaml.spec.plans : [];
      setPlans(parsedPlans.length > 0 ? parsedPlans.map(toPlanForm) : [emptyPlan()]);
    } catch (e) {
      console.error(t('Error parsing YAML:'), e);
    }
  };

  React.useEffect(() => {
    setYamlInput(planPolicy);
  }, [policyName, selectedNamespace, selectedRoute, plans, creationTimestamp, resourceVersion]);

  const handleNameChange = (_event, value: string) => {
    setPolicyName(value);
  };

  const addPlan = () => {
    setPlans((prevPlans) => [...prevPlans, emptyPlan()]);
  };

  const removePlan = (index: number) => {
    setPlans((prevPlans) => prevPlans.filter((_plan, planIndex) => planIndex !== index));
  };

  const updatePlan = (index: number, updated: Partial<PlanForm>) => {
    setPlans((prevPlans) =>
      prevPlans.map((plan, planIndex) => (planIndex === index ? { ...plan, ...updated } : plan)),
    );
  };

  const updatePlanLimit = (
    planIndex: number,
    limitIndex: number,
    field: 'key' | 'value',
    value: string,
  ) => {
    setPlans((prevPlans) =>
      prevPlans.map((plan, idx) => {
        if (idx !== planIndex) {
          return plan;
        }
        const updatedLimits = plan.limits.map((limit, lidx) =>
          lidx === limitIndex ? { ...limit, [field]: value } : limit,
        );
        return { ...plan, limits: updatedLimits };
      }),
    );
  };

  const addPlanLimit = (planIndex: number) => {
    setPlans((prevPlans) =>
      prevPlans.map((plan, idx) =>
        idx === planIndex ? { ...plan, limits: [...plan.limits, { key: '', value: '' }] } : plan,
      ),
    );
  };

  const removePlanLimit = (planIndex: number, limitIndex: number) => {
    setPlans((prevPlans) =>
      prevPlans.map((plan, idx) => {
        if (idx !== planIndex) {
          return plan;
        }
        const nextLimits = plan.limits.filter((_limit, lidx) => lidx !== limitIndex);
        return {
          ...plan,
          limits: nextLimits.length > 0 ? nextLimits : [{ key: 'daily', value: '' }],
        };
      }),
    );
  };

  const handleCancelResource = () => {
    handleCancel(selectedNamespace, planPolicy, navigate);
  };

  const isFormValid = () =>
    Boolean(policyName && selectedRoute.name && plans.some((plan) => plan.tier.trim() !== ''));

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">
          {create ? t('Create Plan Policy') : t('Edit Plan Policy')}
        </title>
      </Helmet>
      <PageSection hasBodyWrapper={false} className="pf-m-no-padding">
        <div className="co-m-nav-title">
          <Title headingLevel="h1">
            {create ? t('Create Plan Policy') : t('Edit Plan Policy')}
          </Title>
          <p className="help-block">
            {t('PlanPolicy defines consumption tiers and limits for an HTTPRoute')}
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
            <FormGroup label={t('Policy name')} isRequired fieldId="plan-policy-name">
              <TextInput
                isRequired
                type="text"
                id="plan-policy-name"
                name="plan-policy-name"
                value={policyName}
                onChange={handleNameChange}
                isDisabled={formDisabled}
                placeholder={t('Plan policy name')}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>{t('Unique name of the PlanPolicy')}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>

            <FormGroup label={t('HTTPRoute')} isRequired fieldId="plan-policy-httproute">
              <HTTPRouteSelect selectedRoute={selectedRoute} onChange={setSelectedRoute} />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>{t('Select an HTTPRoute to apply these plans')}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>

            <Title
              headingLevel="h2"
              size="md"
              style={{ marginTop: 'var(--pf-v6-global--spacer--md)' }}
            >
              {t('Plans')}
            </Title>
            {plans.map((plan, index) => (
              <div key={`plan-${index}`} style={{ marginTop: 'var(--pf-v6-global--spacer--md)' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Title headingLevel="h3" size="md">
                    {t('Plan {{index}}', { index: index + 1 })}
                  </Title>
                  <Button
                    variant="link"
                    isDisabled={plans.length === 1}
                    onClick={() => removePlan(index)}
                  >
                    {t('Remove plan')}
                  </Button>
                </div>
                <FormGroup label={t('Tier')} isRequired fieldId={`plan-tier-${index}`}>
                  <TextInput
                    isRequired
                    type="text"
                    id={`plan-tier-${index}`}
                    name={`plan-tier-${index}`}
                    value={plan.tier}
                    onChange={(_event, value) => updatePlan(index, { tier: value })}
                    isDisabled={formDisabled}
                    placeholder={t('e.g. gold, silver, bronze')}
                  />
                </FormGroup>
                <FormGroup label={t('Predicate')} fieldId={`plan-predicate-${index}`}>
                  <TextArea
                    id={`plan-predicate-${index}`}
                    name={`plan-predicate-${index}`}
                    value={plan.predicate}
                    onChange={(_event, value) => updatePlan(index, { predicate: value })}
                    isDisabled={formDisabled}
                    placeholder={t('Optional condition to match this tier')}
                    rows={3}
                  />
                </FormGroup>
                <FormGroup label={t('Limits')} fieldId={`plan-limits-${index}`}>
                  {plan.limits.map((limit, limitIndex) => (
                    <div
                      key={`plan-${index}-limit-${limitIndex}`}
                      style={{
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'center',
                        marginBottom: '8px',
                      }}
                    >
                      <TextInput
                        type="text"
                        id={`plan-limit-key-${index}-${limitIndex}`}
                        name={`plan-limit-key-${index}-${limitIndex}`}
                        value={limit.key}
                        onChange={(_event, value) =>
                          updatePlanLimit(index, limitIndex, 'key', value)
                        }
                        isDisabled={formDisabled}
                        placeholder={t('Limit name (e.g. daily)')}
                      />
                      <TextInput
                        type="number"
                        id={`plan-limit-value-${index}-${limitIndex}`}
                        name={`plan-limit-value-${index}-${limitIndex}`}
                        value={limit.value}
                        onChange={(_event, value) =>
                          updatePlanLimit(index, limitIndex, 'value', value)
                        }
                        isDisabled={formDisabled}
                        placeholder={t('Limit value')}
                      />
                      <Button
                        variant="link"
                        isDisabled={plan.limits.length === 1}
                        onClick={() => removePlanLimit(index, limitIndex)}
                      >
                        {t('Remove')}
                      </Button>
                    </div>
                  ))}
                  <Button variant="secondary" onClick={() => addPlanLimit(index)}>
                    {t('Add limit')}
                  </Button>
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>
                        {t('Limits define how many requests are allowed per tier')}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
                {index < plans.length - 1 ? <Divider /> : null}
              </div>
            ))}

            <Button variant="secondary" onClick={addPlan} style={{ marginTop: '12px' }}>
              {t('Add plan')}
            </Button>

            <ActionGroup className="pf-v6-u-mt-0">
              <KuadrantCreateUpdate
                model={planPolicyModel}
                resource={planPolicy}
                policyType="plan"
                navigate={navigate}
                validation={isFormValid()}
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
            create={create}
            onChange={handleYAMLChange}
          />
        </React.Suspense>
      )}
    </>
  );
};

export default KuadrantPlanPolicyCreatePage;
