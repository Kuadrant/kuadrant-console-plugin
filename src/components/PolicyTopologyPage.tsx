import * as React from 'react';
import Helmet from 'react-helmet';
import { Page, PageSection, Title, Card, CardTitle, CardBody } from '@patternfly/react-core';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import PolicyTopology from 'react-policy-topology';
import './kuadrant.css';

const PolicyTopologyPage: React.FC = () => {
  // Watch the ConfigMap named "topology" in the "kuadrant-system" namespace
  // TODO: watch for these in any NS with `Kuadrant` resources
  const [configMap, loaded, loadError] = useK8sWatchResource<any>({
    groupVersionKind: {
      version: 'v1',
      kind: 'ConfigMap',
    },
    name: 'topology',
    namespace: 'kuadrant-system',
  });

  const dotString = loaded && !loadError ? configMap.data?.topology || '' : '';

  return (
    <>
      <Helmet>
        <title>Policy Topology</title>
      </Helmet>
      <Page>
        <PageSection variant="light">
          <Title headingLevel="h1">Policy Topology</Title>
        </PageSection>
        <PageSection className="policy-topology-section">
          <Card>
            <CardTitle>Topology View</CardTitle>
            <CardBody>
              {loaded ? (
                loadError ? (
                  <div>Error loading topology: {loadError.message}</div>
                ) : (
                  <PolicyTopology key={dotString} initialDotString={dotString} />
                )
              ) : (
                <div>Loading...</div>
              )}
            </CardBody>
          </Card>
        </PageSection>
      </Page>
    </>
  );
};

export default PolicyTopologyPage;
