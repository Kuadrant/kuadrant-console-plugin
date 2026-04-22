import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { PageSection, Title, EmptyState, EmptyStateBody } from '@patternfly/react-core';
import { ListPageBody } from '@openshift-console/dynamic-plugin-sdk';
//import { useActiveNamespace } from '@openshift-console/dynamic-plugin-sdk';
import { SearchIcon } from '@patternfly/react-icons';
import '../kuadrant.css';

const MyAPIKeysPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  //const [activeNamespace] = useActiveNamespace();

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h1">{t('My API Keys')}</Title>
      </PageSection>
      <ListPageBody>
        <EmptyState
          titleText={
            <Title headingLevel="h4" size="lg">
              {t('No API Keys found')}
            </Title>
          }
          icon={SearchIcon}
        >
          <EmptyStateBody>t('No API Keys match the filter criteria.')</EmptyStateBody>
        </EmptyState>
      </ListPageBody>
    </>
  );
};

export default MyAPIKeysPage;
