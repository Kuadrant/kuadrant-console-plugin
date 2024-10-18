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
  Stack,
  StackItem,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
} from '@patternfly/react-core';
import {
  GlobeIcon,
  ReplicatorIcon,
  OptimizeIcon,
  ArrowRightIcon,
  ExternalLinkAltIcon,
  EllipsisVIcon,
} from '@patternfly/react-icons';
import { useActiveNamespace } from '@openshift-console/dynamic-plugin-sdk';
import './kuadrant.css';
import ResourceList from './ResourceList';
import { sortable } from '@patternfly/react-table';
import { INTERNAL_LINKS, EXTERNAL_LINKS } from '../constants/links';
import resourceGVKMapping from '../utils/latest';

const KuadrantOverviewPage: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const { ns } = useParams<{ ns: string }>();
  const [activeNamespace, setActiveNamespace] = useActiveNamespace();
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [isOpen, setIsOpen] = React.useState(false);
  const [hideCard, setHideCard] = React.useState(
    sessionStorage.getItem('hideGettingStarted') === 'true',
  );

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

  return (
    <>
      <Helmet>
        <title data-test="example-page-title">{t('Kuadrant')}</title>
      </Helmet>
      <Page>
        <PageSection variant="light">
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
                  <Flex>
                    <FlexItem flex={{ default: 'flex_1' }}>
                      <Title headingLevel="h4" className="kuadrant-dashboard-learning">
                        <GlobeIcon /> {t('Learning Resources')}
                      </Title>
                      <p>
                        {t(
                          'Learn how to create, import and use Kuadrant policies on OpenShift with step-by-step instructions and tasks.',
                        )}
                      </p>
                      <Stack hasGutter className="pf-u-mt-md">
                        <StackItem>
                          <Text
                            component="a"
                            href={INTERNAL_LINKS.createPolicies}
                            className="kuadrant-dashboard-resource-link"
                          >
                            {t('Create Policies in')} {t('Kuadrant')} <ArrowRightIcon />
                          </Text>
                        </StackItem>
                        <StackItem>
                          <Text
                            component="a"
                            href={INTERNAL_LINKS.addNewGateway(activeNamespace)}
                            className="kuadrant-dashboard-resource-link"
                          >
                            {t('Add a new Gateway')} <ArrowRightIcon />
                          </Text>
                        </StackItem>
                        <StackItem>
                          <Text
                            component="a"
                            href={EXTERNAL_LINKS.documentation}
                            className="pf-u-display-block"
                          >
                            {t('View Documentation')}
                          </Text>
                        </StackItem>
                        <StackItem>
                          <Text
                            component="a"
                            href={EXTERNAL_LINKS.quickStarts}
                            className="pf-u-display-block"
                          >
                            {t('View all quick starts')}
                          </Text>
                        </StackItem>
                      </Stack>
                    </FlexItem>
                    <Divider orientation={{ default: 'vertical' }} />
                    <FlexItem flex={{ default: 'flex_1' }}>
                      <Title headingLevel="h4" className="kuadrant-dashboard-feature-highlights">
                        <OptimizeIcon /> {t('Feature Highlights')}
                      </Title>
                      <p>
                        {t(
                          'Read about the latest information and key features in the Kuadrant highlights.',
                        )}
                      </p>
                      <Stack hasGutter className="pf-u-mt-md">
                        <StackItem>
                          <Text
                            target="_blank"
                            component="a"
                            href="#"
                            className="kuadrant-dashboard-resource-link"
                          >
                            {t('Kuadrant')} {t('highlights')}&nbsp;&nbsp;
                            <ExternalLinkAltIcon />
                          </Text>
                        </StackItem>
                        <StackItem>
                          <Text
                            target="_blank"
                            component="a"
                            href={EXTERNAL_LINKS.releaseNotes}
                            className="kuadrant-dashboard-resource-link"
                          >
                            {t('Kuadrant')} {t('Release Notes')}
                            <span className="kuadrant-reading-time">{t('6 min read')}</span>
                            <ExternalLinkAltIcon />
                          </Text>
                        </StackItem>
                        <StackItem>
                          <Text
                            component="a"
                            href={EXTERNAL_LINKS.blog}
                            className="pf-u-display-block"
                          >
                            {t('Visit the blog')}
                          </Text>
                        </StackItem>
                      </Stack>
                    </FlexItem>
                    <Divider orientation={{ default: 'vertical' }} />
                    <FlexItem flex={{ default: 'flex_1' }}>
                      <Title headingLevel="h4" className="kuadrant-dashboard-enhance">
                        <ReplicatorIcon /> {t('Enhance Your Work')}
                      </Title>
                      <p>
                        {t(
                          'Ease operational complexity with API management and App Connectivity by using additional Operators and tools.',
                        )}
                      </p>
                      <Stack hasGutter className="pf-u-mt-md">
                        <StackItem>
                          <Text
                            component="a"
                            href={INTERNAL_LINKS.apiDesigner}
                            className="kuadrant-dashboard-resource-link"
                          >
                            {t('API Designer')} <ArrowRightIcon />
                          </Text>
                        </StackItem>
                        <StackItem>
                          <Text
                            component="a"
                            href={INTERNAL_LINKS.observabilitySetup}
                            className="kuadrant-dashboard-resource-link"
                          >
                            Observability for {t('Kuadrant')} <ArrowRightIcon />
                          </Text>
                        </StackItem>
                        <StackItem>
                          <Text
                            component="a"
                            href={INTERNAL_LINKS.certManagerOperator(activeNamespace)}
                            className="kuadrant-dashboard-resource-link"
                          >
                            {t('cert-manager Operator')} <ArrowRightIcon />
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
                </CardTitle>
                <CardBody className="pf-u-p-0">
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
                </CardTitle>
                <CardBody className="pf-u-p-0">
                  <ResourceList
                    resources={[resourceGVKMapping['Gateway']]}
                    columns={columns}
                    namespace="#ALL_NS#"
                  />
                </CardBody>
              </Card>
            </FlexItem>
            <FlexItem flex={{ default: 'flex_1' }}>
              <Card>
                <CardTitle>
                  <Title headingLevel="h2">{t('APIs / HTTPRoutes')}</Title>
                </CardTitle>
                <CardBody className="pf-u-p-0">
                  <ResourceList
                    resources={[resourceGVKMapping['HTTPRoute']]}
                    columns={columns}
                    namespace="#ALL_NS#"
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
