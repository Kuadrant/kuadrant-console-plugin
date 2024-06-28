import * as React from 'react';
import { useParams, useHistory, useLocation } from 'react-router-dom';
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
import { useK8sWatchResource, K8sResourceCommon, NamespaceBar } from '@openshift-console/dynamic-plugin-sdk';
import './example.css';

interface Resource {
  name: string;
  gvk: {
    group: string;
    version: string;
    kind: string;
  };
}

interface ExtendedK8sResourceCommon extends K8sResourceCommon {
  status?: {
    addresses?: { value: string }[];
  };
}

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

const ExamplePage: React.FC = () => {
  const { t } = useTranslation('plugin__console-plugin-template');
  const { ns } = useParams<{ ns: string }>();
  const history = useHistory();
  const location = useLocation();
  const [namespace, setNamespace] = React.useState<string>(ns || '');

  // Inline function to extract namespace from URL
  const useNamespaceFromURL = (): string => {
    const match = location.pathname.match(/\/k8s\/ns\/([^/]+)/);
    return match ? match[1] : '';
  };

  React.useEffect(() => {
    const extractedNamespace = useNamespaceFromURL();
    if (extractedNamespace && extractedNamespace !== namespace) {
      setNamespace(extractedNamespace);
    }
    console.log(`Initial namespace: ${namespace}`);
  }, [location.pathname]);

  const handleNamespaceChange = (newNamespace: string) => {
    console.log(`Namespace changed to: ${newNamespace}`);
    setNamespace(newNamespace);
    const url = newNamespace === '#ALL_NS#' ? '/k8s/all-namespaces/example' : `/k8s/ns/${newNamespace}/example`;
    history.push(url);
  };

  React.useEffect(() => {
    console.log(`Namespace updated: ${namespace}`);
  }, [namespace]);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const diffDays = Math.floor(diff / (1000 * 3600 * 24));
    return diffDays > 0 ? `${diffDays}d` : 'Today';
  };

  const renderTable = (resource: Resource, data: ExtendedK8sResourceCommon[], loaded: boolean, loadError: any) => (
    <PageSection variant="light" key={resource.name}>
      <Title headingLevel="h1">{resource.name}</Title>
      {loaded && !loadError ? (
        <Table aria-label={`${resource.name} List`}>
          <Thead>
            <Tr>
              <Th>{t('Name')}</Th>
              <Th>{t('Namespace')}</Th>
              <Th>{t('Age')}</Th>
              {resource.name === 'Gateways' && <Th>{t('Address')}</Th>}
            </Tr>
          </Thead>
          <Tbody>
            {data.map((item) => (
              <Tr key={item.metadata.uid}>
                <Td dataLabel={t('Name')}>{item.metadata.name}</Td>
                <Td dataLabel={t('Namespace')}>{item.metadata.namespace}</Td>
                <Td dataLabel={t('Age')}>{formatTimestamp(item.metadata.creationTimestamp)}</Td>
                {resource.name === 'Gateways' && (
                  <Td dataLabel={t('Address')}>
                    {item.status?.addresses?.length ? item.status.addresses.map((address) => address.value).join(', ') : 'N/A'}
                  </Td>
                )}
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
      {!document.querySelector('.co-namespace-bar') && <NamespaceBar onNamespaceChange={handleNamespaceChange} />}
      <Page>
        <PageSection variant="light">
          <Title headingLevel="h1">{t('Connectivity Link')}</Title>
        </PageSection>
        {resources.map((resource) => {
          const { group, version, kind } = resource.gvk;
          const [data, loaded, loadError] = useK8sWatchResource<ExtendedK8sResourceCommon[]>({
            groupVersionKind: { group, version, kind },
            namespace: namespace === '#ALL_NS#' ? undefined : namespace,
            isList: true,
          });

          // Adding logs for debugging
          React.useEffect(() => {
            console.log(`Resource: ${resource.name}`);
            console.log(`Namespace: ${namespace}`);
            console.log(`Data:`, data);
            console.log(`Loaded:`, loaded);
            console.log(`Load Error:`, loadError);
          }, [data, loaded, loadError, namespace, resource.name]);

          return renderTable(resource, data, loaded, loadError);
        })}
      </Page>
    </>
  );
};

export default ExamplePage;
