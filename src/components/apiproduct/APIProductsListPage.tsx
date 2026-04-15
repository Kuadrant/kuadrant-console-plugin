import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom-v5-compat';
import { PageSection, Title, Label, LabelGroup } from '@patternfly/react-core';
import { sortable } from '@patternfly/react-table';
import {
  useActiveNamespace,
  NamespaceBar,
  TableColumn,
  K8sResourceCommon,
  ResourceLink,
  TableData,
  Timestamp,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import ResourceList from '../ResourceList';
import { RESOURCES } from '../../utils/resources';
import { APIProduct, PlanPolicy } from './types';
import '../kuadrant.css';

const APIProductsListPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();
  const navigate = useNavigate();

  const handleNamespaceChange = (namespace: string) => {
    if (namespace !== '#ALL_NS#') {
      navigate(`/kuadrant/ns/${namespace}/apiproducts`, { replace: true });
    } else {
      navigate('/kuadrant/all-namespaces/apiproducts', { replace: true });
    }
  };

  // Watch PlanPolicy resources to link them to APIProducts
  const [planPolicies, planPoliciesLoaded] = useK8sWatchResource<PlanPolicy[]>({
    groupVersionKind: RESOURCES.PlanPolicy.gvk,
    namespace: activeNamespace === '#ALL_NS#' ? undefined : activeNamespace,
    isList: true,
  });

  // Build a lookup map: HTTPRoute key -> PlanPolicy
  // Key format: "namespace/routeName"
  const planPolicyMap = React.useMemo(() => {
    const map = new Map<string, PlanPolicy>();
    if (planPoliciesLoaded && planPolicies) {
      planPolicies.forEach((policy) => {
        const targetRef = policy.spec?.targetRef;
        if (targetRef && targetRef.kind === 'HTTPRoute' && targetRef.name) {
          // Use the policy's namespace if targetRef.namespace is not specified
          const targetNamespace = targetRef.namespace || policy.metadata?.namespace;
          const key = `${targetNamespace}/${targetRef.name}`;
          // Store first matching policy (could be extended to handle multiple)
          if (!map.has(key)) {
            map.set(key, policy);
          }
        }
      });
    }
    return map;
  }, [planPolicies, planPoliciesLoaded]);

  // Custom columns for API Products - in specified order
  const columns: TableColumn<K8sResourceCommon>[] = React.useMemo(
    () => [
      {
        title: t('Name'),
        id: 'name',
        sort: 'metadata.name',
        transforms: [sortable],
      },
      {
        title: t('Version'),
        id: 'version',
        sort: 'spec.version',
        transforms: [sortable],
      },
      {
        title: t('Route'),
        id: 'route',
      },
      {
        title: t('PlanPolicy'),
        id: 'planpolicy',
      },
      {
        title: t('Namespace'),
        id: 'namespace',
        sort: 'metadata.namespace',
        transforms: [sortable],
      },
      {
        title: t('Status'),
        id: 'status',
        sort: 'spec.publishStatus',
        transforms: [sortable],
      },
      {
        title: t('Tags'),
        id: 'tags',
      },
      {
        title: t('Created'),
        id: 'created',
        sort: 'metadata.creationTimestamp',
        transforms: [sortable],
      },
      {
        title: '',
        id: 'kebab',
        props: { className: 'pf-v6-c-table__action' },
      },
    ],
    [t],
  );

  // Custom renderers for API Product-specific columns
  const renderers = React.useMemo(
    () => ({
      version: (
        column: TableColumn<K8sResourceCommon>,
        resource: K8sResourceCommon,
        activeColumnIDs: Set<string>,
      ) => {
        const apiProduct = resource as APIProduct;
        return (
          <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
            {apiProduct.spec?.version || 'v1.0.0'}
          </TableData>
        );
      },
      route: (
        column: TableColumn<K8sResourceCommon>,
        resource: K8sResourceCommon,
        activeColumnIDs: Set<string>,
      ) => {
        const apiProduct = resource as APIProduct;
        const targetRef = apiProduct.spec?.targetRef;
        return (
          <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
            {targetRef ? (
              <ResourceLink
                groupVersionKind={{
                  group: targetRef.group || 'gateway.networking.k8s.io',
                  version: 'v1',
                  kind: targetRef.kind,
                }}
                name={targetRef.name}
                namespace={targetRef.namespace || resource.metadata?.namespace}
              />
            ) : (
              'N/A'
            )}
          </TableData>
        );
      },
      planpolicy: (
        column: TableColumn<K8sResourceCommon>,
        resource: K8sResourceCommon,
        activeColumnIDs: Set<string>,
      ) => {
        const apiProduct = resource as APIProduct;
        const targetRef = apiProduct.spec?.targetRef;

        // Find matching PlanPolicy based on the APIProduct's targetRef
        let matchingPolicy: PlanPolicy | undefined;
        if (targetRef && targetRef.kind === 'HTTPRoute' && targetRef.name) {
          const targetNamespace = targetRef.namespace || resource.metadata?.namespace;
          const key = `${targetNamespace}/${targetRef.name}`;
          matchingPolicy = planPolicyMap.get(key);
        }

        return (
          <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
            {matchingPolicy ? (
              <ResourceLink
                groupVersionKind={RESOURCES.PlanPolicy.gvk}
                name={matchingPolicy.metadata?.name}
                namespace={matchingPolicy.metadata?.namespace}
              />
            ) : (
              '-'
            )}
          </TableData>
        );
      },
      status: (
        column: TableColumn<K8sResourceCommon>,
        resource: K8sResourceCommon,
        activeColumnIDs: Set<string>,
      ) => {
        const apiProduct = resource as APIProduct;
        const lifecycle = apiProduct.spec?.publishStatus || 'Draft';
        return (
          <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
            <Label color={lifecycle === 'Published' ? 'green' : 'orange'}>{lifecycle}</Label>
          </TableData>
        );
      },
      tags: (
        column: TableColumn<K8sResourceCommon>,
        resource: K8sResourceCommon,
        activeColumnIDs: Set<string>,
      ) => {
        const apiProduct = resource as APIProduct;
        const tags = apiProduct.spec?.tags || [];
        return (
          <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
            {tags.length > 0 ? (
              <LabelGroup numLabels={3}>
                {tags.map((tag, index) => (
                  <Label key={index} color="teal">
                    {tag}
                  </Label>
                ))}
              </LabelGroup>
            ) : (
              '-'
            )}
          </TableData>
        );
      },
      created: (
        column: TableColumn<K8sResourceCommon>,
        resource: K8sResourceCommon,
        activeColumnIDs: Set<string>,
      ) => {
        return (
          <TableData key={column.id} id={column.id} activeColumnIDs={activeColumnIDs}>
            <Timestamp timestamp={resource.metadata?.creationTimestamp} />
          </TableData>
        );
      },
    }),
    [planPolicyMap],
  );

  return (
    <>
      <NamespaceBar onNamespaceChange={handleNamespaceChange} />
      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h1">{t('API Products')}</Title>
      </PageSection>
      <PageSection hasBodyWrapper={false} className="kuadrant-policy-list-body">
        <ResourceList
          resources={[RESOURCES.APIProduct.gvk]}
          namespace={activeNamespace}
          emptyResourceName="API Products"
          columns={columns}
          renderers={renderers}
        />
      </PageSection>
    </>
  );
};

export default APIProductsListPage;
