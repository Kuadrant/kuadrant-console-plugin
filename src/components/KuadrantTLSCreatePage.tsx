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
  ResourceYAMLEditor,
  useK8sWatchResource,
  useActiveNamespace,
} from '@openshift-console/dynamic-plugin-sdk';
import './kuadrant.css';
import { handleCancel } from '../utils/cancel';
import { useHistory, useLocation } from 'react-router-dom';
import yaml from 'js-yaml';
import { useTranslation } from 'react-i18next';
import ClusterIssuerSelect from './issuer/clusterIssuerSelect';
import IssuerSelect from './issuer/issuerSelect';
import { ClusterIssuer } from './issuer/types';
import { Issuer } from './issuer/types';
import { Gateway } from './gateway/types';
import GatewaySelect from './gateway/GatewaySelect';
import KuadrantCreateUpdate from './KuadrantCreateUpdate'
import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';


const KuadrantTLSCreatePage: React.FC = () => {
  const history = useHistory();
  const [policyName, setPolicyName] = React.useState('');
  const [selectedNamespace] = useActiveNamespace();
  const [selectedGateway, setSelectedGateway] = React.useState<Gateway>({ name: '', namespace: '' });
  const [selectedClusterIssuers, setSelectedClusterIssuers] = React.useState<ClusterIssuer>({ name: '' });
  const [selectedIssuer, setSelectedIssuers] = React.useState<Issuer>({ name: '', namespace: '' });
  const [certIssuerType, setCertIssuerType] = React.useState<'clusterissuer' | 'issuer'>('clusterissuer');
  const { t } = useTranslation('plugin__console-plugin-template');
  const location = useLocation();
  const pathSplit = location.pathname.split('/')
  const nameEdit = pathSplit[6]
  const namespaceEdit = pathSplit[3]
  const [formDisabled, setFormDisabled] = React.useState(false);
  const [create, setCreate] = React.useState(true);

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
  const tlsPolicyGVK = getGroupVersionKindForResource({ apiVersion: 'kuadrant.io/v1alpha1', kind: 'TLSPolicy' });
  const [tlsPolicyModel] = useK8sModel({ group: tlsPolicyGVK.group, version: tlsPolicyGVK.version, kind: tlsPolicyGVK.kind });

  // K8sResourceCommon by default does not contain spec etc which is needed for updating resource forms
  interface TLSPolicyEdit extends K8sResourceCommon {
    spec?: {
      targetRef?: {
        group?: string;
        kind?: string;
        name?: string;
      };
      issuerRef?: {
        kind?: 'ClusterIssuer' | 'Issuer';
        name?: string;
      };
    };
  }

  //Checking if the policy already exists and is to be edited or if its new and is being created
  let tlsResource = null
  if (nameEdit) {
    tlsResource = {
      groupVersionKind: tlsPolicyGVK,
      isList: false,
      name: nameEdit,
      namespace: namespaceEdit
    };
  }


  const [tlsData, tlsLoaded, tlsError] = tlsResource ? useK8sWatchResource(tlsResource) : [null, false, null]; //Syntax allows for tlsResource to be null in the case of a create 

  // When a resource is being updated setting the form from the yaml it gets from useK8sWatchResource
  React.useEffect(() => {

    if (tlsLoaded && !tlsError) {
      if (!Array.isArray(tlsData)) {
        const tlsPolicyUpdate = tlsData as TLSPolicyEdit;
        setFormDisabled(true)
        setCreate(false)
        setPolicyName(tlsPolicyUpdate.metadata?.name || '');
        setSelectedGateway({ name: tlsPolicyUpdate.spec?.targetRef?.name || '', namespace: tlsPolicyUpdate.metadata?.namespace || '' });
        if (tlsPolicyUpdate.spec?.issuerRef?.kind === 'ClusterIssuer') {
          setCertIssuerType('clusterissuer');
          setSelectedClusterIssuers({ name: tlsPolicyUpdate.spec?.issuerRef?.name || '' });
        } else if (tlsPolicyUpdate.spec?.issuerRef?.kind === 'Issuer') {
          setCertIssuerType('issuer');
          setSelectedIssuers({
            name: tlsPolicyUpdate.spec?.issuerRef?.name || '',
            namespace: tlsPolicyUpdate.metadata?.namespace || ''
          });
        }

        console.log("Initializing tls with existing TLS for update");
      }
    } else if (tlsError) {
      console.error('Failed to fetch the resource:', tlsError);
    }
  }, [tlsData, tlsLoaded, tlsError]);

  // Form to yaml view sync
  const [yamlInput, setYamlInput] = React.useState(createTlsPolicy);

  const handleYAMLChange = (yamlInput: string) => {
    try {
      const parsedYaml = yaml.load(yamlInput);
      setPolicyName(parsedYaml.metadata?.name || '');
      setSelectedGateway({ name: parsedYaml.spec?.targetRef?.name || '', namespace: parsedYaml.metadata?.namespace || '' });
      if (parsedYaml.spec?.issuerRef?.kind === 'ClusterIssuer') {
        setCertIssuerType('clusterissuer');
        setSelectedClusterIssuers({ name: parsedYaml.spec?.issuerRef?.name || '' });
      } else if (parsedYaml.spec?.issuerRef?.kind === 'Issuer') {
        setCertIssuerType('issuer');
        setSelectedIssuers({
          name: parsedYaml.spec?.issuerRef?.name || '',
          namespace: parsedYaml.metadata?.namespace || '',
        });
      }

    } catch (e) {
      console.error(t('Error parsing YAML:'), e);
    }
  };
  // When new changes are made to via form update the yaml view
  React.useEffect(() => {
    setYamlInput(tlsPolicy);
  }, [policyName, selectedNamespace, selectedGateway, certIssuerType, selectedClusterIssuers, selectedIssuer, selectedGateway]);

  const [view, setView] = React.useState('form');

  // Policy Name
  const handleNameChange = (_event, policyName: string) => {
    setPolicyName(policyName);
  };

  //Cancel
  const handleCancelResource = () => {
    handleCancel(selectedNamespace, tlsPolicy, history);
  };
  return (
    <>
      <Helmet>
        <title data-test="example-page-title">
          {create ? t('Create TLS Policy') : t('Edit TLS Policy')}
        </title>
      </Helmet>
      <Page>
        <PageSection className='pf-m-no-padding' variant="light" >
          <div className='co-m-nav-title'>
            <Title headingLevel="h1">{create ? 'Create TLS Policy' : 'Edit TLS Policy'}</Title>
            <p className='help-block co-m-pane__heading-help-text'>
              <div>{t('Targets Gateway API networking resources Gateways to provide TLS for gateway listeners by managing the lifecycle of TLS certificates using cert-manager')}</div>
            </p>
          </div>
          <FormGroup className="kuadrant-editor-toggle" role="radiogroup" isInline hasNoPaddingTop fieldId="create-type-radio-group" label={t("Configure via")}>
            <Flex alignItems={{ default: 'alignItemsCenter' }}>
              <FlexItem>
                <Radio
                  label={t("Form View")}
                  isChecked={view === 'form'}
                  onChange={() => setView('form')}
                  id="form-view"
                  name="view-toggle"
                />
              </FlexItem>
              <FlexItem>
                <Radio
                  label={t("YAML View")}
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
          <PageSection variant="light">
            <Form className='co-m-pane__form'>
              <FormGroup
                label={t("Policy name")}
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
                  isDisabled={formDisabled}
                  placeholder={t("Policy name")}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>{t('Unique name of the TLSPolicy.')}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
              <FormGroup
                fieldId="gateway-select"
                isRequired
              >
                <GatewaySelect selectedGateway={selectedGateway} onChange={setSelectedGateway} />
              </FormGroup>
              <FormGroup
                fieldId="certmanger-select"
                isRequired
              >
                <FormGroup role="radiogroup" isInline fieldId='cert-manager-issuer' label={t('Cert manager issuer type')} isRequired aria-labelledby="issuer-label">
                  <Radio
                    label={t("Cluster issuer")}
                    isChecked={certIssuerType === 'clusterissuer'}
                    onChange={() => {
                      setCertIssuerType('clusterissuer');
                    }
                    }
                    id="cluster-issuer"
                    name="issuer"
                  />
                  <Radio
                    label={t("Issuer")}
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
                <KuadrantCreateUpdate model={tlsPolicyModel} resource={tlsPolicy} policyType='tls' history={history} />
                <Button variant="link" onClick={handleCancelResource} >{t('Cancel')}</Button>
              </ActionGroup>
            </Form>
          </PageSection>
        ) : (
          <React.Suspense fallback={<div> {t('Loading..')}.</div>}>
            <ResourceYAMLEditor
              initialResource={create ? yamlInput : tlsData}
              create={create}
              onChange={handleYAMLChange}
            >
            </ResourceYAMLEditor>
          </React.Suspense>
        )}
      </Page>
    </>
  );
};

export default KuadrantTLSCreatePage;

