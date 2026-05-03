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
  useK8sModel,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { useNavigate, useLocation } from 'react-router-dom-v5-compat';
import * as yaml from 'js-yaml';
import KuadrantCreateUpdate from './KuadrantCreateUpdate';
import { handleCancel } from '../utils/cancel';
import { RESOURCES, ResourceKind } from '../utils/resources';

class ErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

const KuadrantPolicyEditPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [createView, setCreateView] = React.useState<'form' | 'yaml'>('form');

  const location = useLocation();
  const pathSplit = location.pathname.split('/');
  // Expected path: /k8s/ns/:ns/:kind/name/:name/edit
  const nsParam = pathSplit[3] || 'default';
  const kindParam = pathSplit[4] || '';
  const nameParam = pathSplit[6] || '';

  const matchedKind = Object.keys(RESOURCES).find(
    (k) => k.toLowerCase() === kindParam.toLowerCase()
  ) as ResourceKind;

  const model = matchedKind ? RESOURCES[matchedKind].gvk : null;
  const isPolicy = matchedKind ? RESOURCES[matchedKind].isPolicy : false;

  const [k8sModel] = useK8sModel(
    model ? { group: model.group, version: model.version, kind: model.kind } : null
  );

  const watchResource = model && nameParam ? {
    groupVersionKind: model,
    isList: false,
    name: nameParam,
    namespace: nsParam,
  } : null;

  const [resourceData, loaded, error] = watchResource
    ? useK8sWatchResource(watchResource)
    : [null, true, null];

  const [policyName, setPolicyName] = React.useState(nameParam);
  const [targetRefName, setTargetRefName] = React.useState('');
  const [yamlInput, setYamlInput] = React.useState<any>(null);

  React.useEffect(() => {
    if (loaded && !error && resourceData && !Array.isArray(resourceData)) {
      setPolicyName(resourceData.metadata?.name || nameParam);
      setTargetRefName((resourceData as any).spec?.targetRef?.name || '');
      setYamlInput(resourceData);
    }
  }, [resourceData, loaded, error]);

  const handleYAMLChange = (yamlStr: string) => {
    try {
      const parsed = yaml.load(yamlStr) as any;
      if (parsed) {
        setPolicyName(parsed.metadata?.name || '');
        setTargetRefName(parsed.spec?.targetRef?.name || '');
        setYamlInput(parsed);
      }
    } catch (e) {
      console.error(t('Error parsing YAML:'), e);
    }
  };

  const navigate = useNavigate();

  const handleCancelResource = () => {
    handleCancel(nsParam, resourceData || {}, navigate);
  };

  const updatedResource = React.useMemo(() => {
    if (!resourceData) return null;
    return {
      ...resourceData,
      metadata: {
        ...resourceData.metadata,
        name: policyName,
      },
      spec: {
        ...(resourceData as any).spec,
        targetRef: {
          ...((resourceData as any).spec?.targetRef || {}),
          name: targetRefName,
        },
      },
    };
  }, [resourceData, policyName, targetRefName]);

  // Fallback 1: If not a Kuadrant Policy, render the YAML editor instead
  if (!isPolicy || !model) {
    return (
      <React.Suspense fallback={<div>{t('Loading...')}</div>}>
        <ResourceYAMLEditor
          initialResource={yamlInput || resourceData}
          create={false}
          onChange={handleYAMLChange}
        />
      </React.Suspense>
    );
  }

  if (!loaded) {
    return <PageSection>{t('Loading...')}</PageSection>;
  }

  const yamlViewNode = (
    <React.Suspense fallback={<div>{t('Loading...')}</div>}>
      <ResourceYAMLEditor
        initialResource={yamlInput || resourceData}
        create={false}
        onChange={handleYAMLChange}
      />
    </React.Suspense>
  );

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Edit {{kind}}', { kind: matchedKind })}</title>
      </Helmet>
      <PageSection hasBodyWrapper={false} className="pf-m-no-padding">
        <div className="co-m-nav-title">
          <Title headingLevel="h1">{t('Edit {{kind}}', { kind: matchedKind })}</Title>
          <p className="help-block">
            {t('Edit the configuration for the selected Kuadrant policy.')}
          </p>
        </div>
        <FormGroup
          className="kuadrant-editor-toggle"
          role="radiogroup"
          isInline
          fieldId="edit-type-radio-group"
          label={t('Configure via')}
        >
          <Radio
            name="edit-type-radio"
            label={t('Form View')}
            id="edit-type-radio-form"
            isChecked={createView === 'form'}
            onChange={() => setCreateView('form')}
          />
          <Radio
            name="edit-type-radio"
            label={t('YAML View')}
            id="edit-type-radio-yaml"
            isChecked={createView === 'yaml'}
            onChange={() => setCreateView('yaml')}
          />
        </FormGroup>
      </PageSection>

      {createView === 'form' ? (
        <ErrorBoundary fallback={yamlViewNode}>
          <PageSection hasBodyWrapper={false}>
            <Form className="co-m-pane__form">
              <FormGroup label={t('Policy Name')} isRequired fieldId="policy-name">
                <TextInput
                  isRequired
                  type="text"
                  id="policy-name"
                  name="policy-name"
                  value={policyName}
                  isDisabled
                  onChange={(_event, value) => setPolicyName(value)}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>{t('Name of the policy')}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>

              <FormGroup label={t('Target Ref Name')} isRequired fieldId="target-ref-name">
                <TextInput
                  isRequired
                  type="text"
                  id="target-ref-name"
                  name="target-ref-name"
                  value={targetRefName}
                  onChange={(_event, value) => setTargetRefName(value)}
                  placeholder={t('Target reference name')}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>{t('The name of the Gateway or HTTPRoute being targeted')}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>

              <ActionGroup className="pf-u-mt-0">
                <KuadrantCreateUpdate
                  model={k8sModel}
                  resource={updatedResource || {}}
                  policyType={matchedKind.toLowerCase()}
                  navigate={navigate}
                  validation={!!targetRefName}
                  update={true}
                />
                <Button variant="link" onClick={handleCancelResource}>
                  {t('Cancel')}
                </Button>
              </ActionGroup>
            </Form>
          </PageSection>
        </ErrorBoundary>
      ) : (
        yamlViewNode
      )}
    </>
  );
};

export default KuadrantPolicyEditPage;
