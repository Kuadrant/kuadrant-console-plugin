import * as React from 'react';
import {
  Form,
  FormGroup,
  TextInput,
  ActionGroup,
  Button,
  HelperText,
  HelperTextItem,
  FormHelperText,
  Page,
  PageSection,
  Title,
  Radio,
  Flex,
  FlexItem,
} from '@patternfly/react-core';
import Helmet from 'react-helmet';
import {
  useK8sModel,
  getGroupVersionKindForResource,
  ResourceYAMLEditor
} from '@openshift-console/dynamic-plugin-sdk';
import './kuadrant.css';
import { handleCreate } from '../utils/createResource';
import { handleCancel } from '../utils/cancel';
import { useHistory, Link } from 'react-router-dom';
import NamespaceSelect from './namespace/NamespaceSelect';
import yaml from 'js-yaml';
import { useTranslation } from 'react-i18next';
import ClusterIssuerSelect from './issuer/clusterIssuerSelect';
import IssuerSelect from './issuer/issuerSelect';
import { ClusterIssuer } from './issuer/types';
import { Issuer } from './issuer/types';
import { Gateway } from './gateway/types';
import GatewaySelect from './gateway/GatewaySelect';



const KuadrantTLSPage: React.FC = () => {
  const history = useHistory();
  const [policyName, setPolicyName] = React.useState('');
  const [selectedNamespace, setSelectedNamespace] = React.useState("");
  const [selectedGateway, setSelectedGateway] = React.useState<Gateway>({ name: '', namespace: '' });
  const [selectedClusterIssuers, setSelectedClusterIssuers] = React.useState<ClusterIssuer>({ name: '', namespace: '' });
  const [selectedIssuer, setSelectedIssuers] = React.useState<Issuer>({ name: '', namespace: '' });
  const [certIssuerType, setCertIssuerType] = React.useState<'clusterissuer' | 'issuer'>('clusterissuer');
  const { t } = useTranslation('plugin__console-plugin-template');

  //Initial skeleton setup for the yaml view
  const skeletonTls = () => ({
    apiVersion: 'kuadrant.io/v1alpha1',
    kind: 'TLSPolicy',
    metadata: {
      name: '',
      namespace: '',
    },
    spec: {
      targetRef: {
        group: 'gateway.networking.k8s.io',
        kind: 'Gateway',
        name: '',
      },
      issuerRef: {
        name: '',
        kind: '',
      },
    },
  })
  // Creates TLS policy object to be used for form and yaml creation of the resource
  const createTlsPolicy = () => ({
    apiVersion: 'kuadrant.io/v1alpha1',
    kind: 'TLSPolicy',
    metadata: {
      name: policyName,
      namespace: selectedNamespace,
    },
    spec: {
      targetRef: {
        group: 'gateway.networking.k8s.io',
        kind: 'Gateway',
        name: selectedGateway.name,
      },
      issuerRef: certIssuerType === 'clusterissuer'
        ? {
          name: selectedClusterIssuers.name,
          kind: 'ClusterIssuer',
        } :
        {
          name: selectedIssuer.name,
          kind: 'Issuer',
        },
    },
  })

  const tlsPolicy = createTlsPolicy();

  // Form to yaml view sync
  const [yamlInput, setYamlInput] = React.useState((skeletonTls()));

  const handleYAMLChange = (yamlInput: string) => {
    try {
      const parsedYaml = yaml.load(yamlInput);
      setPolicyName(parsedYaml.metadata?.name || '');
      setSelectedNamespace(parsedYaml.metadata?.namespace || '');
      setSelectedGateway(parsedYaml.spec?.targetRef?.name || '');
      setSelectedClusterIssuers(parsedYaml.spec?.targetRef?.name || '');
      setSelectedIssuers(parsedYaml.spec?.targetRef?.name || '');
      setCertIssuerType(parsedYaml.spec?.issuerRef?.name || '');
      if (parsedYaml.spec?.issuerRef?.kind === 'ClusterIssuer') {
        setCertIssuerType('clusterissuer');
        setSelectedClusterIssuers({ name: parsedYaml.spec?.issuerRef?.name || '', namespace: parsedYaml.metadata?.namespace || '' });
      } else if (parsedYaml.spec?.issuerRef?.kind === 'Issuer') {
        setCertIssuerType('issuer');
        setSelectedIssuers({ name: parsedYaml.spec?.issuerRef?.name || '', namespace: parsedYaml.metadata?.namespace || '' });
      }
    } catch (e) {
      console.error(t('Error parsing YAML:'), e);
    }
  };

  React.useEffect(() => {
    const updatedTLSState = createTlsPolicy();
    setYamlInput((updatedTLSState));
  }, [policyName, selectedNamespace, selectedGateway, certIssuerType, selectedClusterIssuers, selectedIssuer, selectedGateway]);

  const [view, setView] = React.useState('form');


  // Policy Name
  const handleNameChange = (_event, policyName: string) => {
    setPolicyName(policyName);
  };

  const tlsPolicyGVK = getGroupVersionKindForResource({ apiVersion: 'kuadrant.io/v1alpha1', kind: 'TLSPolicy' });
  const [tlsPolicyModel] = useK8sModel({ group: tlsPolicyGVK.group, version: tlsPolicyGVK.version, kind: tlsPolicyGVK.kind });

  // Create
  const handleCreateResource = () => {
    handleCreate(tlsPolicyModel, tlsPolicy, selectedNamespace, "TLSPolicy", history);
  };


  //Cancel
  const handleCancelResource = () => {
    handleCancel(selectedNamespace, "tlsPolicy", tlsPolicy, history);
  };

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t(' Create TLS Policy')} </title>
      </Helmet>
      <Page>
        <PageSection className='pf-m-no-padding'>
          <div className='co-m-nav-title'>

            <Title headingLevel="h1">{t('Create TLS Policy')}</Title>
            <p className='help-block co-m-pane__heading-help-text'>
              <div>{t(' Targets Gateway API networking resources Gateways to provide tls for gateway listeners by managing the lifecycle of tls certificates using CertManager')}</div>
            </p>
          </div>
        </PageSection>
        <PageSection>
          <FormGroup label={t("Configure via")}>
            <Flex alignItems={{ default: 'alignItemsCenter' }}>
              <FlexItem>
                <Radio
                  label="Form View"
                  isChecked={view === 'form'}
                  onChange={() => setView('form')}
                  id="form-view"
                  name="view-toggle"
                />
              </FlexItem>
              <FlexItem>
                <Radio
                  label="YAML View"
                  isChecked={view === 'yaml'}
                  onChange={() => setView('yaml')}
                  id="yaml-view"
                  name="view-toggle"
                />
              </FlexItem>
            </Flex>
          </FormGroup>
        </PageSection>
        {view === 'form' ? (
          <PageSection>
            <Form className='co-m-pane__form'>
              <FormGroup
                label="Policy name"
                isRequired
                fieldId="simple-form-policy-name-01"
              >
                <TextInput
                  isRequired
                  type="text"
                  id="simple-form-policy-name-01"
                  name="simple-form-policy-name-01"
                  aria-describedby="simple-form-policy-name-01-helper"
                  value={policyName}
                  onChange={handleNameChange}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>{t('Unique name of the TLSPolicy.')}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
              <NamespaceSelect
                selectedNamespace={selectedNamespace}
                onChange={setSelectedNamespace}
              >
              </NamespaceSelect>
              <FormGroup
                label={t("Gateway API Target Reference")}
                fieldId="gateway-select"
                isRequired
              >
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>
                      {t('Reference to a Kubernetes resource that the policy attaches to. To create an additional gateway got to')}
                      <Link to="/k8s/cluster/gateway.networking.k8s.io~v1~Gateway/~new"> here</Link>
                    </HelperTextItem>
                  </HelperText >
                </FormHelperText>
                <GatewaySelect selectedGateway={selectedGateway} onChange={setSelectedGateway} />
              </FormGroup>
              <FormGroup
                label={t("CertIssuer Issuer Reference")}
                fieldId="certmanger-select"
                isRequired
              >
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>
                      {t('Reference to the issuer for the created certificate. To create an additional Issuer got to')}
                      <Link to="/k8s/cluster/cert-manager.io~v1~ClusterIssuer/~new"> here</Link>
                    </HelperTextItem>
                  </HelperText >
                </FormHelperText>
                <FormGroup role="radiogroup" isInline fieldId='cert-manager-issuer' label={t('Cert manager issuer type')} isRequired aria-labelledby="issuer-label">
                  <Radio
                    label="Cluster issuer"
                    isChecked={certIssuerType === 'clusterissuer'}
                    onChange={() => {
                      setCertIssuerType('clusterissuer');
                    }
                    }
                    id="cluster-issuer"
                    name="issuer"
                  />
                  <Radio
                    label="Issuer"
                    isChecked={certIssuerType === 'issuer'}
                    onChange={() => {
                      setCertIssuerType('issuer');
                    }
                    }
                    id="issuer"
                    name="issuer"
                  />
                </FormGroup>
                {certIssuerType === 'clusterissuer' ? (
                  <ClusterIssuerSelect selectedClusterIssuer={selectedClusterIssuers} onChange={setSelectedClusterIssuers} />
                ) : (
                  <IssuerSelect selectedIssuer={selectedIssuer} onChange={setSelectedIssuers} />
                )}
              </FormGroup>
              <ActionGroup>
                <Button variant="primary" onClick={handleCreateResource} >Submit</Button>
                <Button variant="link" onClick={handleCancelResource} >Cancel</Button>
              </ActionGroup>
            </Form>
          </PageSection>
        ) : (
          <React.Suspense fallback={<div>Loading...</div>}>
            <ResourceYAMLEditor
              initialResource={yamlInput}
              create={true}
              onChange={handleYAMLChange}
            >
            </ResourceYAMLEditor>
          </React.Suspense>
        )}
      </Page>
    </>
  );
};

export default KuadrantTLSPage;
