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
import './css/gateway-api-plugin.css';
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
import * as yaml from 'js-yaml';
import KuadrantCreateUpdate from './KuadrantCreateUpdate';
import { handleCancel } from '../utils/cancel';
import {
  resourceGVKMapping,
  RESOURCES,
  getTargetKindsForPolicy,
  isSupportedTargetRef,
} from '../utils/resources';

const GATEWAY_API_GROUP = RESOURCES.Gateway.gvk.group;
const SUPPORTED_TARGET_KINDS = getTargetKindsForPolicy('OIDCPolicy');

interface TargetRef {
  group: string;
  kind: 'Gateway' | 'HTTPRoute' | 'GRPCRoute';
  name: string;
}

const KuadrantOIDCPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');
  const [policyName, setPolicyName] = React.useState('');
  const [selectedNamespace] = useActiveNamespace();
  const [targetRef, setTargetRef] = React.useState<TargetRef>({
    group: GATEWAY_API_GROUP,
    kind: 'Gateway',
    name: '',
  });
  const [clientID, setClientID] = React.useState('');
  const [issuerURL, setIssuerURL] = React.useState('');
  const [creationTimestamp, setCreationTimestamp] = React.useState('');
  const [resourceVersion, setResourceVersion] = React.useState('');
  const [formDisabled, setFormDisabled] = React.useState(false);
  const [create, setCreate] = React.useState(true);

  const createOIDCPolicy = () => {
    return {
      apiVersion:
        resourceGVKMapping['OIDCPolicy'].group + '/' + resourceGVKMapping['OIDCPolicy'].version,
      kind: resourceGVKMapping['OIDCPolicy'].kind,
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
        provider: { clientID, issuerURL },
      },
    };
  };

  const [yamlInput, setYamlInput] = React.useState(createOIDCPolicy);

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

  const hasInitializedFromResource = React.useRef(false);

  React.useEffect(() => {
    if (oidcLoaded && !oidcError && oidcData) {
      if (!Array.isArray(oidcData)) {
        const oidcPolicyUpdate = oidcData as OIDCPolicyEdit;
        // Always keep resourceVersion/creationTimestamp current so Save doesn't
        // send a stale resourceVersion and hit a 409 conflict once the
        // controller writes status back to the resource.
        setCreationTimestamp(oidcPolicyUpdate.metadata?.creationTimestamp || '');
        setResourceVersion(oidcPolicyUpdate.metadata?.resourceVersion || '');
        if (!hasInitializedFromResource.current) {
          setFormDisabled(true);
          setCreate(false);
          setPolicyName(oidcPolicyUpdate.metadata?.name || '');
          setTargetRef({
            group: oidcPolicyUpdate.spec?.targetRef?.group || GATEWAY_API_GROUP,
            kind: (oidcPolicyUpdate.spec?.targetRef?.kind as TargetRef['kind']) || 'Gateway',
            name: oidcPolicyUpdate.spec?.targetRef?.name || '',
          });
          setClientID(oidcPolicyUpdate.spec?.provider?.clientID || '');
          setIssuerURL(oidcPolicyUpdate.spec?.provider?.issuerURL || '');
          hasInitializedFromResource.current = true;
        }
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
      const parsedTargetRef = parsedYaml.spec?.targetRef;
      if (
        isSupportedTargetRef(
          'OIDCPolicy',
          parsedTargetRef?.group,
          parsedTargetRef?.kind,
          parsedTargetRef?.namespace,
          selectedNamespace,
        )
      ) {
        setTargetRef({
          group: parsedTargetRef.group,
          kind: parsedTargetRef.kind as TargetRef['kind'],
          name: parsedTargetRef?.name || '',
        });
      } else {
        // unsupported group/kind - keep the target empty so the form stays
        // invalid rather than silently submitting a reference the CRD rejects
        setTargetRef({ group: GATEWAY_API_GROUP, kind: 'Gateway', name: '' });
      }
      setClientID(parsedYaml.spec?.provider?.clientID || '');
      setIssuerURL(parsedYaml.spec?.provider?.issuerURL || '');
    } catch (e) {
      console.error(t('Error parsing YAML:'), e);
    }
  };

  React.useEffect(() => {
    setYamlInput(oidcPolicy);
  }, [
    policyName,
    selectedNamespace,
    targetRef,
    clientID,
    issuerURL,
    creationTimestamp,
    resourceVersion,
  ]);

  const handleTargetTypeChange = (kind: TargetRef['kind']) => {
    setTargetRef({ group: GATEWAY_API_GROUP, kind, name: '' });
  };

  const handleGatewayChange = (gw: GatewayResource) => {
    setTargetRef({ group: GATEWAY_API_GROUP, kind: 'Gateway', name: gw.metadata?.name ?? '' });
  };

  const handleRouteChange = (kind: RouteKind) => (route: { name: string; namespace: string }) => {
    setTargetRef({ group: GATEWAY_API_GROUP, kind, name: route.name ?? '' });
  };

  const selectedGateway: GatewayResource = React.useMemo(
    () =>
      ({
        metadata: {
          name: targetRef.kind === 'Gateway' ? targetRef.name : '',
          namespace: targetRef.kind === 'Gateway' ? selectedNamespace : '',
        },
      } as GatewayResource),
    [targetRef, selectedNamespace],
  );

  const selectedRoute = React.useMemo(
    () => ({
      name: targetRef.kind === 'Gateway' ? '' : targetRef.name,
      namespace: targetRef.kind === 'Gateway' ? '' : selectedNamespace,
    }),
    [targetRef, selectedNamespace],
  );

  const handleCancelResource = () => {
    handleCancel(navigate);
  };

  const isFormValid = !!(policyName && targetRef.name && clientID && issuerURL);

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">
          {create ? t('Create OIDC Policy') : t('Edit OIDC Policy')}
        </title>
      </Helmet>
      <PageSection hasBodyWrapper={false}>
        <div className="co-m-nav-title">
          <Title headingLevel="h1">
            {create ? t('Create OIDC Policy') : t('Edit OIDC Policy')}
          </Title>
          <p className="help-block">
            {t('OIDCPolicy configures OIDC authentication for your gateway')}
          </p>
        </div>
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
                    isDisabled={formDisabled}
                  />
                  <Radio
                    name="target-type-radio"
                    label={t('HTTPRoute')}
                    id="target-type-radio-httproute"
                    isChecked={targetRef.kind === 'HTTPRoute'}
                    onChange={() => handleTargetTypeChange('HTTPRoute')}
                    isDisabled={formDisabled}
                  />
                  {SUPPORTED_TARGET_KINDS.includes('GRPCRoute') && (
                    <Radio
                      name="target-type-radio"
                      label={t('GRPCRoute')}
                      id="target-type-radio-grpcroute"
                      isChecked={targetRef.kind === 'GRPCRoute'}
                      onChange={() => handleTargetTypeChange('GRPCRoute')}
                      isDisabled={formDisabled}
                    />
                  )}
                </FormGroup>
                {targetRef.kind === 'Gateway' && (
                  <GatewaySelect
                    selectedGateway={selectedGateway}
                    onChange={handleGatewayChange}
                    namespace={selectedNamespace}
                    isDisabled={formDisabled}
                  />
                )}
                {targetRef.kind === 'HTTPRoute' && (
                  <HTTPRouteSelect
                    selectedRoute={selectedRoute}
                    onChange={handleRouteChange('HTTPRoute')}
                    namespace={selectedNamespace}
                    isDisabled={formDisabled}
                  />
                )}
                {targetRef.kind === 'GRPCRoute' && SUPPORTED_TARGET_KINDS.includes('GRPCRoute') && (
                  <HTTPRouteSelect
                    kind="GRPCRoute"
                    selectedRoute={selectedRoute}
                    onChange={handleRouteChange('GRPCRoute')}
                    namespace={selectedNamespace}
                    isDisabled={formDisabled}
                  />
                )}
                <FormGroup label={t('Client ID')} isRequired fieldId="client-id">
                  <TextInput
                    isRequired
                    type="text"
                    id="client-id"
                    name="client-id"
                    value={clientID}
                    onChange={(_event, val) => setClientID(val)}
                    placeholder={t('my-client-id')}
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
                    placeholder={t('https://auth.example.com')}
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
          </Tab>
          <Tab eventKey="yaml" title={<TabTitleText>{t('YAML')}</TabTitleText>}>
            <div className="kuadrant-oidcpolicy-yaml-editor">
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

export default KuadrantOIDCPolicyCreatePage;
