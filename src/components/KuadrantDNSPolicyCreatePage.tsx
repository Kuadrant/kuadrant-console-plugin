import * as React from 'react';
import Helmet from 'react-helmet';
import {
  Page,
  PageSection,
  Title,
  TextInput,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Form,
  FormSelect,
  FormSelectOption,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import './kuadrant.css';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';

const KuadrantDNSPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__console-plugin-template');
  const [policy, setPolicy] = React.useState('');
  const handlePolicyChange = (_event, policy: string) => {
    setPolicy(policy);
  };

  const [selectedNamespace, setSelectedNamespace] = React.useState('');
  const [namespaces, setNamespaces] = React.useState([]);

  const namespaceResource = {
    kind: 'Namespace',
    isList: true,
    namespaced: false,
  };

  const [namespaceData, loaded, error] = useK8sWatchResource(namespaceResource);

  React.useEffect(() => {
    if (loaded && !error && Array.isArray(namespaceData)) {
      setNamespaces(namespaceData.map((ns) => ns.metadata.name));
    }
  }, [namespaceData, loaded, error]);

  const handleNamespaceChange = (event) => {
    setSelectedNamespace(event.currentTarget.value);
  };

  const [selectedGateway, setSelectedGateway] = React.useState('');
  const [gateways, setGateways] = React.useState([]);

  const gatewayResource = {
    groupVersionKind: { group: 'gateway.networking.k8s.io', version: 'v1', kind: 'Gateway' },
    isList: true
  };

  const [gatewayData, gatewayLoaded, gatewayError] = useK8sWatchResource(gatewayResource);

  React.useEffect(() => {
    if (gatewayLoaded && !gatewayError && Array.isArray(gatewayData)) {
      setGateways(gatewayData.map((ns) => ns.metadata.name));
    }
  }, [gatewayData, gatewayLoaded, gatewayError]);

  const handleGatewayChange = (event) => {
    setSelectedGateway(event.currentTarget.value);
  };

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Create DNS Policy')}</title>
      </Helmet>
      <Page>
        <PageSection variant="light">
          <Title headingLevel="h1">{t('Create DNS Policy')}</Title>
          <div>description</div>
        </PageSection>
        <PageSection>
          <div>create via [] form [] yaml</div>
          <Form>
            <FormGroup label="Policy Name" isRequired fieldId="policy-name">
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
                  <HelperTextItem>Unique name of the DNS Policy.</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            <FormGroup label="Namespace" isRequired fieldId="namespace-select">
              <FormSelect
                id="namespace-select"
                value={selectedNamespace}
                onChange={handleNamespaceChange}
                aria-label="Select Namespace"
              >
                <FormSelectOption key="placeholder" value="" label="Select a namespace" isPlaceholder />
                {namespaces.map((namespace, index) => (
                  <FormSelectOption key={index} value={namespace} label={namespace} />
                ))}
              </FormSelect>
            </FormGroup>
            <FormGroup label="Gateway API Target Reference" isRequired fieldId="gateway-select">
              <FormSelect
                id="gateway-select"
                value={selectedGateway}
                onChange={handleGatewayChange}
                aria-label="Select Gateway"
              >
                <FormSelectOption key="placeholder" value="" label="Select a gateway" isPlaceholder />
                {gateways.map((gateway, index) => (
                  <FormSelectOption key={index} value={gateway} label={gateway} />
                ))}
              </FormSelect>
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>Description here, to create an additional Gateway go to <a>here</a></HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          </Form>
          <div>routing strategy *</div>
          <div>routing strategy to use * ?</div>
          <div>[] simple [] load-balanced</div>
          <div>[] default</div>
          <div>[] custom weights</div>
          <div>custom weight * ?</div>
          <input/>
          <div>health check</div>
          <div>description of this section</div>
          <div>Endpoint * ?</div>
          <input/>
          <div>Endpoint is the path to append to the host to reach the expected health check</div>
          <div>Port * ?</div>
          <input/>
          <div>Endpoint is the path to append to the host to reach the expected health check</div>
          <div>Protocol * ?</div>
          <div>[] default</div>
          <div>[] custom weights</div>
          <button>create</button>
          <button>cancel</button>
        </PageSection>
      </Page>
    </>
  );
};

export default KuadrantDNSPolicyCreatePage;
