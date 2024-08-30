import * as React from 'react';
import Helmet from 'react-helmet';
import {
  Page,
  PageSection,
  Title,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import './kuadrant.css';

const KuadrantDNSPolicyCreatePage: React.FC = () => {
  const { t } = useTranslation('plugin__console-plugin-template');

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Kuadrant')}</title>
      </Helmet>
      <Page>
        <PageSection variant="light">
          <Title headingLevel="h1">{t('Kuadrant')}</Title>
        </PageSection>
        <div>create dns policy</div>
        <div>description</div>
        <div>create via [] form [] yaml</div>
        <div>policy name *</div>
        <input/>
        <div>unique name of the DNS Policy</div>
        <div>description</div>
        <input/>
        <div>namespace * ?</div>
        <input/>
        <div>gateway api target reference *</div>
        <input/>
        <div>description here, to create an additional Gateway go to <a>here</a></div>
        <div>routing strategy *</div>
        <div>routing strategy to use * ?</div>
        <div>[] simple [] load-balanced</div>
        <div>[] default</div>
        <div>[] custom weights</div>
        <div>custom weight * ?</div>
        <input/>
        <div>health check</div>
        <div>description of this section</div>
        <div>Endpoint * ?</div>
        <input/>
        <div>Endpoint is the path to append to the host to reach the expected health check</div>
        <div>Port * ?</div>
        <input/>
        <div>Endpoint is the path to append to the host to reach the expected health check</div>
        <div>Protocol * ?</div>
        <div>[] default</div>
        <div>[] custom weights</div>
      </Page>
    </>
  );
};

export default KuadrantDNSPolicyCreatePage;
