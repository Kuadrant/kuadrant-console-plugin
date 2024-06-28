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
import { useK8sWatchResource, K8sResourceCommon, ResourceLink, useActiveNamespace } from '@openshift-console/dynamic-plugin-sdk';
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

const RHCLDashboardPage: React.FC = () => {
  const { t } = useTranslation('plugin__console-plugin-template');
  const { ns } = useParams<{ ns: string }>();
  const [activeNamespace, setActiveNamespace] = useActiveNamespace();

  React.useEffect(() => {
    if (ns && ns !== activeNamespace) {
      setActiveNamespace(ns);
    }
    console.log(`Initial namespace: ${activeNamespace}`);
  }, [ns, activeNamespace, setActiveNamespace]);

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
                <Td dataLabel={t('Name')}>
                  <ResourceLink groupVersionKind={resource.gvk} namespace={item.metadata.namespace}  name={item.metadata.name} title={item.metadata.uid} />
                </Td>
                <Td dataLabel={t('Namespace')}>
                  <ResourceLink groupVersionKind={{group: resource.gvk.group, version: resource.gvk.version, kind: "Namespace"}} name={item.metadata.namespace} title={item.metadata.namespace} />
                </Td>
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
      <Page>
        <PageSection variant="light">
          <Title headingLevel="h1">{t('Connectivity Link')}</Title>
        </PageSection>
        {resources.map((resource) => {
          const { group, version, kind } = resource.gvk;
          const [data, loaded, loadError] = useK8sWatchResource<ExtendedK8sResourceCommon[]>({
            groupVersionKind: { group, version, kind },
            namespace: activeNamespace === '#ALL_NS#' ? undefined : activeNamespace,
            isList: true,
          });

          return renderTable(resource, data, loaded, loadError);
        })}
      </Page>
    </>
  );
};

export default RHCLDashboardPage;
