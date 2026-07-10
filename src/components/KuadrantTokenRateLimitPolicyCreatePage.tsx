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
  Modal,
  ModalBody,
  ModalFooter,
  Label,
  LabelGroup,
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

interface TokenRate {
  limit: number;
  window: string;
}

interface TokenLimitConfig {
  rates: TokenRate[];
}

interface TokenLimitMap {
  [name: string]: TokenLimitConfig;
}

const windowPattern = /^([0-9]{1,5}(h|m|s|ms)){1,4}$/;

const KuadrantTokenRateLimitPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');
  const [policyName, setPolicyName] = React.useState('');
  const [selectedNamespace] = useActiveNamespace();
  const [selectedGateway, setSelectedGateway] = React.useState<Gateway>({
    name: '',
    namespace: '',
  });
  const [limits, setLimits] = React.useState<TokenLimitMap>({});
  const [creationTimestamp, setCreationTimestamp] = React.useState('');
  const [resourceVersion, setResourceVersion] = React.useState('');
  const [formDisabled, setFormDisabled] = React.useState(false);
  const [create, setCreate] = React.useState(true);

  // Local modal state for adding limits
  const [isAddLimitOpen, setIsAddLimitOpen] = React.useState(false);
  const [newLimitName, setNewLimitName] = React.useState('');
  const [modalRates, setModalRates] = React.useState<TokenRate[]>([]);
  const [newLimitValue, setNewLimitValue] = React.useState<number | ''>('');
  const [newLimitWindow, setNewLimitWindow] = React.useState('');

  function createTokenRateLimitPolicy() {
    return {
      apiVersion:
        resourceGVKMapping['TokenRateLimitPolicy'].group +
        '/' +
        resourceGVKMapping['TokenRateLimitPolicy'].version,
      kind: resourceGVKMapping['TokenRateLimitPolicy'].kind,
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
        limits,
      },
    };
  }

  const [yamlInput, setYamlInput] = React.useState(createTokenRateLimitPolicy);
  const tokenRateLimitPolicy = createTokenRateLimitPolicy();
  const tokenRateLimitPolicyGVK = getGroupVersionKindForResource({
    apiVersion: `${resourceGVKMapping['TokenRateLimitPolicy'].group}/${resourceGVKMapping['TokenRateLimitPolicy'].version}`,
    kind: resourceGVKMapping['TokenRateLimitPolicy'].kind,
  });
  const [tokenRateLimitPolicyModel] = useK8sModel({
    group: tokenRateLimitPolicyGVK.group,
    version: tokenRateLimitPolicyGVK.version,
    kind: tokenRateLimitPolicyGVK.kind,
  });

  const navigate = useNavigate();
  const location = useLocation();
  const pathSplit = location.pathname.split('/');
  const nameEdit = pathSplit[6];
  const namespaceEdit = pathSplit[3];

  interface TokenRateLimitPolicyEdit extends K8sResourceCommon {
    spec?: {
      targetRef?: {
        group?: string;
        kind?: string;
        name?: string;
        namespace?: string;
      };
      limits?: TokenLimitMap;
    };
  }

  //Checking if the policy already exists and is to be edited or if its new and is being created
  let tokenRateLimitResource = null;
  if (nameEdit) {
    tokenRateLimitResource = {
      groupVersionKind: tokenRateLimitPolicyGVK,
      isList: false,
      name: nameEdit,
      namespace: namespaceEdit,
    };
  }

  const [trlData, trlLoaded, trlError] = tokenRateLimitResource
    ? useK8sWatchResource(tokenRateLimitResource)
    : [null, false, null]; //Syntax allows for tokenRateLimitResource to be null in the case of a create

  React.useEffect(() => {
    if (trlLoaded && !trlError) {
      if (!Array.isArray(trlData)) {
        const trlPolicyUpdate = trlData as TokenRateLimitPolicyEdit;
        setCreationTimestamp(trlPolicyUpdate.metadata.creationTimestamp);
        setResourceVersion(trlPolicyUpdate.metadata.resourceVersion);
        setFormDisabled(true);
        setCreate(false);
        setPolicyName(trlPolicyUpdate.metadata?.name || '');
        setSelectedGateway({
          name: trlPolicyUpdate.spec?.targetRef?.name || '',
          namespace: trlPolicyUpdate.metadata?.namespace || '',
        });
        setLimits(trlPolicyUpdate.spec?.limits || {});
      }
    } else if (trlError) {
      console.error('Failed to fetch the resource:', trlError);
    }
  }, [trlData, trlLoaded, trlError]);

  const handleYAMLChange = (yamlInput: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsedYaml = yaml.load(yamlInput) as Record<string, any>;
      setPolicyName(parsedYaml.metadata?.name || '');
      setSelectedGateway({
        name: parsedYaml.spec?.targetRef?.name || '',
        namespace: parsedYaml.metadata?.namespace || '',
      });
      setLimits(parsedYaml.spec?.limits || {});
    } catch (e) {
      console.error(t('Error parsing YAML:'), e);
    }
  };

  React.useEffect(() => {
    setYamlInput(tokenRateLimitPolicy);
  }, [policyName, selectedNamespace, selectedGateway, limits, creationTimestamp, resourceVersion]);

  const handlePolicyChange = (_event, policy: string) => {
    setPolicyName(policy);
  };

  const handleCancelResource = () => {
    handleCancel(navigate);
  };

  const handleRemoveLimit = (name: string) => {
    setLimits((prevLimits) => {
      const updatedLimits = { ...prevLimits };
      delete updatedLimits[name];
      return updatedLimits;
    });
  };

  const handleOpenAddLimit = () => {
    setNewLimitName('');
    setModalRates([]);
    setNewLimitValue('');
    setNewLimitWindow('');
    setIsAddLimitOpen(false);
    setIsAddLimitOpen(true);
  };

  const handleAddRate = () => {
    if (newLimitValue !== '' && newLimitWindow && windowPattern.test(newLimitWindow)) {
      setModalRates((prev) => [...prev, { limit: Number(newLimitValue), window: newLimitWindow }]);
      setNewLimitValue('');
      setNewLimitWindow('');
    }
  };

  const handleSaveLimit = () => {
    if (newLimitName && modalRates.length > 0 && !isDuplicateName) {
      setLimits((prevLimits) => ({
        ...prevLimits,
        [newLimitName]: { rates: modalRates },
      }));
      setIsAddLimitOpen(false);
    }
  };

  const isDuplicateName = newLimitName !== '' && !!limits[newLimitName];
  const isValidWindow = newLimitWindow === '' || windowPattern.test(newLimitWindow);

  const isAddLimitSaveDisabled = !newLimitName || modalRates.length === 0 || isDuplicateName;

  const isFormValid = !!(policyName && selectedGateway.name);

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">
          {create ? t('Create TokenRateLimit Policy') : t('Edit TokenRateLimit Policy')}
        </title>
      </Helmet>
      <PageSection hasBodyWrapper={false}>
        <div className="co-m-nav-title">
          <Title headingLevel="h1">
            {create ? t('Create TokenRateLimit Policy') : t('Edit TokenRateLimit Policy')}
          </Title>
          <p className="help-block">
            {t('TokenRateLimitPolicy configures token-based rate limiting for your gateway')}
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
                onChange={handlePolicyChange}
                isDisabled={formDisabled}
                placeholder={t('Policy name')}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>{t('Unique name of the TokenRateLimit Policy')}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            <GatewaySelect selectedGateway={selectedGateway} onChange={setSelectedGateway} />
            <FormGroup>
              <Title headingLevel="h2" size="lg" className="kuadrant-limits-header">
                {t('Configured Limits')}
              </Title>
              <LabelGroup numLabels={5}>
                {Object.keys(limits).length > 0 ? (
                  Object.entries(limits).map(([name, limitConfig], index) => (
                    <Label key={index} color="blue" onClose={() => handleRemoveLimit(name)}>
                      <strong>{name}</strong>:{' '}
                      {limitConfig.rates.map((r, i) => (
                        <span key={i}>
                          {i > 0 ? ', ' : ''}
                          {r.limit} per {r.window}
                        </span>
                      ))}
                    </Label>
                  ))
                ) : (
                  <p>{t('No limits configured yet')}</p>
                )}
              </LabelGroup>
              <Button
                variant="primary"
                onClick={handleOpenAddLimit}
                className="kuadrant-limits-button"
              >
                {t('Add Limit')}
              </Button>
            </FormGroup>
            <ActionGroup className="pf-u-mt-0">
              <KuadrantCreateUpdate
                model={tokenRateLimitPolicyModel}
                resource={tokenRateLimitPolicy}
                policyType="tokenratelimit"
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
      {/* Modal to add a new token rate limit */}
      <Modal
        title={t('Add Limit')}
        isOpen={isAddLimitOpen}
        onClose={() => setIsAddLimitOpen(false)}
        variant="small"
        aria-label="Add token rate limit"
      >
        <ModalBody>
          <Form>
            <FormGroup label={t('Limit Name')} isRequired fieldId="new-limit-name">
              <TextInput
                isRequired
                type="text"
                id="new-limit-name"
                value={newLimitName}
                onChange={(_event, value) => setNewLimitName(value)}
                placeholder={t('Limit Name')}
                validated={isDuplicateName ? 'error' : 'default'}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant={isDuplicateName ? 'error' : 'default'}>
                    {isDuplicateName
                      ? t('A limit with this name already exists')
                      : t('Unique identifier for this rate limit')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            <Title headingLevel="h3" size="md">
              {t('Rates')}
            </Title>
            <LabelGroup numLabels={10}>
              {modalRates.map((rate, i) => (
                <Label
                  key={i}
                  color="blue"
                  onClose={() => setModalRates((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  {rate.limit} per {rate.window}
                </Label>
              ))}
            </LabelGroup>
            <FormGroup label={t('Limit')} isRequired fieldId="new-limit-value">
              <TextInput
                isRequired
                type="text"
                id="new-limit-value"
                value={newLimitValue === '' ? '' : String(newLimitValue)}
                onChange={(_event, value) => {
                  if (value === '' || /^\d+$/.test(value)) {
                    setNewLimitValue(value === '' ? '' : Number(value));
                  }
                }}
                placeholder={t('Limit value')}
                validated={newLimitValue !== '' && Number(newLimitValue) <= 0 ? 'error' : 'default'}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {t('Maximum number of requests allowed in the time window')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            <FormGroup label={t('Window')} isRequired fieldId="new-limit-window">
              <TextInput
                isRequired
                type="text"
                id="new-limit-window"
                value={newLimitWindow}
                onChange={(_event, value) => setNewLimitWindow(value)}
                placeholder="e.g. 1h, 60s, 500ms, 1h30m"
                validated={isValidWindow ? 'default' : 'error'}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant={isValidWindow ? 'default' : 'error'}>
                    {isValidWindow
                      ? t('Time window for the rate limit (e.g. 1h, 60s, 1440m)')
                      : t('Format must be like: 1h, 60s, 500ms, or 1h30m')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            <Button
              variant="secondary"
              onClick={handleAddRate}
              isDisabled={newLimitValue === '' || !newLimitWindow || !isValidWindow}
            >
              {t('Add Rate')}
            </Button>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button
            key="save"
            variant="primary"
            onClick={handleSaveLimit}
            isDisabled={isAddLimitSaveDisabled}
          >
            {t('Save Limit')}
          </Button>
          <Button key="cancel" variant="link" onClick={() => setIsAddLimitOpen(false)}>
            {t('Cancel')}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default KuadrantTokenRateLimitPolicyCreatePage;
