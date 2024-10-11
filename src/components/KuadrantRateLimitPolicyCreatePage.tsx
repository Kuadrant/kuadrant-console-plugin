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
  AlertGroup,
  AlertVariant,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import './kuadrant.css';
import { k8sCreate, ResourceYAMLEditor, useActiveNamespace } from '@openshift-console/dynamic-plugin-sdk';
import { useHistory } from 'react-router-dom';
import { LimitConfig, RateLimitPolicy } from './ratelimitpolicy/types'
import getModelFromResource from '../utils/getModelFromResource';
import { Gateway } from './gateway/types';
import GatewaySelect from './gateway/GatewaySelect';
import HTTPRouteSelect from './httproute/HTTPRouteSelect';
import { HTTPRoute } from './httproute/types';
import LimitSelect from './ratelimitpolicy/LimitSelect';

const KuadrantRateLimitPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__console-plugin-template');
  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');
  const [policy, setPolicy] = React.useState('');
  const [selectedNamespace] = useActiveNamespace();
  const [selectedGateway, setSelectedGateway] = React.useState<Gateway>({ name: '', namespace: '' });
  const [selectedHTTPRoute, setSelectedHTTPRoute] = React.useState<HTTPRoute>({ name: '', namespace: '' });
  const [targetType, setTargetType] = React.useState<'gateway' | 'httproute'>('gateway');

  // State to hold all limit configurations
  const [limits, setLimits] = React.useState<Record<string, LimitConfig>>({});

  const [isCreateButtonDisabled, setIsCreateButtonDisabled] = React.useState(true);

  // Initialize the YAML resource object based on form state
  const [yamlResource, setYamlResource] = React.useState(() => {
    return {
      apiVersion: 'kuadrant.io/v1beta2',
      kind: 'RateLimitPolicy',
      metadata: {
        name: policy,
        namespace: selectedNamespace,
      },
      spec: {
        targetRef: {
          group: 'gateway.networking.k8s.io',
          kind: 'Gateway',
          name: selectedGateway.name,
          namespace: selectedGateway.namespace,
        },
        limits,
      },
    };
  });

  const history = useHistory();

  React.useEffect(() => {
    const updatedYamlResource = {
      apiVersion: 'kuadrant.io/v1beta2',
      kind: 'RateLimitPolicy',
      metadata: {
        name: policy,
        namespace: selectedNamespace,
      },
      spec: {
        targetRef: targetType === 'gateway'
          ? {
            group: 'gateway.networking.k8s.io',
            kind: 'Gateway',
            name: selectedGateway.name,
            namespace: selectedGateway.namespace,
          }
          : {
            group: 'gateway.networking.k8s.io',
            kind: 'HTTPRoute',
            name: selectedHTTPRoute.name,
            namespace: selectedHTTPRoute.namespace,
          },
        limits: { ...limits },
      },
    };

    setYamlResource(updatedYamlResource);

    // Check if the Create button should be enabled
    const isFormValid = policy && selectedNamespace && (selectedGateway.name || selectedHTTPRoute.name);
    setIsCreateButtonDisabled(!isFormValid); // Update the button state    
  }, [policy, selectedNamespace, targetType, selectedGateway, selectedHTTPRoute, limits]);

  const [errorAlertMsg, setErrorAlertMsg] = React.useState('')

  const handleCreateViewChange = (value: 'form' | 'yaml') => {
    setCreateView(value);
  };

  const handlePolicyChange = (_event, policy: string) => {
    setPolicy(policy);
  };

  const handleSubmit = async () => {
    if (isCreateButtonDisabled) return; // Early return if form is not valid
    setErrorAlertMsg('')
    const ratelimitPolicy: RateLimitPolicy = {
      apiVersion: 'kuadrant.io/v1beta2',
      kind: 'RateLimitPolicy',
      metadata: {
        name: policy,
        namespace: selectedNamespace,
      },
      spec: {
        targetRef: targetType === 'gateway'
          ? {
            group: 'gateway.networking.k8s.io',
            kind: 'Gateway',
            name: selectedGateway.name,
            namespace: selectedGateway.namespace,
          }
          : {
            group: 'gateway.networking.k8s.io',
            kind: 'HTTPRoute',
            name: selectedHTTPRoute.name,
            namespace: selectedHTTPRoute.namespace,
          },
        limits: { ...limits },
      },
    };

    try {
      await k8sCreate({
        model: getModelFromResource(ratelimitPolicy),
        data: ratelimitPolicy,
        ns: selectedNamespace,
      });
      history.push('/kuadrant/all-namespaces/policies/ratelimit'); // Navigate after successful creation
    } catch (error) {
      console.error(t('Error creating RateLimitPolicy'), error);
      setErrorAlertMsg(error.message)
    }
  };

  const handleCancel = () => {
    history.push('/kuadrant/all-namespaces/policies');
  };

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Create RateLimitPolicy')}</title>
      </Helmet>
      <PageSection variant='light' className='pf-m-no-padding'>
        <div className='co-m-nav-title'>
          <Title headingLevel="h1">{t('Create RateLimitPolicy')}</Title>
          <p className='help-block co-m-pane__heading-help-text'>
            <div>{t('RateLimitPolicy enables rate limiting for service workloads in a Gateway API network')}</div>
          </p>
        </div>
        <FormGroup className="kuadrant-editor-toggle" role="radiogroup" isInline hasNoPaddingTop fieldId="create-type-radio-group" label="Create via:">
          <Radio
            name="create-type-radio"
            label="Form"
            id="create-type-radio-form"
            isChecked={createView === 'form'}
            onChange={() => handleCreateViewChange('form')}
          />
          <Radio
            name="create-type-radio"
            label="YAML"
            id="create-type-radio-yaml"
            isChecked={createView === 'yaml'}
            onChange={() => handleCreateViewChange('yaml')}
          />
        </FormGroup>
      </PageSection>
      {createView === 'form' ? (
        <PageSection variant='light'>
          <Form className='co-m-pane__form'>
            <div>
              <FormGroup label={t('Policy Name')} isRequired fieldId="policy-name">
                <TextInput
                  isRequired
                  type="text"
                  id="policy-name"
                  name="policy-name"
                  value={policy}
                  onChange={handlePolicyChange}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>{t('Unique name of the RateLimitPolicy')}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
              <FormGroup role="radiogroup" isInline fieldId='target-type' label={t('Target reference type')} isRequired aria-labelledby="target-type-label">
                <Radio name='target-type' label='Gateway' id='target-type-gateway' isChecked={targetType === 'gateway'} onChange={() => setTargetType('gateway')} />
                <Radio name='target-type' label='HTTPRoute' id='target-type-httproute' isChecked={targetType === 'httproute'} onChange={() => setTargetType('httproute')} />
              </FormGroup>
              <div className="pf-u-ml-md">
                {targetType === 'gateway' ? (
                  <GatewaySelect selectedGateway={selectedGateway} onChange={setSelectedGateway} />
                ) : (
                  <HTTPRouteSelect selectedHTTPRoute={selectedHTTPRoute} onChange={setSelectedHTTPRoute} />
                )}
              </div>
              <LimitSelect limits={limits} setLimits={setLimits} />
            </div>
            <AlertGroup className="kuadrant-alert-group">
              <Alert
                variant="info"
                isInline
                title={t('To set defaults, overrides, and more complex limits, use the YAML view.')}
              />

              {errorAlertMsg != '' && (
                <Alert title={t('Error creating RateLimitPolicy')} variant={AlertVariant.danger} isInline>
                  {errorAlertMsg}
                </Alert>
              )}
            </AlertGroup>

            <ActionGroup>
              <Button variant={ButtonVariant.primary} onClick={handleSubmit} isDisabled={isCreateButtonDisabled}>
                {t('Create RateLimitPolicy')}
              </Button>
              <Button variant={ButtonVariant.secondary} onClick={handleCancel}>
                {t('Cancel')}
              </Button>
            </ActionGroup>
          </Form>
        </PageSection>
      ) : (
        <ResourceYAMLEditor initialResource={yamlResource} create />
      )}
    </>
  );
};

export default KuadrantRateLimitPolicyCreatePage;
