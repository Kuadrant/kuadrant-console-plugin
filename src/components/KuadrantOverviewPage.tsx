import * as React from 'react';
import { useParams } from 'react-router-dom';
import Helmet from 'react-helmet';
import { useTranslation } from 'react-i18next';
import {
  Page,
  PageSection,
  Title,
  Card,
  CardTitle,
  CardBody,
  CardExpandableContent,
  CardHeader,
  Flex,
  FlexItem,
  Text,
  TextVariants,
  Stack,
  StackItem,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  Button,
} from '@patternfly/react-core';
import {
  GlobeIcon,
  ReplicatorIcon,
  OptimizeIcon,
  ExternalLinkAltIcon,
  EllipsisVIcon,
} from '@patternfly/react-icons';
import { useActiveNamespace } from '@openshift-console/dynamic-plugin-sdk';
import './kuadrant.css';
import ResourceList from './ResourceList';
import { sortable } from '@patternfly/react-table';
import { INTERNAL_LINKS, EXTERNAL_LINKS } from '../constants/links';
import resourceGVKMapping from '../utils/latest';
import { useHistory } from 'react-router-dom';

export type MenuToggleElement = HTMLDivElement | HTMLButtonElement;

interface Resource {
  name: string;
  gvk: {
    group: string;
    version: string;
    kind: string;
  };
}
export const resources: Resource[] = [
  { name: 'AuthPolicies', gvk: resourceGVKMapping['AuthPolicy'] },
  { name: 'DNSPolicies', gvk: resourceGVKMapping['DNSPolicy'] },
  { name: 'RateLimitPolicies', gvk: resourceGVKMapping['RateLimitPolicy'] },
  { name: 'TLSPolicies', gvk: resourceGVKMapping['TLSPolicy'] },
];
const KuadrantOverviewPage: React.FC = () => {
  const history = useHistory();
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const { ns } = useParams<{ ns: string }>();
  const [activeNamespace, setActiveNamespace] = useActiveNamespace();
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [hideCard, setHideCard] = React.useState(
    sessionStorage.getItem('hideGettingStarted') === 'true',
  );
  const onToggleClick = () => {
    setIsCreateOpen(!isCreateOpen);
  };

  React.useEffect(() => {
    if (ns && ns !== activeNamespace) {
      setActiveNamespace(ns);
    }
  }, [ns, activeNamespace, setActiveNamespace]);

  const handleHideCard = () => {
    setHideCard(true);
    sessionStorage.setItem('hideGettingStarted', 'true');
  };

  const onSelect = () => {
    setIsOpen(!isOpen);
  };

  const dropdownItems = (
    <>
      <DropdownItem key="hideForSession" onClick={handleHideCard}>
        {t('Hide for session')}
      </DropdownItem>
    </>
  );

  const headerActions = (
    <>
      <Dropdown
        onSelect={onSelect}
        toggle={(toggleRef) => (
          <MenuToggle
            ref={toggleRef}
            isExpanded={isOpen}
            onClick={() => setIsOpen(!isOpen)}
            variant="plain"
            aria-label="Card actions"
          >
            <EllipsisVIcon aria-hidden="true" />
          </MenuToggle>
        )}
        isOpen={isOpen}
        onOpenChange={(isOpen: boolean) => setIsOpen(isOpen)}
      >
        <DropdownList>{dropdownItems}</DropdownList>
      </Dropdown>
    </>
  );

  const columns = [
    {
      title: t('plugin__kuadrant-console-plugin~Name'),
      id: 'name',
      sort: 'metadata.name',
      transforms: [sortable],
    },
    {
      title: t('plugin__kuadrant-console-plugin~Namespace'),
      id: 'namespace',
      sort: 'metadata.namespace',
      transforms: [sortable],
    },
    {
      title: t('plugin__kuadrant-console-plugin~Status'),
      id: 'Status',
    },
    {
      title: '',
      id: 'kebab',
      props: { className: 'pf-v5-c-table__action' },
    },
  ];

  const handleCreateResource = (resource) => {
    const resolvedNamespace = activeNamespace === '#ALL_NS#' ? 'default' : activeNamespace;

    if (resource === 'Gateway') {
      const gateway = resourceGVKMapping['Gateway'];
      history.push(
        `/k8s/ns/${resolvedNamespace}/${gateway.group}~${gateway.version}~${gateway.kind}/~new`,
      );
    } else {
      const httpRoute = resourceGVKMapping['HTTPRoute'];
      history.push(
        `/k8s/ns/${resolvedNamespace}/${httpRoute.group}~${httpRoute.version}~${httpRoute.kind}/~new`,
      );
    }
  };

  const onMenuSelect = (_event: React.MouseEvent<Element, MouseEvent>, policyType: string) => {
    const resource = resourceGVKMapping[policyType];
    const resolvedNamespace = activeNamespace === '#ALL_NS#' ? 'default' : activeNamespace;
    const targetUrl = `/k8s/ns/${resolvedNamespace}/${resource.group}~${resource.version}~${resource.kind}/~new`;
    history.push(targetUrl);
    setIsOpen(false);
  };

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Kuadrant')}</title>
      </Helmet>
      <Page>
        <PageSection>
          <Title headingLevel="h1">{t('Kuadrant')} Overview</Title>
          <br />

          {!hideCard && (
            <Card id="expandable-card" isExpanded={isExpanded}>
              <CardHeader
                actions={{ actions: headerActions }}
                onExpand={() => setIsExpanded(!isExpanded)}
                toggleButtonProps={{
                  'aria-label': isExpanded
                    ? t('Collapse Getting Started')
                    : t('Expand Getting Started'),
                }}
              >
                <CardTitle>{t('Getting started resources')}</CardTitle>
              </CardHeader>
              <CardExpandableContent>
                <CardBody>
                  <Flex className="kuadrant-overview-getting-started">
                    <FlexItem flex={{ default: 'flex_1' }}>
                      <Title headingLevel="h4" className="kuadrant-dashboard-learning">
                        <GlobeIcon /> {t('Learning Resources')}
                      </Title>
                      <Text component={TextVariants.small}>
                        {t(
                          'Learn how to create, import and use Kuadrant policies on OpenShift with step-by-step instructions and tasks.',
                        )}
                      </Text>
                      <Stack hasGutter className="pf-u-mt-sm">
                        <StackItem>
                          <Text
                            component="a"
                            href={EXTERNAL_LINKS.documentation}
                            className="kuadrant-dashboard-resource-link"
                            target="_blank"
                          >
                            {t('View Documentation')} <ExternalLinkAltIcon />
                          </Text>
                        </StackItem>
                      </Stack>
                    </FlexItem>
                    <Divider orientation={{ default: 'vertical' }} />
                    <FlexItem flex={{ default: 'flex_1' }}>
                      <Title headingLevel="h4" className="kuadrant-dashboard-feature-highlights">
                        <OptimizeIcon /> {t('Feature Highlights')}
                      </Title>
                      <Text component={TextVariants.small}>
                        {t(
                          'Read about the latest information and key features in the Kuadrant highlights.',
                        )}
                      </Text>
                      <Stack hasGutter className="pf-u-mt-md">
                        <StackItem>
                          <Text
                            target="_blank"
                            component="a"
                            href={EXTERNAL_LINKS.releaseNotes}
                            className="kuadrant-dashboard-resource-link"
                          >
                            {t('Kuadrant')} {t('Release Notes')} <ExternalLinkAltIcon />
                          </Text>
                        </StackItem>
                      </Stack>
                    </FlexItem>
                    <Divider orientation={{ default: 'vertical' }} />
                    <FlexItem flex={{ default: 'flex_1' }}>
                      <Title headingLevel="h4" className="kuadrant-dashboard-enhance">
                        <ReplicatorIcon /> {t('Enhance Your Work')}
                      </Title>
                      <Text component={TextVariants.small}>
                        {t(
                          'Ease operational complexity with API management and App Connectivity by using additional Operators and tools.',
                        )}
                      </Text>
                      <Stack hasGutter className="pf-u-mt-md">
                        <StackItem>
                          <Text
                            component="a"
                            href={INTERNAL_LINKS.observabilitySetup}
                            className="kuadrant-dashboard-resource-link"
                            target="_blank"
                          >
                            Observability for {t('Kuadrant')} <ExternalLinkAltIcon />
                          </Text>
                        </StackItem>
                        <StackItem>
                          <Text
                            component="a"
                            href={INTERNAL_LINKS.certManagerOperator(activeNamespace)}
                            className="kuadrant-dashboard-resource-link"
                          >
                            {t('cert-manager Operator')} <ExternalLinkAltIcon />
                          </Text>
                        </StackItem>
                      </Stack>
                    </FlexItem>
                  </Flex>
                </CardBody>
              </CardExpandableContent>
            </Card>
          )}

          <Flex className="pf-u-mt-xl">
            <FlexItem flex={{ default: 'flex_1' }}>
              <Card>
                <CardTitle>
                  <Title headingLevel="h2">{t('Policies')}</Title>
                  <Dropdown
                    isOpen={isCreateOpen}
                    onSelect={onMenuSelect}
                    onOpenChange={setIsCreateOpen}
                    toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                      <MenuToggle
                        ref={toggleRef}
                        onClick={onToggleClick}
                        isExpanded={isCreateOpen}
                        variant="primary"
                        className="kuadrant-overview-create-button pf-u-mt-md pf-u-mr-md"
                      >
                        {t('Create Policy')}
                      </MenuToggle>
                    )}
                  >
                    <DropdownList class="kuadrant-overview-create-list pf-u-p-0">
                      <DropdownItem value="AuthPolicy" key="auth-policy">
                        {t('AuthPolicy')}
                      </DropdownItem>
                      <DropdownItem value="RateLimitPolicy" key="rate-limit-policy">
                        {t('RateLimitPolicy')}
                      </DropdownItem>
                      <DropdownItem value="DNSPolicy" key="dns-policy">
                        {t('DNSPolicy')}
                      </DropdownItem>
                      <DropdownItem value="TLSPolicy" key="tls-policy">
                        {t('TLSPolicy')}
                      </DropdownItem>
                    </DropdownList>
                  </Dropdown>
                </CardTitle>
                <CardBody className="pf-u-p-10">
                  <ResourceList
                    resources={[
                      resourceGVKMapping['AuthPolicy'],
                      resourceGVKMapping['DNSPolicy'],
                      resourceGVKMapping['RateLimitPolicy'],
                      resourceGVKMapping['TLSPolicy'],
                    ]}
                    columns={columns}
                    namespace="#ALL_NS#"
                    paginationLimit={5}
                  />
                </CardBody>
              </Card>
            </FlexItem>
          </Flex>
          <Flex className="pf-u-mt-xl">
            <FlexItem flex={{ default: 'flex_1' }}>
              <Card>
                <CardTitle>
                  <Title headingLevel="h2">{t('Gateways')}</Title>
                  <Button
                    onClick={() => handleCreateResource('Gateway')}
                    className="kuadrant-overview-create-button pf-u-mt-md pf-u-mr-md"
                  >
                    {t(`Create Gateway`)}
                  </Button>
                </CardTitle>
                <CardBody className="pf-u-p-10">
                  <ResourceList
                    resources={[resourceGVKMapping['Gateway']]}
                    columns={columns}
                    namespace="#ALL_NS#"
                    emtpyResourceName="Gateways"
                  />
                </CardBody>
              </Card>
            </FlexItem>
            <FlexItem flex={{ default: 'flex_1' }}>
              <Card>
                <CardTitle>
                  <Title headingLevel="h2">{t('APIs / HTTPRoutes')}</Title>
                  <Button
                    onClick={() => handleCreateResource('HTTPRoute')}
                    className="kuadrant-overview-create-button pf-u-mt-md pf-u-mr-md"
                  >
                    {t(`Create HTTPRoute`)}
                  </Button>
                </CardTitle>
                <CardBody className="pf-u-p-10">
                  <ResourceList
                    resources={[resourceGVKMapping['HTTPRoute']]}
                    columns={columns}
                    namespace="#ALL_NS#"
                    emtpyResourceName="HTTPRoutes"
                  />
                </CardBody>
              </Card>
            </FlexItem>
          </Flex>
        </PageSection>
      </Page>
    </>
  );
};

export default KuadrantOverviewPage;
