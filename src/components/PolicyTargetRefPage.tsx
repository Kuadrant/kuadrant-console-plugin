import * as React from 'react';
import Helmet from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { PageSection, Title, EmptyState, EmptyStateBody } from '@patternfly/react-core';
import { useLocation } from 'react-router-dom-v5-compat';
import {
  K8sResourceCommon,
  ResourceLink,
  RowProps,
  TableColumn,
  TableData,
  VirtualizedTable,
  useActiveNamespace,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { SearchIcon } from '@patternfly/react-icons';
import './kuadrant.css';
import extractResourceNameFromURL from '../utils/nameFromPath';
import { RESOURCES, ResourceKind } from '../utils/resources';
import { getStatusLabel } from '../utils/statusLabel';

type TargetRef = {
  group: string;
  kind: string;
  name: string;
  namespace?: string;
};

type PolicyResource = K8sResourceCommon & {
  spec?: {
    targetRef?: TargetRef;
  };
};

// extract the kind segment from a console URL like
// /k8s/ns/<ns>/<group>~v<ver>~<Kind>/<name>/...
const extractKindFromURL = (pathname: string): string | null => {
  const segment = pathname.split('/').find((s) => /^.+~v\d+~.+$/.test(s));
  if (!segment) return null;
  const parts = segment.split('~');
  return parts[2] ?? null;
};

const PolicyTargetRefPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();
  const location = useLocation();

  const policyName = extractResourceNameFromURL(location.pathname);
  const policyKindStr = extractKindFromURL(location.pathname);
  const policyMeta =
    policyKindStr && policyKindStr in RESOURCES
      ? RESOURCES[policyKindStr as ResourceKind]
      : undefined;

  const policyWatch =
    policyMeta && policyName
      ? {
          groupVersionKind: policyMeta.gvk,
          namespace: activeNamespace,
          name: policyName,
          isList: false,
        }
      : null;
  const [policy, policyLoaded, policyLoadError] = useK8sWatchResource<PolicyResource>(policyWatch);

  const targetRef = policy?.spec?.targetRef;
  const targetMeta =
    targetRef && targetRef.kind in RESOURCES
      ? RESOURCES[targetRef.kind as ResourceKind]
      : undefined;
  const targetNamespace = targetRef?.namespace || activeNamespace;

  const targetWatch =
    targetMeta && targetRef
      ? {
          groupVersionKind: targetMeta.gvk,
          namespace: targetNamespace,
          name: targetRef.name,
          isList: false,
        }
      : null;
  const [target, targetLoaded, targetLoadError] =
    useK8sWatchResource<K8sResourceCommon>(targetWatch);

  const columns: TableColumn<TargetRef>[] = [
    { title: t('Name'), id: 'name' },
    { title: t('Type'), id: 'type' },
    { title: t('Namespace'), id: 'namespace' },
    { title: t('Status'), id: 'status' },
  ];

  const TargetRow: React.FC<RowProps<TargetRef>> = ({ obj, activeColumnIDs }) => (
    <>
      {columns.map((column) => {
        switch (column.id) {
          case 'name':
            return (
              <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
                {targetMeta ? (
                  <ResourceLink
                    groupVersionKind={targetMeta.gvk}
                    name={obj.name}
                    namespace={targetNamespace}
                  />
                ) : (
                  obj.name
                )}
              </TableData>
            );
          case 'type':
            return (
              <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
                {obj.kind}
              </TableData>
            );
          case 'namespace':
            return (
              <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
                {targetNamespace || '-'}
              </TableData>
            );
          case 'status':
            return (
              <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
                {targetLoaded && !targetLoadError && target ? getStatusLabel(target) : '-'}
              </TableData>
            );
          default:
            return null;
        }
      })}
    </>
  );

  const renderBody = () => {
    if (!policyLoaded) return <div>{t('Loading...')}</div>;
    if (policyLoadError) {
      return (
        <div>{t('Error loading policy: {{message}}', { message: policyLoadError.message })}</div>
      );
    }
    if (!targetRef) {
      return (
        <EmptyState
          titleText={
            <Title headingLevel="h4" size="lg">
              {t('No target reference')}
            </Title>
          }
          icon={SearchIcon}
        >
          <EmptyStateBody>{t('This policy does not declare a spec.targetRef.')}</EmptyStateBody>
        </EmptyState>
      );
    }
    return (
      <VirtualizedTable<TargetRef>
        data={[targetRef]}
        unfilteredData={[targetRef]}
        loaded={policyLoaded}
        loadError={null}
        columns={columns}
        Row={TargetRow}
      />
    );
  };

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Target Reference')}</title>
      </Helmet>
      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h2">{t('Target Reference')}</Title>
        {renderBody()}
      </PageSection>
    </>
  );
};

export default PolicyTargetRefPage;
