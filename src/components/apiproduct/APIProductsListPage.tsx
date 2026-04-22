import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom-v5-compat';
import { PageSection, Title, Tooltip, Button } from '@patternfly/react-core';
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

  const isAllNamespaces = activeNamespace === '#ALL_NS#';

  // Skip RBAC check when viewing all namespaces
  const [canCreate, canCreateLoading] = useAccessReview(
    !isAllNamespaces
      ? {
          group: RESOURCES.APIProduct.gvk.group,
          resource: getResourceNameFromKind(RESOURCES.APIProduct.gvk.kind),
          verb: 'create',
          namespace: activeNamespace,
        }
      : {
          group: RESOURCES.APIProduct.gvk.group,
          resource: getResourceNameFromKind(RESOURCES.APIProduct.gvk.kind),
          verb: 'create',
          namespace: '',
        },
  );

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
            {!canCreateLoading && canCreate && !isAllNamespaces ? (
              <ListPageCreateLink to={`/kuadrant/ns/${activeNamespace}/apiproducts/~new`}>
                {t('Create API Product')}
              </ListPageCreateLink>
            ) : (
              <Tooltip
                content={
                  isAllNamespaces
                    ? t('Select a namespace to create an API Product')
                    : t('You do not have permission to create an API Product')
                }
              >
                <Button variant="primary" isAriaDisabled>
                  {t('Create API Product')}
                </Button>
              </Tooltip>
            )}
          </div>
        </div>
      </PageSection>
    </>
  );
};

export default APIProductsListPage;
