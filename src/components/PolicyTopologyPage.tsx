/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import Helmet from 'react-helmet';
import { PageSection, Title, Card, CardTitle, CardBody, Content } from '@patternfly/react-core';
import {
  useK8sWatchResource,
  useAccessReview,
  K8sVerb,
} from '@openshift-console/dynamic-plugin-sdk';
import {
  TopologyView,
  VisualizationProvider,
  VisualizationSurface,
} from '@patternfly/react-topology';
import { useTranslation } from 'react-i18next';
import './kuadrant.css';
import NoPermissionsView from './NoPermissionsView';
import { fetchConfig, TopologyConfig } from '../utils/topology/configLoader';
import { useVisualizationController } from '../hooks/topology/useVisualizationController';
import { useTopologyData } from '../hooks/topology/useTopologyData';
import { ResourceFilterToolbar } from './topology/ResourceFilterToolbar';
import { TopologyControls } from './topology/TopologyControls';

const PolicyTopologyPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  // config and state
  const [config, setConfig] = React.useState<TopologyConfig | null>(null);
  const [selectedResourceTypes, setSelectedResourceTypes] = React.useState<string[]>([]);
  const [selectedNamespace, setSelectedNamespace] = React.useState<string | null>(null);

  // filter handlers
  const onResourceSelect = (
    _event: React.MouseEvent | React.ChangeEvent | undefined,
    selection: string,
  ) => {
    if (selectedResourceTypes.includes(selection)) {
      setSelectedResourceTypes(selectedResourceTypes.filter((r) => r !== selection));
    } else {
      setSelectedResourceTypes([...selectedResourceTypes, selection]);
    }
  };

  const onDeleteResourceFilter = (_category: string, chip: string) => {
    if (chip) {
      setSelectedResourceTypes(selectedResourceTypes.filter((r) => r !== chip));
    }
  };

  const onDeleteResourceGroup = () => {
    setSelectedResourceTypes([]);
  };

  const clearAllFilters = () => {
    setSelectedResourceTypes([]);
    setSelectedNamespace(null);
  };

  const onNamespaceSelect = (
    _event: React.MouseEvent | React.ChangeEvent | undefined,
    selection: string | null,
  ) => {
    setSelectedNamespace(selection);
  };

  const onDeleteNamespace = () => {
    setSelectedNamespace(null);
  };

  // fetch configuration on mount
  React.useEffect(() => {
    const loadConfig = async () => {
      try {
        const configData = await fetchConfig();
        setConfig(configData);
      } catch (error) {
        console.error('Error loading config.js:', error);
      }
    };
    loadConfig();
  }, []);

  // watch the ConfigMap with topology data
  const [configMap, loaded, loadError] = useK8sWatchResource<any>(
    config
      ? {
          groupVersionKind: {
            version: 'v1',
            kind: 'ConfigMap',
          },
          name: config.TOPOLOGY_CONFIGMAP_NAME,
          namespace: config.TOPOLOGY_CONFIGMAP_NAMESPACE,
        }
      : null,
  );

  // create visualization controller
  const controller = useVisualizationController();

  // process topology data and apply to controller
  const { allResourceTypes, allNamespaces, parseError } = useTopologyData({
    controller,
    configMapData: configMap?.data?.topology || null,
    selectedResourceTypes,
    selectedNamespace,
    onInitialSelection: setSelectedResourceTypes,
    loaded,
    loadError,
  });

  // RBAC check for ConfigMap access
  const accessReviewProps = React.useMemo(() => {
    return config
      ? {
          group: '',
          resource: 'ConfigMap',
          verb: 'read' as K8sVerb,
          namespace: config.TOPOLOGY_CONFIGMAP_NAMESPACE,
          name: config.TOPOLOGY_CONFIGMAP_NAME,
        }
      : {
          group: '',
          resource: '',
          verb: 'read' as K8sVerb,
          namespace: '',
          name: '',
        };
  }, [config]);

  const [canReadTopology, isLoadingPermissions] = useAccessReview(accessReviewProps);

  // loading states
  if (!config) {
    return <div>{t('Loading configuration...')}</div>;
  }

  if (isLoadingPermissions) {
    return <div>{t('Loading Permissions...')}</div>;
  }

  // permission denied
  if (!canReadTopology) {
    return (
      <NoPermissionsView
        primaryMessage={t('You do not have permission to view Policy Topology')}
        secondaryMessage={
          <>
            {t('Specifically, you do not have permission to read the ConfigMap ')}
            <strong>{config.TOPOLOGY_CONFIGMAP_NAME}</strong> {t('in the namespace ')}
            <strong>{config.TOPOLOGY_CONFIGMAP_NAMESPACE}</strong>
          </>
        }
      />
    );
  }

  return (
    <>
      <Helmet>
        <title>{t('Policy Topology')}</title>
      </Helmet>
      <PageSection>
        <Title headingLevel="h1">{t('Policy Topology')}</Title>
        <Card>
          <CardTitle>{t('Topology View')}</CardTitle>
          <CardBody>
            <Content>
              <Content component="p" className="pf-u-mb-md">
                {t(
                  'This view visualizes the relationships and interactions between different resources within your cluster related to Kuadrant, allowing you to explore connections between Gateways, HTTPRoutes and Kuadrant Policies.',
                )}
              </Content>
            </Content>

            <ResourceFilterToolbar
              allResourceTypes={allResourceTypes}
              selectedResourceTypes={selectedResourceTypes}
              allNamespaces={allNamespaces}
              selectedNamespace={selectedNamespace}
              onSelect={onResourceSelect}
              onNamespaceSelect={onNamespaceSelect}
              onDeleteFilter={onDeleteResourceFilter}
              onDeleteGroup={onDeleteResourceGroup}
              onDeleteNamespace={onDeleteNamespace}
              onClearAll={clearAllFilters}
            />

            {!loaded ? (
              <div>{t('Loading topology...')}</div>
            ) : loadError ? (
              <div>
                {t('Error loading topology:')} {loadError.message}
              </div>
            ) : parseError ? (
              <div>
                {t('Error parsing topology:')} {parseError}
              </div>
            ) : (
              controller && (
                <TopologyView
                  style={{ height: '70vh' }}
                  className="kuadrant-policy-topology"
                  controlBar={<TopologyControls controller={controller} />}
                >
                  <VisualizationProvider controller={controller}>
                    <VisualizationSurface />
                  </VisualizationProvider>
                </TopologyView>
              )
            )}
          </CardBody>
        </Card>
      </PageSection>
    </>
  );
};

export default PolicyTopologyPage;
