import * as React from 'react';
import { useParams } from 'react-router-dom';
import Helmet from 'react-helmet';
import { useTranslation } from 'react-i18next';
import {
  Page,
  PageSection,
  Title,
} from '@patternfly/react-core';
import {
  Table,
  Thead,
  Tr,
  Th,
  Td,
  Tbody,
} from '@patternfly/react-table';
import { useK8sWatchResource, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import './example.css';

interface Resource {
  name: string;
  gvk: {
    group: string;
    version: string;
    kind: string;
  };
}

const ExamplePage: React.FC = () => {
  const { t } = useTranslation('plugin__console-plugin-template');
  const { ns } = useParams<{ ns: string }>();

  const resources: Resource[] = [
    { name: 'Gateways', gvk: { group: 'gateway.networking.k8s.io', version: 'v1', kind: 'Gateway' } },
    { name: 'AuthPolicies', gvk: { group: 'kuadrant.io', version: 'v1beta2', kind: 'AuthPolicy' } },
    { name: 'DNSPolicies', gvk: { group: 'kuadrant.io', version: 'v1alpha1', kind: 'DNSPolicy' } },
    { name: 'DNSRecords', gvk: { group: 'kuadrant.io', version: 'v1alpha1', kind: 'DNSRecord' } },
    { name: 'Kuadrants', gvk: { group: 'kuadrant.io', version: 'v1beta1', kind: 'Kuadrant' } },
    { name: 'ManagedZones', gvk: { group: 'kuadrant.io', version: 'v1alpha1', kind: 'ManagedZone' } },
    { name: 'RateLimitPolicies', gvk: { group: 'kuadrant.io', version: 'v1beta2', kind: 'RateLimitPolicy' } },
    { name: 'TLSPolicies', gvk: { group: 'kuadrant.io', version: 'v1alpha1', kind: 'TLSPolicy' } },
  ];

  const [data, setData] = React.useState<{ [key: string]: K8sResourceCommon[] }>({});
  const [loaded, setLoaded] = React.useState<{ [key: string]: boolean }>({});
  const [loadError, setLoadError] = React.useState<{ [key: string]: any }>({});

  resources.forEach((resource) => {
    const [resData, resLoaded, resLoadError] = useK8sWatchResource<K8sResourceCommon[]>({
      groupVersionKind: resource.gvk,
      namespace: ns || undefined,
      isList: true,
    });

    React.useEffect(() => {
      setData((prevData) => ({ ...prevData, [resource.name]: resData }));
      setLoaded((prevLoaded) => ({ ...prevLoaded, [resource.name]: resLoaded }));
      setLoadError((prevLoadError) => ({ ...prevLoadError, [resource.name]: resLoadError }));
    }, [resData, resLoaded, resLoadError, resource.name]);
  });

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const diffDays = Math.floor(diff / (1000 * 3600 * 24));
    return diffDays > 0 ? `${diffDays}d` : 'Today';
  };

  const renderTable = (resourceName: string, columns: string[]) => (
    <PageSection variant="light" key={resourceName}>
      <Title headingLevel="h1">{t(resourceName)}</Title>
      {loaded[resourceName] && !loadError[resourceName] ? (
        <Table aria-label={`${resourceName} List`}>
          <Thead>
            <Tr>
              {columns.map((col) => (
                <Th key={col}>{col}</Th>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {data[resourceName]?.map((item) => (
              <Tr key={item.metadata.name}>
                {columns.map((col) => (
                  <Td key={col} dataLabel={col}>
                    {col === 'Age' ? formatTimestamp(item.metadata.creationTimestamp) : item.metadata[col.toLowerCase()] || 'N/A'}
                  </Td>
                ))}
              </Tr>
            ))}
          </Tbody>
        </Table>
      ) : (
        <div>{t('Loading...')}</div>
      )}
    </PageSection>
  );

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Connectivity Link')}</title>
      </Helmet>
      <Page>
        <PageSection variant="light">
          <Title headingLevel="h1">{t('Connectivity Link')}</Title>
        </PageSection>
        {resources.map((resource) =>
          renderTable(resource.name, ['Name', 'Namespace', 'Age', 'Address'].slice(0, resource.name === 'Gateways' ? 4 : 3))
        )}
      </Page>
    </>
  );
};

export default ExamplePage;
