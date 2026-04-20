import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom-v5-compat';
import { PageSection, Title, Spinner } from '@patternfly/react-core';
import { useActiveNamespace, NamespaceBar } from '@openshift-console/dynamic-plugin-sdk';
import ResourceList from '../ResourceList';
import { RESOURCES } from '../../utils/resources';
import { useAPIManagementRBAC } from '../../utils/apiManagementRBAC';
import NoPermissionsView from '../NoPermissionsView';
import '../kuadrant.css';

const APIProductsListPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();
  const navigate = useNavigate();
  const { permissions, loading } = useAPIManagementRBAC();

  const handleNamespaceChange = (namespace: string) => {
    if (namespace !== '#ALL_NS#') {
      navigate(`/kuadrant/ns/${namespace}/apiproducts`, { replace: true });
    } else {
      navigate('/kuadrant/all-namespaces/apiproducts', { replace: true });
    }
  };

  // Show loading state while checking permissions
  if (loading) {
    return (
      <>
        <NamespaceBar onNamespaceChange={handleNamespaceChange} />
        <PageSection variant="secondary">
          <Spinner size="lg" />
        </PageSection>
      </>
    );
  }

  // RBAC gate: only users with list permission can view API Products
  const canViewAPIProducts = permissions.apiproducts.canList;
  if (!canViewAPIProducts) {
    return (
      <>
        <NamespaceBar onNamespaceChange={handleNamespaceChange} />
        <NoPermissionsView primaryMessage={t('You do not have permission to view API Products')} />
      </>
    );
  }

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
        />
      </PageSection>
    </>
  );
};

export default APIProductsListPage;
