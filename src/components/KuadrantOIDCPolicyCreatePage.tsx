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
import { useNavigate, useLocation } from 'react-router-dom-v5-compat';
import { Gateway } from './gateway/types';
import GatewaySelect from './gateway/GatewaySelect';
import * as yaml from 'js-yaml';
import KuadrantCreateUpdate from './KuadrantCreateUpdate';
import { handleCancel } from '../utils/cancel';
import { resourceGVKMapping } from '../utils/resources';

const KuadrantOIDCPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');
  const [policyName, setPolicyName] = React.useState('');
  const [selectedNamespace] = useActiveNamespace();
  const [selectedGateway, setSelectedGateway] = React.useState<Gateway>({
    name: '',
    namespace: '',
  });
  const [clientID, setClientID] = React.useState('');
  const [issuerURL, setIssuerURL] = React.useState('');

  const createOIDCPolicy = () => {
    let creationTimestampVal = '';
    let resourceVersionVal = '';
    try {
      creationTimestampVal = creationTimestamp;
    } catch {
      creationTimestampVal = '';
    }
    try {
      resourceVersionVal = resourceVersion;
    } catch {
      resourceVersionVal = '';
    }
    return {
      apiVersion:
        resourceGVKMapping['OIDCPolicy'].group + '/' + resourceGVKMapping['OIDCPolicy'].version,
      kind: resourceGVKMapping['OIDCPolicy'].kind,
      metadata: {
        name: policyName,
        namespace: selectedNamespace,
        ...(creationTimestampVal ? { creationTimestamp: creationTimestampVal } : {}),
        ...(resourceVersionVal ? { resourceVersion: resourceVersionVal } : {}),
      },
      spec: {
        targetRef: {
          group: 'gateway.networking.k8s.io',
          kind: 'Gateway',
          name: selectedGateway.name,
        },
        provider: { clientID, issuerURL },
      },
    };
  };

  const [yamlInput, setYamlInput] = React.useState(createOIDCPolicy);
  const [creationTimestamp, setCreationTimestamp] = React.useState('');
  const [resourceVersion, setResourceVersion] = React.useState('');
  const [formDisabled, setFormDisabled] = React.useState(false);
  const [create, setCreate] = React.useState(true);

  const location = useLocation();
  const pathSplit = location.pathname.split('/');
  const nameEdit = pathSplit[6];
  const namespaceEdit = pathSplit[3];

  const oidcPolicy = createOIDCPolicy();
  const oidcPolicyGVK = getGroupVersionKindForResource({
    apiVersion: `${resourceGVKMapping['OIDCPolicy'].group}/${resourceGVKMapping['OIDCPolicy'].version}`,
    kind: resourceGVKMapping['OIDCPolicy'].kind,
  });
  const [oidcPolicyModel] = useK8sModel({
    group: oidcPolicyGVK.group,
    version: oidcPolicyGVK.version,
    kind: oidcPolicyGVK.kind,
  });

  const navigate = useNavigate();

  interface OIDCPolicyEdit extends K8sResourceCommon {
    spec?: {
      targetRef?: {
        group?: string;
        kind?: string;
        name?: string;
      };
      provider?: {
        clientID?: string;
        issuerURL?: string;
      };
    };
  }

  let oidcResource = null;
  if (nameEdit) {
    oidcResource = {
      groupVersionKind: oidcPolicyGVK,
      isList: false,
      name: nameEdit,
      namespace: namespaceEdit,
    };
  }

  const [oidcData, oidcLoaded, oidcError] = oidcResource
    ? useK8sWatchResource(oidcResource)
    : [null, false, null];

  React.useEffect(() => {
    if (oidcLoaded && !oidcError) {
      if (!Array.isArray(oidcData)) {
        const oidcPolicyUpdate = oidcData as OIDCPolicyEdit;
        setCreationTimestamp(oidcPolicyUpdate.metadata.creationTimestamp);
        setResourceVersion(oidcPolicyUpdate.metadata.resourceVersion);
        setFormDisabled(true);
        setCreate(false);
        setPolicyName(oidcPolicyUpdate.metadata?.name || '');
        setSelectedGateway({
          name: oidcPolicyUpdate.spec?.targetRef?.name || '',
          namespace: oidcPolicyUpdate.metadata?.namespace || '',
        });
        setClientID(oidcPolicyUpdate.spec?.provider?.clientID || '');
        setIssuerURL(oidcPolicyUpdate.spec?.provider?.issuerURL || '');
      }
    } else if (oidcError) {
      console.error('Failed to fetch the resource:', oidcError);
    }
  }, [oidcData, oidcLoaded, oidcError]);

  const handleYAMLChange = (yamlInput: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsedYaml = yaml.load(yamlInput) as Record<string, any>;
      setPolicyName(parsedYaml.metadata?.name || '');
      setSelectedGateway({
        name: parsedYaml.spec?.targetRef?.name || '',
        namespace: parsedYaml.metadata?.namespace || '',
      });
      setClientID(parsedYaml.spec?.provider?.clientID || '');
      setIssuerURL(parsedYaml.spec?.provider?.issuerURL || '');
    } catch (e) {
      console.error(t('Error parsing YAML:'), e);
    }
  };

  React.useEffect(() => {
    setYamlInput(oidcPolicy);
  }, [policyName, selectedNamespace, selectedGateway, clientID, issuerURL]);

  const handleCancelResource = () => {
    handleCancel(navigate);
  };

  const isFormValid = !!(policyName && selectedGateway.name && clientID && issuerURL);

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">
          {create ? t('Create OIDC Policy') : t('Edit OIDC Policy')}
        </title>
      </Helmet>
      <PageSection hasBodyWrapper={false} className="pf-m-no-padding">
        <div className="co-m-nav-title">
          <Title headingLevel="h1">
            {create ? t('Create OIDC Policy') : t('Edit OIDC Policy')}
          </Title>
          <p className="help-block">
            {t('OIDCPolicy configures OIDC authentication for your gateway')}
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
                  <HelperTextItem>{t('Unique name of the OIDC Policy')}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            <GatewaySelect selectedGateway={selectedGateway} onChange={setSelectedGateway} />
            <FormGroup label={t('Client ID')} isRequired fieldId="client-id">
              <TextInput
                isRequired
                type="text"
                id="client-id"
                name="client-id"
                value={clientID}
                onChange={(_event, val) => setClientID(val)}
                placeholder="my-client-id"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {t('The client ID registered with the OIDC provider')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            <FormGroup label={t('Issuer URL')} isRequired fieldId="issuer-url">
              <TextInput
                isRequired
                type="url"
                id="issuer-url"
                name="issuer-url"
                value={issuerURL}
                onChange={(_event, val) => setIssuerURL(val)}
                placeholder="https://auth.example.com"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {t('The base URL of the OIDC provider (e.g. https://auth.example.com)')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            <ActionGroup className="pf-u-mt-0">
              <KuadrantCreateUpdate
                model={oidcPolicyModel}
                resource={oidcPolicy}
                policyType="oidc"
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

export default KuadrantOIDCPolicyCreatePage;
