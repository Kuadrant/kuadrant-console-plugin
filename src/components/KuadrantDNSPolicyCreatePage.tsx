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
  ExpandableSection,
  ActionGroup,
  // AlertVariant,
  // Alert,
  // AlertGroup,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import './kuadrant.css';
import { ResourceYAMLEditor, getGroupVersionKindForResource, useK8sModel } from '@openshift-console/dynamic-plugin-sdk';
import { useHistory } from 'react-router-dom';
import { LoadBalancing, HealthCheck } from './dnspolicy/types'
import LoadBalancingField from './dnspolicy/LoadBalancingField';
import HealthCheckField from './dnspolicy/HealthCheckField';
// import getModelFromResource from '../utils/getModelFromResource';
import { Gateway } from './gateway/types';
import GatewaySelect from './gateway/GatewaySelect';
import NamespaceSelect from './namespace/NamespaceSelect';
// import { removeUndefinedFields, convertMatchLabelsArrayToObject } from '../utils/modelUtils';
import yaml from 'js-yaml';
import KuadrantCreateUpdate from './KuadrantCreateUpdate'
import { handleCancel } from '../utils/cancel';




const KuadrantDNSPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__console-plugin-template');
  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');
  const [policyName, setPolicyName] = React.useState('');
  const [selectedNamespace, setSelectedNamespace] = React.useState('');
  const [selectedGateway, setSelectedGateway] = React.useState<Gateway>({ name: '', namespace: '' });
  const [loadBalancing, setLoadBalancing] = React.useState<LoadBalancing>({ geo: '', weight: 0, defaultGeo: true });
  const [healthCheck, setHealthCheck] = React.useState<HealthCheck>({ endpoint: '', failureThreshold: null, port: null, protocol: 'HTTP', });
  // const [isCreateButtonDisabled, setIsCreateButtonDisabled] = React.useState(true);
  const [providerRefs, setProviderRefs] = React.useState([]);
  const createDNSPolicy = () => ({
    apiVersion: 'kuadrant.io/v1alpha1',
    kind: 'DNSPolicy',
    metadata: {
      name: policyName,
      namespace: selectedNamespace,
    },
    spec: {
      targetRef: {
        group: 'gateway.networking.k8s.io',
        kind: 'Gateway',
        name: selectedGateway.name,
        namespace: selectedGateway.namespace,
      },
      LoadBalancing: {
        weight: loadBalancing.weight,
        geo: loadBalancing.geo,
        defaultGeo: loadBalancing.defaultGeo,
      },
      providerRefs: providerRefs.length > 0 ? [providerRefs[0]] : [],


      ...(healthCheck.endpoint || healthCheck.failureThreshold || healthCheck.port || healthCheck.protocol ?
        {
          healthCheck: {
            endpoint: healthCheck.endpoint,
            failureThreshold: healthCheck.failureThreshold,
            port: healthCheck.port,
            protocol: healthCheck.protocol,
          }
        } : {})
    },
  })

  // Initialize the YAML resource object based on form state
  // const [yamlResource, setYamlResource] = React.useState(() => {
  //   return removeUndefinedFields({
  //     apiVersion: 'kuadrant.io/v1alpha1',
  //     kind: 'DNSPolicy',
  //     metadata: {
  //       name: policy,
  //       namespace: selectedNamespace,
  //     },
  //     spec: {
  //       routingStrategy,
  //       targetRef: {
  //         group: 'gateway.networking.k8s.io',
  //         kind: 'Gateway',
  //         name: selectedGateway.name,
  //         namespace: selectedGateway.namespace,
  //       },
  //       loadBalancing: routingStrategy === 'loadbalanced' ? loadBalancing : undefined,
  //       healthCheck: healthCheck.endpoint ? healthCheck : undefined,
  //     },
  //   });
  // });
  const [yamlInput, setYamlInput] = React.useState(createDNSPolicy)
  const dnsPolicy = createDNSPolicy();
  const dnsPolicyGVK = getGroupVersionKindForResource({ apiVersion: 'kuadrant.io/v1alpha1', kind: 'DNSPolicy' });
  const [dnsPolicyModel] = useK8sModel({ group: dnsPolicyGVK.group, version: dnsPolicyGVK.version, kind: dnsPolicyGVK.kind });

  const history = useHistory();

  const handleYAMLChange = (yamlInput: string) => {
    try {
      const parsedYaml = yaml.load(yamlInput)
      setPolicyName(parsedYaml.metadata?.name || '');
      setSelectedNamespace(parsedYaml.metadata?.namespace || '');
      setSelectedGateway({ name: parsedYaml.spec?.targetRef?.name || '', namespace: parsedYaml.metadata?.namespace || '' });
      const endpoint = (parsedYaml.spec?.healthCheck.endpoint || '');
      const failureThreshold = (parsedYaml.spec?.healthCheck.failureThreshold || '');
      const port = (parsedYaml.spec?.healthCheck.port || '');
      const protocol = (parsedYaml.spec?.healthCheck.protocol || '');
      setHealthCheck({
        endpoint,
        failureThreshold,
        port,
        protocol,
      });
      const providerRef = Array.isArray(parsedYaml.spec?.providerRefs) && parsedYaml.spec.providerRefs.length > 0
        ? parsedYaml.spec.providerRefs[0] // Get the first entry
        : { name: '' }; // Default empty object if none exists

      setProviderRefs([providerRef]);
      const defaultGeo = (parsedYaml.spec?.loadBalancing.defaultGeo || '');
      const weight = (parsedYaml.spec?.loadBalancing.weight || '');
      const geo = (parsedYaml.spec?.loadBalancing.geo || '');
      setLoadBalancing({
        geo,
        weight,
        defaultGeo,
      });

    } catch (e) {
      console.error(t('Error parsing YAML:'), e);
    }
  };

  React.useEffect(() => {
    setYamlInput(dnsPolicy)
  }, [policyName, selectedNamespace, selectedGateway, providerRefs, loadBalancing, healthCheck])

  // React.useEffect(() => {
  //   const updatedYamlResource = {
  //     apiVersion: 'kuadrant.io/v1alpha1',
  //     kind: 'DNSPolicy',
  //     metadata: {
  //       name: policyName,
  //       namespace: selectedNamespace,
  //     },
  //     spec: {
  //       routingStrategy,
  //       targetRef: {
  //         group: 'gateway.networking.k8s.io',
  //         kind: 'Gateway',
  //         name: selectedGateway.name,
  //         namespace: selectedGateway.namespace,
  //       },
  //       loadBalancing: routingStrategy === 'loadbalanced' ? {
  //         ...loadBalancing,
  //         weighted: {
  //           ...loadBalancing.weighted,
  //           custom: loadBalancing.weighted.custom?.map((customWeight) => ({
  //             ...customWeight,
  //             selector: {
  //               ...customWeight.selector,
  //               // convert array to map for yaml viewing
  //               matchLabels: convertMatchLabelsArrayToObject(customWeight.selector.matchLabels || []),
  //             },
  //           })),
  //         },
  //       } : undefined,
  //       healthCheck: healthCheck.endpoint ? healthCheck : undefined,
  //     },
  //   };

  //   setYamlResource(removeUndefinedFields(updatedYamlResource)); // Clean undefined values

  //   // Check if the Create button should be enabled
  //   const isFormValid = policyName && selectedNamespace && selectedGateway.name;
  //   setIsCreateButtonDisabled(!isFormValid); // Update the button state
  // }, [policyName, selectedNamespace, selectedGateway, routingStrategy, loadBalancing, healthCheck]);

  // const [errorAlertMsg, setErrorAlertMsg] = React.useState('')

  // const handleCreateViewChange = (value: 'form' | 'yaml') => {
  //   setCreateView(value);
  // };

  const handlePolicyChange = (_event, policy: string) => {
    setPolicyName(policy);
  };
  const handleProviderRefs = (_event, provider: string) => {
    setProviderRefs([{ name: provider }]);  // Wrap the provider in an array of objects
  };

  const handleCancelResource = () => {
    handleCancel(selectedNamespace, dnsPolicy, history);
  };

  // const handleSubmit = async () => {
  //   if (isCreateButtonDisabled) return; // Early return if form is not valid
  //   setErrorAlertMsg('')

  //   const isHealthCheckValid =
  //     healthCheck.endpoint &&
  //     healthCheck.failureThreshold > 0 &&
  //     healthCheck.port > 0 &&
  //     healthCheck.protocol;

  //   const dnsPolicy: DNSPolicy = {
  //     apiVersion: 'kuadrant.io/v1alpha1',
  //     kind: 'DNSPolicy',
  //     metadata: {
  //       name: policyName,
  //       namespace: selectedNamespace,
  //     },
  //     spec: {
  //       ...(routingStrategy === 'loadbalanced' && {
  //         loadBalancing: {
  //           geo: loadBalancing.geo,
  //           weighted: {
  //             ...loadBalancing.weighted,
  //             custom: loadBalancing.weighted.custom?.map((customWeight) => ({
  //               ...customWeight,
  //               selector: {
  //                 ...customWeight.selector, // keep matchLabels as an array for now
  //               },
  //             })),
  //           },
  //         },
  //       }),
  //       routingStrategy,
  //       targetRef: {
  //         group: 'gateway.networking.k8s.io',
  //         kind: 'Gateway',
  //         name: selectedGateway.name,
  //         namespace: selectedGateway.namespace
  //       },
  //       ...(isHealthCheckValid && { healthCheck }),
  //     },
  //   };

  // const policyToSubmit = JSON.parse(JSON.stringify(dnsPolicy));
  // // convert matchLabels array back to a key/value object for saving
  // if (policyToSubmit.spec.loadBalancing?.weighted?.custom) {
  //   policyToSubmit.spec.loadBalancing.weighted.custom = policyToSubmit.spec.loadBalancing.weighted.custom.map(
  //     (customWeight: WeightedCustom) => ({
  //       ...customWeight,
  //       selector: {
  //         ...customWeight.selector,
  //         matchLabels: convertMatchLabelsArrayToObject(customWeight.selector.matchLabels || []), // Convert to object
  //       },
  //     })
  //   );
  // }

  //   try {
  //     await k8sCreate({
  //       model: getModelFromResource(policyToSubmit),
  //       data: policyToSubmit,
  //       ns: selectedNamespace,
  //     });
  //     history.push('/kuadrant/all-namespaces/policies/dns'); // Navigate after successful creation
  //   } catch (error) {
  //     console.error(t('Error creating DNSPolicy'), { error });
  //     setErrorAlertMsg(error.message)
  //   }
  // };



  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Create DNSPolicy')}</title>
      </Helmet>
      <PageSection className='pf-m-no-padding'>
        <div className='co-m-nav-title'>
          <Title headingLevel="h1">{t('Create DNSPolicy')}</Title>
          <p className='help-block co-m-pane__heading-help-text'>
            <div>{t('DNSPolicy configures how North-South based traffic should be balanced and reach the gateways')}</div>
          </p>
        </div>
        <FormGroup className="kuadrant-editor-toggle" role="radiogroup" isInline hasNoPaddingTop fieldId="create-type-radio-group" label="Create via:">
          <Radio
            name="create-type-radio"
            label="Form"
            id="create-type-radio-form"
            isChecked={createView === 'form'}
            onChange={() => setCreateView('form')}
          />
          <Radio
            name="create-type-radio"
            label="YAML"
            id="create-type-radio-yaml"
            isChecked={createView === 'yaml'}
            onChange={() => setCreateView('yaml')}
          />
        </FormGroup>
      </PageSection>
      {createView === 'form' ? (
        <PageSection>
          <Form className='co-m-pane__form'>
            <div>
              <FormGroup label={t('Policy Name')} isRequired fieldId="policy-name">
                <TextInput
                  isRequired
                  type="text"
                  id="policy-name"
                  name="policy-name"
                  value={policyName}
                  onChange={handlePolicyChange}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>{t('Unique name of the DNS Policy')}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
              <NamespaceSelect selectedNamespace={selectedNamespace} onChange={setSelectedNamespace} formDisabled={false} />
              <GatewaySelect selectedGateway={selectedGateway} onChange={setSelectedGateway} />
              <FormGroup label={t('Provider Ref')} isRequired fieldId="Provider-ref">
                <TextInput
                  isRequired
                  type="text"
                  id="provider-ref"
                  name="provider-ref"
                  value={providerRefs.length > 0 ? providerRefs[0].name : ''}
                  onChange={handleProviderRefs}
                />
              </FormGroup>

              {/* <ExpandableSection toggleText={t('Routing Strategy')}>
                <FormGroup role="radiogroup" isInline fieldId='routing-strategy' label={t('Routing Strategy to use')} isRequired aria-labelledby="routing-strategy-label">
                  <Radio name='routing-strategy' label='Simple' id='routing-strategy-simple' isChecked={routingStrategy === 'simple'} onChange={() => setRoutingStrategy('simple')} />
                  <Radio name='routing-strategy' label='Load Balanced' id='routing-strategy-loadbalanced' isChecked={routingStrategy === 'loadbalanced'} onChange={() => setRoutingStrategy('loadbalanced')} />
                </FormGroup> */}

              <LoadBalancingField loadBalancing={loadBalancing} onChange={setLoadBalancing} />

              {/* </ExpandableSection> */}
              <ExpandableSection toggleText={t('Health Check')}>
                <HealthCheckField healthCheck={healthCheck} onChange={setHealthCheck} />
              </ExpandableSection>
            </div>

            {/* {errorAlertMsg != '' && (
              <AlertGroup className="kuadrant-alert-group">
                <Alert title={t('Error creating DNSPolicy')} variant={AlertVariant.danger} isInline>
                  {errorAlertMsg}
                </Alert>
              </AlertGroup>
            )} */}

            <ActionGroup>
              <KuadrantCreateUpdate model={dnsPolicyModel} resource={dnsPolicy} policyType='dns' history={history} />

              {/* <Button variant={ButtonVariant.primary} onClick={handleSubmit} isDisabled={isCreateButtonDisabled}> */}
              {/* </Button> */}
              <Button variant="link" onClick={handleCancelResource} >{t('Cancel')}</Button>
            </ActionGroup>
          </Form>
        </PageSection>
      ) : (
        <React.Suspense fallback={<div> {t('Loading..')}.</div>}>
          <ResourceYAMLEditor
            initialResource={yamlInput}
            create={true}
            onChange={handleYAMLChange}
          >
          </ResourceYAMLEditor>
        </React.Suspense>
      )}
    </>
  );
};

export default KuadrantDNSPolicyCreatePage;
