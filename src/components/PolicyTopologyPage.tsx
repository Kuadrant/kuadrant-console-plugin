import * as React from 'react';
import Helmet from 'react-helmet';
import { Page, PageSection, Title, Card, CardTitle, CardBody } from '@patternfly/react-core';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import PolicyTopology from 'react-policy-topology';
import * as dot from 'graphlib-dot';
import './kuadrant.css';

const PolicyTopologyPage: React.FC = () => {
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [safeDotString, setSafeDotString] = React.useState<string>('');

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

  React.useEffect(() => {
    if (loaded && !loadError) {
      const dotString = configMap.data?.topology || '';

      if (dotString) {
        try {
          // parse the DOT string for sanity
          const parsedGraph = dot.read(dotString);
          console.log(parsedGraph);
          setParseError(null);
          setSafeDotString(dotString);
        } catch (e) {
          // Catch and handle parsing errors
          setParseError((e as Error).message);
          setSafeDotString('');
        }
      } else {
        setSafeDotString('');
      }
    } else if (loadError) {
      console.error('Error loading config map:', loadError);
      setSafeDotString('');
    }
  }, [configMap, loaded, loadError]);

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
              {!loaded ? (
                <div>Loading...</div>
              ) : loadError ? (
                <div>Error loading topology: {loadError.message}</div>
              ) : parseError ? (
                // parsing error
                <div>Error parsing topology: {parseError}</div>
              ) : (
                // render PolicyTopology if there are no errors in parsing
                <PolicyTopology key={safeDotString} initialDotString={safeDotString} />
              )}
            </CardBody>
          </Card>
        </PageSection>
      </Page>
    </>
  );
};

export default PolicyTopologyPage;
