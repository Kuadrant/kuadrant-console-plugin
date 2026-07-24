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
  Card,
  CardBody,
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
import HTTPRouteSelect from './httproute/HTTPRouteSelect';
import * as yaml from 'js-yaml';
import KuadrantCreateUpdate from './KuadrantCreateUpdate';
import { handleCancel } from '../utils/cancel';
import { resourceGVKMapping } from '../utils/resources';

interface PlanLimit {
  daily?: number | null;
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
          .map((p) => ({
            tier: p.tier,
            predicate: p.predicate,
            ...(p.limits.daily !== null ? { limits: { daily: p.limits.daily } } : {}),
          })),
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

  React.useEffect(() => {
    if (planLoaded && !planError && planData) {
      if (!Array.isArray(planData)) {
        const planPolicyUpdate = planData as PlanPolicyEdit;
        setCreationTimestamp(planPolicyUpdate.metadata?.creationTimestamp || '');
        setResourceVersion(planPolicyUpdate.metadata?.resourceVersion || '');
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
    plans.some((p) => p.tier !== '' && p.predicate !== '')
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
                      fieldId={`plan-limit-${i}`}
                      className="pf-u-mt-md"
                    >
                      <TextInput
                        type="text"
                        id={`plan-limit-${i}`}
                        value={plan.limits.daily ?? ''}
                        onChange={(_event, val) => {
                          if (val === '' || /^\d+$/.test(val)) {
                            updatePlan(i, 'limits', { daily: val === '' ? null : Number(val) });
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
