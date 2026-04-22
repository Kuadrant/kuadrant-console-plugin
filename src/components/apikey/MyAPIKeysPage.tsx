import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom-v5-compat';
import { PageSection, Title } from '@patternfly/react-core';
import { useActiveNamespace, NamespaceBar } from '@openshift-console/dynamic-plugin-sdk';
import ResourceList from '../ResourceList';
import { RESOURCES } from '../../utils/resources';
import '../kuadrant.css';

const MyAPIKeysPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeNamespace] = useActiveNamespace();
  const navigate = useNavigate();

  const handleNamespaceChange = (namespace: string) => {
    if (namespace !== '#ALL_NS#') {
      navigate(`/kuadrant/ns/${namespace}/myapikeys`, { replace: true });
    } else {
      navigate('/kuadrant/all-namespaces/myapikeys', { replace: true });
    }
  };

  return (
    <>
      <NamespaceBar onNamespaceChange={handleNamespaceChange} />
      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h1">{t('My API Keys')}</Title>
      </PageSection>
      <PageSection hasBodyWrapper={false} className="kuadrant-policy-list-body">
        <ResourceList
          resources={[RESOURCES.APIKeyRequest.gvk]}
          namespace={activeNamespace}
          emptyResourceName="API Keys"
        />
      </PageSection>
    </>
  );
};

export default MyAPIKeysPage;
