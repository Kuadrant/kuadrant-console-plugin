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
import { useHistory, useLocation } from 'react-router-dom';
import { LoadBalancing, HealthCheck } from './dnspolicy/types';
import LoadBalancingField from './dnspolicy/LoadBalancingField';
import HealthCheckField from './dnspolicy/HealthCheckField';
import { Gateway } from './gateway/types';
import GatewaySelect from './gateway/GatewaySelect';
import yaml from 'js-yaml';
import KuadrantCreateUpdate from './KuadrantCreateUpdate';
import { handleCancel } from '../utils/cancel';
import resourceGVKMapping from '../utils/latest';

const KuadrantDNSPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');
  const [policyName, setPolicyName] = React.useState('');
  const [selectedNamespace] = useActiveNamespace();
  const [selectedGateway, setSelectedGateway] = React.useState<Gateway>({
    name: '',
    namespace: '',
  });
  const [loadBalancing, setLoadBalancing] = React.useState<LoadBalancing>({
    geo: '',
    weight: null,
    defaultGeo: true,
  });
  const [healthCheck, setHealthCheck] = React.useState<HealthCheck>({
    endpoint: '',
    failureThreshold: null,
    port: null,
    protocol: null,
  });
  const [providerRefs, setProviderRefs] = React.useState([]);
  const [creationTimestamp, setCreationTimestamp] = React.useState('');
  const [resourceVersion, setResourceVersion] = React.useState('');
  const location = useLocation();
  const pathSplit = location.pathname.split('/');
  const nameEdit = pathSplit[6];
  const namespaceEdit = pathSplit[3];
  const [formDisabled, setFormDisabled] = React.useState(false);
  const [create, setCreate] = React.useState(true);
  let isFormValid = false;

  const createDNSPolicy = () => {
    const hasHealthCheck =
      healthCheck.endpoint ||
      healthCheck.failureThreshold ||
      healthCheck.port ||
      healthCheck.protocol;
    return {
      apiVersion:
        resourceGVKMapping['DNSPolicy'].group + '/' + resourceGVKMapping['DNSPolicy'].version,
      kind: resourceGVKMapping['DNSPolicy'].kind,
      metadata: {
        name: policyName,
        namespace: selectedNamespace,
        ...(creationTimestamp ? { creationTimestamp } : {}),
        ...(resourceVersion ? { resourceVersion } : {}),
      },
      spec: {
        targetRef: {
          group: 'gateway.networking.k8s.io',
          kind: 'Gateway',
          name: selectedGateway.name,
        },
        loadBalancing: {
          weight: loadBalancing.weight,
          geo: loadBalancing.geo,
          defaultGeo: loadBalancing.defaultGeo,
        },
        providerRefs: providerRefs.length > 0 ? [providerRefs[0]] : [],

        ...(hasHealthCheck
          ? {
              healthCheck: {
                ...(healthCheck?.endpoint ? { endpoint: healthCheck.endpoint } : {}),
                ...(healthCheck?.failureThreshold
                  ? { failureThreshold: healthCheck.failureThreshold }
                  : {}),
                ...(healthCheck?.port ? { port: healthCheck.port } : {}),
                ...(healthCheck?.protocol ? { protocol: healthCheck.protocol } : {}),
              },
            }
          : {}),
      },
    };
  };

  const [yamlInput, setYamlInput] = React.useState(createDNSPolicy);
  const dnsPolicy = createDNSPolicy();
  const dnsPolicyGVK = getGroupVersionKindForResource({
    apiVersion: `${resourceGVKMapping['DNSPolicy'].group}/${resourceGVKMapping['DNSPolicy'].version}`,
    kind: resourceGVKMapping['DNSPolicy'].kind,
  });
  const [dnsPolicyModel] = useK8sModel({
    group: dnsPolicyGVK.group,
    version: dnsPolicyGVK.version,
    kind: dnsPolicyGVK.kind,
  });

  const history = useHistory();

  interface dnsPolicyEdit extends K8sResourceCommon {
    spec?: {
      targetRef?: {
        group?: string;
        kind?: string;
        name?: string;
      };

      loadBalancing: {
        weight?: number;
        geo?: string;
        defaultGeo?: boolean;
      };
      providerRefs?: {
        name?: string;
      }[];

      healthCheck?: {
        endpoint?: string;
        failureThreshold?: number;
        port?: number;
        protocol?: 'HTTP' | 'HTTPS';
      };
    };
  }

  //Checking if the policy already exists and is to be edited or if its new and is being created
  let dnsResource = null;
  if (nameEdit) {
    dnsResource = {
      groupVersionKind: dnsPolicyGVK,
      isList: false,
      name: nameEdit,
      namespace: namespaceEdit,
    };
  }

  const [dnsData, dnsLoaded, dnsError] = dnsResource
    ? useK8sWatchResource(dnsResource)
    : [null, false, null]; //Syntax allows for dnsResource to be null in the case of a create

  React.useEffect(() => {
    if (dnsLoaded && !dnsError) {
      if (!Array.isArray(dnsData)) {
        const dnsPolicyUpdate = dnsData as dnsPolicyEdit;
        setCreationTimestamp(dnsPolicyUpdate.metadata.creationTimestamp);
        setResourceVersion(dnsPolicyUpdate.metadata.resourceVersion);
        setFormDisabled(true);
        setCreate(false);
        setPolicyName(dnsPolicyUpdate.metadata?.name || '');
        setSelectedGateway({
          name: dnsPolicyUpdate.spec?.targetRef?.name || '',
          namespace: dnsPolicyUpdate.metadata?.namespace || '',
        });
        setHealthCheck({
          endpoint: dnsPolicyUpdate.spec?.healthCheck?.endpoint || '',
          failureThreshold: dnsPolicyUpdate.spec?.healthCheck?.failureThreshold,
          port: dnsPolicyUpdate.spec?.healthCheck?.port || null,
          protocol: dnsPolicyUpdate.spec?.healthCheck?.protocol || 'HTTP',
        });
        const providerRef =
          Array.isArray(dnsPolicyUpdate.spec?.providerRefs) &&
          dnsPolicyUpdate.spec.providerRefs.length > 0
            ? dnsPolicyUpdate.spec.providerRefs[0]
            : { name: '' };

        setProviderRefs([providerRef]);
        setLoadBalancing({
          geo: dnsPolicyUpdate.spec?.loadBalancing?.geo || '',
          weight: dnsPolicyUpdate.spec?.loadBalancing?.weight || 0,
          defaultGeo:
            dnsPolicyUpdate.spec?.loadBalancing?.defaultGeo !== undefined
              ? dnsPolicyUpdate.spec.loadBalancing?.defaultGeo
              : false, // Default to false if not present
        });

        console.log('Initializing dns with existing dns for update');
      }
    } else if (dnsError) {
      console.error('Failed to fetch the resource:', dnsError);
    }
  }, [dnsData, dnsLoaded, dnsError]);

  const handleYAMLChange = (yamlInput: string) => {
    try {
      const parsedYaml = yaml.load(yamlInput);
      setPolicyName(parsedYaml.metadata?.name || '');
      setSelectedGateway({
        name: parsedYaml.spec?.targetRef?.name || '',
        namespace: parsedYaml.metadata?.namespace || '',
      });
      setHealthCheck({
        endpoint: parsedYaml.spec?.healthCheck?.endpoint || '',
        failureThreshold: parsedYaml.spec?.healthCheck?.failureThreshold,
        port: parsedYaml.spec?.healthCheck?.port || '',
        protocol: parsedYaml.spec?.healthCheck?.protocol || '',
      });
      const providerRef =
        Array.isArray(parsedYaml.spec?.providerRefs) && parsedYaml.spec.providerRefs.length > 0
          ? parsedYaml.spec.providerRefs[0]
          : { name: '' };

      setProviderRefs([providerRef]);

      setLoadBalancing({
        geo: parsedYaml.spec?.loadBalancing?.geo || '',
        weight: parsedYaml.spec?.loadBalancing?.weight || '',
        defaultGeo:
          parsedYaml.spec?.loadBalancing?.defaultGeo !== undefined
            ? parsedYaml.spec.loadBalancing?.defaultGeo
            : false, // Default to false if not present
      });
    } catch (e) {
      console.error(t('Error parsing YAML:'), e);
    }
  };

  React.useEffect(() => {
    setYamlInput(dnsPolicy);
  }, [policyName, selectedNamespace, selectedGateway, providerRefs, loadBalancing, healthCheck]);

  const handlePolicyChange = (_event, policy: string) => {
    setPolicyName(policy);
  };
  const handleProviderRefs = (_event, provider: string) => {
    setProviderRefs([{ name: provider }]); // Wrap the provider in an array of objects
  };

  const handleCancelResource = () => {
    handleCancel(selectedNamespace, dnsPolicy, history);
  };

  if (
    policyName &&
    selectedNamespace &&
    selectedGateway.name &&
    setProviderRefs &&
    loadBalancing.geo &&
    loadBalancing.weight
  ) {
    isFormValid = true;
  }

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">
          {create ? t('Create DNS Policy') : t('Edit DNS Policy')}
        </title>
      </Helmet>
      <PageSection variant="light" className="pf-m-no-padding">
        <div className="co-m-nav-title">
          <Title headingLevel="h1">{create ? t('Create DNS Policy') : t('Edit DNS Policy')}</Title>
          <p className="help-block co-m-pane__heading-help-text">
            <div>
              {t(
                'DNSPolicy configures how North-South based traffic should be balanced and reach the gateways',
              )}
            </div>
          </p>
        </div>
        <FormGroup
          className="kuadrant-editor-toggle"
          role="radiogroup"
          isInline
          hasNoPaddingTop
          fieldId="create-type-radio-group"
          label="Create via:"
        >
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
        <PageSection variant="light">
          <Form className="co-m-pane__form">
            <div>
              <FormGroup label={t('Policy Name')} isRequired fieldId="policy-name">
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
                    <HelperTextItem>{t('Unique name of the DNS Policy')}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
              <GatewaySelect selectedGateway={selectedGateway} onChange={setSelectedGateway} />
              <FormGroup label={t('Provider Ref')} isRequired fieldId="Provider-ref">
                <TextInput
                  isRequired
                  type="text"
                  id="provider-ref"
                  name="provider-ref"
                  value={providerRefs.length > 0 ? providerRefs[0].name : ''}
                  onChange={handleProviderRefs}
                  placeholder={t('Provider Ref')}
                />
              </FormGroup>
              <LoadBalancingField loadBalancing={loadBalancing} onChange={setLoadBalancing} />
              <ExpandableSection toggleText={t('Health Check')}>
                <HealthCheckField healthCheck={healthCheck} onChange={setHealthCheck} />
              </ExpandableSection>
            </div>
            <ActionGroup>
              <KuadrantCreateUpdate
                model={dnsPolicyModel}
                resource={dnsPolicy}
                policyType="dns"
                history={history}
                validation={isFormValid}
              />
              <Button variant="link" onClick={handleCancelResource}>
                {t('Cancel')}
              </Button>
            </ActionGroup>
          </Form>
        </PageSection>
      ) : (
        <React.Suspense fallback={<div> {t('Loading..')}.</div>}>
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

export default KuadrantDNSPolicyCreatePage;
