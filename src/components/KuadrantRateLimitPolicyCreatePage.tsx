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
  Tabs,
  Tab,
  TabTitleText,
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
import { useNavigate, useLocation } from 'react-router';
import { GatewayResource } from './gateway/types';
import GatewaySelect from './gateway/GatewaySelect';
import HTTPRouteSelect, { RouteKind } from './httproute/HTTPRouteSelect';
import LimitSelect from './ratelimitpolicy/LimitSelect';
import { LimitConfig, TargetRef } from './ratelimitpolicy/types';
import * as yaml from 'js-yaml';
import KuadrantCreateUpdate from './KuadrantCreateUpdate';
import { handleCancel } from '../utils/cancel';
import { resourceGVKMapping } from '../utils/resources';

const GATEWAY_API_GROUP = 'gateway.networking.k8s.io';

const KuadrantRateLimitPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');
  const [policyName, setPolicyName] = React.useState('');
  const [selectedNamespace] = useActiveNamespace();
  const [limits, setLimits] = React.useState<Record<string, LimitConfig>>({});
  // targetRef is the single source of truth for the selected target resource
  // (group/kind/name). The target type radio and resource selectors all derive
  // from and update this state atomically — name and kind are never set
  // through separate setters, which prevents saving a Gateway name under an
  // HTTPRoute/GRPCRoute kind (or vice versa).
  const [targetRef, setTargetRef] = React.useState<TargetRef>({
    group: GATEWAY_API_GROUP,
    kind: 'Gateway',
    name: '',
  });
  const [creationTimestamp, setCreationTimestamp] = React.useState('');
  const [resourceVersion, setResourceVersion] = React.useState('');
  const [formDisabled, setFormDisabled] = React.useState(false);
  const [create, setCreate] = React.useState(true);

  function createRateLimitPolicy() {
    return {
      apiVersion:
        resourceGVKMapping['RateLimitPolicy'].group +
        '/' +
        resourceGVKMapping['RateLimitPolicy'].version,
      kind: resourceGVKMapping['RateLimitPolicy'].kind,
      metadata: {
        name: policyName,
        namespace: selectedNamespace,
        ...(creationTimestamp ? { creationTimestamp } : {}),
        ...(resourceVersion ? { resourceVersion } : {}),
      },
      spec: {
        targetRef: {
          group: targetRef.group,
          kind: targetRef.kind,
          name: targetRef.name,
        },
        limits,
      },
    };
  }

  const [yamlInput, setYamlInput] = React.useState(createRateLimitPolicy);
  const rateLimitPolicy = createRateLimitPolicy();
  const rateLimitPolicyGVK = getGroupVersionKindForResource({
    apiVersion: `${resourceGVKMapping['RateLimitPolicy'].group}/${resourceGVKMapping['RateLimitPolicy'].version}`,
    kind: resourceGVKMapping['RateLimitPolicy'].kind,
  });
  const [rateLimitPolicyModel] = useK8sModel({
    group: rateLimitPolicyGVK.group,
    version: rateLimitPolicyGVK.version,
    kind: rateLimitPolicyGVK.kind,
  });

  const navigate = useNavigate();
  const location = useLocation();
  const pathSplit = location.pathname.split('/');
  const nameEdit = pathSplit[6];
  const namespaceEdit = pathSplit[3];

  interface RateLimitPolicyEdit extends K8sResourceCommon {
    spec?: {
      targetRef?: {
        group?: string;
        kind?: string;
        name?: string;
        namespace?: string;
      };
      limits?: Record<string, LimitConfig>;
    };
  }

  const rateLimitResource = nameEdit
    ? {
        groupVersionKind: rateLimitPolicyGVK,
        isList: false,
        name: nameEdit,
        namespace: namespaceEdit,
      }
    : null;

  const [rlData, rlLoaded, rlError] = useK8sWatchResource(rateLimitResource);

  React.useEffect(() => {
    if (rlLoaded && !rlError && rlData) {
      if (!Array.isArray(rlData)) {
        const rlPolicyUpdate = rlData as RateLimitPolicyEdit;
        setCreationTimestamp(rlPolicyUpdate.metadata?.creationTimestamp || '');
        setResourceVersion(rlPolicyUpdate.metadata?.resourceVersion || '');
        setFormDisabled(true);
        setCreate(false);
        setPolicyName(rlPolicyUpdate.metadata?.name || '');
        // Set targetRef atomically from the loaded resource so kind and name
        // always stay in sync. The target type radio derives from
        // targetRef.kind, so it follows automatically. Fall back to the policy
        // namespace when the targetRef doesn't carry one (matches the resource
        // selector value format used by the form).
        const loadedTargetRef = rlPolicyUpdate.spec?.targetRef;
        const fallbackNamespace = loadedTargetRef?.namespace || rlPolicyUpdate.metadata?.namespace;
        setTargetRef({
          group: loadedTargetRef?.group || GATEWAY_API_GROUP,
          kind: (loadedTargetRef?.kind as TargetRef['kind']) || 'Gateway',
          name: loadedTargetRef?.name || '',
          ...(fallbackNamespace ? { namespace: fallbackNamespace } : {}),
        });
        setLimits(rlPolicyUpdate.spec?.limits || {});
      }
    } else if (rlError) {
      console.error('Failed to fetch the resource:', rlError);
    }
  }, [rlData, rlLoaded, rlError]);

  const handleYAMLChange = (yamlInputStr: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsedYaml = yaml.load(yamlInputStr) as Record<string, any>;
      setPolicyName(parsedYaml.metadata?.name || '');
      // Set targetRef atomically from parsed YAML so kind/name stay in sync.
      setTargetRef({
        group: parsedYaml.spec?.targetRef?.group || GATEWAY_API_GROUP,
        kind: (parsedYaml.spec?.targetRef?.kind as TargetRef['kind']) || 'Gateway',
        name: parsedYaml.spec?.targetRef?.name || '',
        ...(parsedYaml.spec?.targetRef?.namespace
          ? { namespace: parsedYaml.spec?.targetRef?.namespace }
          : {}),
      });
      setLimits(parsedYaml.spec?.limits || {});
    } catch (e) {
      console.error(t('Error parsing YAML:'), e);
    }
  };

  React.useEffect(() => {
    setYamlInput(rateLimitPolicy);
  }, [policyName, selectedNamespace, targetRef, limits, creationTimestamp, resourceVersion]);

  const handlePolicyChange = (_event, policy: string) => {
    setPolicyName(policy);
  };

  const handleTargetTypeChange = (kind: TargetRef['kind']) => {
    // Reset the selected resource and update kind/group atomically so a
    // stale name from a different kind can never be persisted.
    setTargetRef({ group: GATEWAY_API_GROUP, kind, name: '' });
  };

  const handleGatewayChange = (gw: GatewayResource) => {
    setTargetRef({
      group: GATEWAY_API_GROUP,
      kind: 'Gateway',
      name: gw.metadata?.name ?? '',
      ...(gw.metadata?.namespace ? { namespace: gw.metadata.namespace } : {}),
    });
  };

  const handleRouteChange = (kind: RouteKind) => (route: { name: string; namespace: string }) => {
    setTargetRef({
      group: GATEWAY_API_GROUP,
      kind,
      name: route.name ?? '',
      ...(route.namespace ? { namespace: route.namespace } : {}),
    });
  };

  const handleCancelResource = () => {
    handleCancel(navigate);
  };

  // Derive the prop shapes the selectors expect from the canonical targetRef
  // state, so they can never drift independently.
  const selectedGateway: GatewayResource = React.useMemo(
    () =>
      ({
        metadata: {
          name: targetRef.kind === 'Gateway' ? targetRef.name : '',
          namespace: targetRef.kind === 'Gateway' ? targetRef.namespace ?? '' : '',
        },
      } as GatewayResource),
    [targetRef],
  );

  const selectedRoute = React.useMemo(
    () => ({
      name: targetRef.kind === 'Gateway' ? '' : targetRef.name,
      namespace: targetRef.kind === 'Gateway' ? '' : targetRef.namespace ?? '',
    }),
    [targetRef],
  );

  const isFormValid = !!(policyName && targetRef.name);

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">
          {create ? t('Create RateLimit Policy') : t('Edit RateLimit Policy')}
        </title>
      </Helmet>
      <PageSection hasBodyWrapper={false}>
        <div className="co-m-nav-title">
          <Title headingLevel="h1">
            {create ? t('Create RateLimit Policy') : t('Edit RateLimit Policy')}
          </Title>
          <p className="help-block">
            {t('RateLimitPolicy configures rate limiting for your gateway')}
          </p>
        </div>
        <p className="help-block">{t('Use YAML view to apply advanced features')}</p>
        <Tabs activeKey={createView} onSelect={(_e, key) => setCreateView(key as 'form' | 'yaml')}>
          <Tab eventKey="form" title={<TabTitleText>{t('Form')}</TabTitleText>}>
            <PageSection hasBodyWrapper={false}>
              <Form className="co-m-pane__form">
                <FormGroup label={t('Policy name')} isRequired fieldId="policy-name">
                  <TextInput
                    isRequired
                    type="text"
                    id="policy-name"
                    name="policy-name"
                    value={policyName}
                    onChange={handlePolicyChange}
                    isDisabled={formDisabled}
                    placeholder={t('Policy name')}
                  />
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>{t('Unique name of the RateLimit Policy')}</HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
                <FormGroup
                  className="kuadrant-target-type-toggle"
                  role="radiogroup"
                  isInline
                  fieldId="target-type-radio-group"
                  label={t('Target Type')}
                >
                  <Radio
                    name="target-type-radio"
                    label={t('Gateway')}
                    id="target-type-radio-gateway"
                    isChecked={targetRef.kind === 'Gateway'}
                    onChange={() => handleTargetTypeChange('Gateway')}
                  />
                  <Radio
                    name="target-type-radio"
                    label={t('HTTPRoute')}
                    id="target-type-radio-httproute"
                    isChecked={targetRef.kind === 'HTTPRoute'}
                    onChange={() => handleTargetTypeChange('HTTPRoute')}
                  />
                  <Radio
                    name="target-type-radio"
                    label={t('GRPCRoute')}
                    id="target-type-radio-grpcroute"
                    isChecked={targetRef.kind === 'GRPCRoute'}
                    onChange={() => handleTargetTypeChange('GRPCRoute')}
                  />
                </FormGroup>
                {targetRef.kind === 'Gateway' && (
                  <GatewaySelect selectedGateway={selectedGateway} onChange={handleGatewayChange} />
                )}
                {targetRef.kind === 'HTTPRoute' && (
                  <HTTPRouteSelect
                    selectedRoute={selectedRoute}
                    onChange={handleRouteChange('HTTPRoute')}
                  />
                )}
                {targetRef.kind === 'GRPCRoute' && (
                  <HTTPRouteSelect
                    kind="GRPCRoute"
                    selectedRoute={selectedRoute}
                    onChange={handleRouteChange('GRPCRoute')}
                  />
                )}
                <LimitSelect limits={limits} setLimits={setLimits} />
                <ActionGroup className="pf-u-mt-0">
                  <KuadrantCreateUpdate
                    model={rateLimitPolicyModel}
                    resource={rateLimitPolicy}
                    policyType="ratelimit"
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
            <div className="kuadrant-ratelimitpolicy-yaml-editor">
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

export default KuadrantRateLimitPolicyCreatePage;
