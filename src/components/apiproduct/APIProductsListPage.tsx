import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom-v5-compat';
import { PageSection, Title, Tooltip } from '@patternfly/react-core';
import {
  useActiveNamespace,
  NamespaceBar,
  ListPageCreateLink,
  useAccessReview,
} from '@openshift-console/dynamic-plugin-sdk';
import ResourceList from '../ResourceList';
import { RESOURCES } from '../../utils/resources';
import { getResourceNameFromKind } from '../../utils/getModelFromResource';
import '../kuadrant.css';

const APIProductsListPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();
  const navigate = useNavigate();

  const resolvedNamespace = activeNamespace === '#ALL_NS#' ? 'default' : activeNamespace;

  const [canCreate, canCreateLoading] = useAccessReview({
    group: RESOURCES.APIProduct.gvk.group,
    resource: getResourceNameFromKind(RESOURCES.APIProduct.gvk.kind),
    verb: 'create',
    namespace: resolvedNamespace,
  });

  const handleNamespaceChange = (namespace: string) => {
    if (namespace !== '#ALL_NS#') {
      navigate(`/kuadrant/ns/${namespace}/apiproducts`, { replace: true });
    } else {
      navigate('/kuadrant/all-namespaces/apiproducts', { replace: true });
    }
  };

  return (
    <>
      <NamespaceBar onNamespaceChange={handleNamespaceChange} />
      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h1">{t('API Products')}</Title>
      </PageSection>
      <PageSection hasBodyWrapper={false} className="kuadrant-policy-list-body">
        <div className="co-m-nav-title--row kuadrant-resource-create-container">
          <ResourceList
            resources={[RESOURCES.APIProduct.gvk]}
            namespace={activeNamespace}
            emptyResourceName="API Products"
          />
          <div className="kuadrant-resource-create-button pf-u-mt-md">
            {!canCreateLoading && canCreate ? (
              <ListPageCreateLink to={`/kuadrant/ns/${resolvedNamespace}/apiproducts/~new`}>
                {t('Create API Product')}
              </ListPageCreateLink>
            ) : (
              <Tooltip content={t('You do not have permission to create an API Product')}>
                <span
                  className="pf-c-button pf-m-primary pf-u-mt-md pf-u-mr-md"
                  style={{ opacity: 0.4 }}
                >
                  {t('Create API Product')}
                </span>
              </Tooltip>
            )}
          </div>
        </div>
      </PageSection>
    </>
  );
};

export default APIProductsListPage;
