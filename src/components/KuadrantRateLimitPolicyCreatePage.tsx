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
import { useNavigate, useLocation } from 'react-router';
import { GatewayResource } from './gateway/types';
import GatewaySelect from './gateway/GatewaySelect';
import LimitSelect from './ratelimitpolicy/LimitSelect';
import { LimitConfig, TargetRef } from './ratelimitpolicy/types';
import * as yaml from 'js-yaml';
import KuadrantCreateUpdate from './KuadrantCreateUpdate';
import { handleCancel } from '../utils/cancel';
import { resourceGVKMapping } from '../utils/resources';

const KuadrantRateLimitPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');
  const [policyName, setPolicyName] = React.useState('');
  const [selectedNamespace] = useActiveNamespace();
  const [selectedGateway, setSelectedGateway] = React.useState<GatewayResource>(
    {} as GatewayResource,
  );
  const [limits, setLimits] = React.useState<Record<string, LimitConfig>>({});
  const [targetRef, setTargetRef] = React.useState<TargetRef>({
    group: 'gateway.networking.k8s.io',
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
          name: selectedGateway.metadata?.name ?? '',
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
        setSelectedGateway({
          metadata: {
            name: rlPolicyUpdate.spec?.targetRef?.name || '',
            namespace: rlPolicyUpdate.metadata?.namespace || '',
          },
        } as GatewayResource);
        setTargetRef({
          group: rlPolicyUpdate.spec?.targetRef?.group || 'gateway.networking.k8s.io',
          kind: (rlPolicyUpdate.spec?.targetRef?.kind as TargetRef['kind']) || 'Gateway',
          name: rlPolicyUpdate.spec?.targetRef?.name || '',
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
      setSelectedGateway({
        metadata: {
          name: parsedYaml.spec?.targetRef?.name || '',
          namespace: parsedYaml.metadata?.namespace || '',
        },
      } as GatewayResource);
      setTargetRef({
        group: parsedYaml.spec?.targetRef?.group || 'gateway.networking.k8s.io',
        kind: (parsedYaml.spec?.targetRef?.kind as TargetRef['kind']) || 'Gateway',
        name: parsedYaml.spec?.targetRef?.name || '',
      });
      setLimits(parsedYaml.spec?.limits || {});
    } catch (e) {
      console.error(t('Error parsing YAML:'), e);
    }
  };

  React.useEffect(() => {
    setYamlInput(rateLimitPolicy);
  }, [
    policyName,
    selectedNamespace,
    selectedGateway,
    limits,
    targetRef,
    creationTimestamp,
    resourceVersion,
  ]);

  const handlePolicyChange = (_event, policy: string) => {
    setPolicyName(policy);
  };

  const handleCancelResource = () => {
    handleCancel(navigate);
  };

  const isFormValid = !!(policyName && (selectedGateway.metadata?.name ?? ''));

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
            <GatewaySelect selectedGateway={selectedGateway} onChange={setSelectedGateway} />
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
      ) : (
        <React.Suspense fallback={<div>{t('Loading...')}</div>}>
          <ResourceYAMLEditor
            initialResource={yamlInput}
            create={create}
            onChange={handleYAMLChange}
          ></ResourceYAMLEditor>
        </React.Suspense>
      )}
    </>
  );
};

export default KuadrantRateLimitPolicyCreatePage;
