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

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Kuadrant')}</title>
      </Helmet>
      <Page>
        <PageSection variant="light">
          <Title headingLevel="h1">{t('Kuadrant')}</Title>
        </PageSection>
        <div>create dns policy</div>
        <div>description</div>
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
          <FormGroup label="Select Namespace" fieldId="namespace-select">
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
        </Form>
        <div>namespace * ?</div>
        <input/>
        <div>gateway api target reference *</div>
        <input/>
        <div>description here, to create an additional Gateway go to <a>here</a></div>
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
      </Page>
    </>
  );
};

export default KuadrantDNSPolicyCreatePage;
