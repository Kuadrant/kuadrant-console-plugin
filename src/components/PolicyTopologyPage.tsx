import * as React from 'react';
import Helmet from 'react-helmet';
import { Page, PageSection, Title, Card, CardTitle, CardBody } from '@patternfly/react-core';
import PolicyTopology from 'react-policy-topology';
import './kuadrant.css';

const PolicyTopologyPage: React.FC = () => {
  const dotString = `
    strict digraph "" {
      graph [bb="0,0,440.51,352"];
      node [fillcolor=lightgrey,
        label="",
        shape=ellipse
      ];
      "gateway.gateway.networking.k8s.io:default/prod-web"	 [fillcolor="#e5e5e5",
        height=0.57778,
        label="Gateway\ndefault/prod-web",
        pos="280.92,253.6",
        shape=box,
        style=filled,
        width=1.5612];
      "gateway.gateway.networking.k8s.io:default/prod-web#http"	 [fillcolor="#e5e5e5",
        height=0.57778,
        label="Listener\ndefault/prod-web#http",
        pos="369.92,176",
        shape=box,
        style=filled,
        width=1.9609];
      "gateway.gateway.networking.k8s.io:default/prod-web" -> "gateway.gateway.networking.k8s.io:default/prod-web#http" [key="Gateway -> Listener",
      pos="e,346.01,196.85 304.77,232.8 315.05,223.85 327.21,213.24 338.23,203.63"];
    "gateway.gateway.networking.k8s.io:default/prod-web#https" [fillcolor="#e5e5e5",
      height=0.57778,
      label="Listener\ndefault/prod-web#https",
      pos="74.922,176",
      shape=box,
      style=filled,
      width=2.0365];
    "gateway.gateway.networking.k8s.io:default/prod-web" -> "gateway.gateway.networking.k8s.io:default/prod-web#https" [key="Gateway -> Listener",
    pos="e,129.7,196.64 225.99,232.91 199.33,222.87 167.14,210.74 139.34,200.27"];
    "httproute.gateway.networking.k8s.io:default/my-app" [fillcolor="#e5e5e5",
    height=0.57778,
    label="HTTPRoute\ndefault/my-app",
    pos="223.92,98.4",
    shape=box,
    style=filled,
    width=1.4101];
    "httproute.gateway.networking.k8s.io:default/my-app#rule-1" [fillcolor="#e5e5e5",
    height=0.57778,
    label="HTTPRouteRule\ndefault/my-app#rule-1",
    pos="72.922,20.8",
    shape=box,
    style=filled,
    width=1.9716];
    "httproute.gateway.networking.k8s.io:default/my-app" -> "httproute.gateway.networking.k8s.io:default/my-app#rule-1" [key="HTTPRoute -> HTTPRouteRule",
    pos="e,113.24,41.518 183.46,77.605 164.59,67.911 141.98,56.29 122.14,46.092"];
    "httproute.gateway.networking.k8s.io:default/my-app#rule-2" [fillcolor="#e5e5e5",
    height=0.57778,
    label="HTTPRouteRule\ndefault/my-app#rule-2",
    pos="232.92,20.8",
    shape=box,
    style=filled,
    width=1.9716];
    "httproute.gateway.networking.k8s.io:default/my-app" -> "httproute.gateway.networking.k8s.io:default/my-app#rule-2" [key="HTTPRoute -> HTTPRouteRule",
    pos="e,230.5,41.653 226.33,77.605 227.25,69.689 228.32,60.489 229.32,51.828"];
    "gateway.gateway.networking.k8s.io:default/prod-web#http" -> "httproute.gateway.networking.k8s.io:default/my-app" [key="Listener -> HTTPRoute",
    pos="e,262.9,119.12 330.8,155.2 312.64,145.55 290.89,133.99 271.77,123.83"];
    "gateway.gateway.networking.k8s.io:default/prod-web#https" -> "httproute.gateway.networking.k8s.io:default/my-app" [key="Listener -> HTTPRoute",
    pos="e,184.14,119.12 114.85,155.2 133.38,145.55 155.58,133.99 175.09,123.83"];
    "dnspolicy.kuadrant.io:default/geo" [height=0.57778,
    label="DNSPolicy\ndefault/geo",
    pos="215.92,331.2",
    shape=note,
    style=dashed,
    width=1.108];
    "dnspolicy.kuadrant.io:default/geo" -> "gateway.gateway.networking.k8s.io:default/prod-web" [key="Policy -> Target",
    pos="e,263.45,274.45 233.34,310.4 240.55,301.79 249.04,291.66 256.83,282.36",
    style=dashed];
    "tlspolicy.kuadrant.io:default/https" [height=0.57778,
    label="TLSPolicy\ndefault/https",
    pos="74.922,253.6",
    shape=note,
    style=dashed,
    width=1.1943];
    "tlspolicy.kuadrant.io:default/https" -> "gateway.gateway.networking.k8s.io:default/prod-web#https" [key="Policy -> Target",
    pos="e,74.922,196.85 74.922,232.8 74.922,224.89 74.922,215.69 74.922,207.03",
    style=dashed];
    "authpolicy.kuadrant.io:default/api-key-admins" [height=0.57778,
    label="AuthPolicy\ndefault/api-key-admins",
    pos="72.922,98.4",
    shape=note,
    style=dashed,
    width=2.0256];
    "authpolicy.kuadrant.io:default/api-key-admins" -> "httproute.gateway.networking.k8s.io:default/my-app#rule-1" [key="Policy -> Target",
    pos="e,72.922,41.653 72.922,77.605 72.922,69.689 72.922,60.489 72.922,51.828",
    style=dashed];
    "authpolicy.kuadrant.io:default/business-hours" [height=0.57778,
    label="AuthPolicy\ndefault/business-hours",
    pos="344.92,331.2",
    shape=note,
    style=dashed,
    width=1.9718];
    "authpolicy.kuadrant.io:default/business-hours" -> "gateway.gateway.networking.k8s.io:default/prod-web" [key="Policy -> Target",
    pos="e,298.12,274.45 327.77,310.4 320.67,301.79 312.31,291.66 304.64,282.36",
    style=dashed];
    "ratelimitpolicy.kuadrant.io:default/my-app-rl" [height=0.57778,
    label="RateLimitPolicy\ndefault/my-app-rl",
    pos="223.92,176",
    shape=note,
    style=dashed,
    width=1.5936];
    "ratelimitpolicy.kuadrant.io:default/my-app-rl" -> "httproute.gateway.networking.k8s.io:default/my-app" [key="Policy -> Target",
    pos="e,223.92,119.25 223.92,155.2 223.92,147.29 223.92,138.09 223.92,129.43",
    style=dashed];
    }
  `;

  return (
    <>
      <Helmet>
        <title>Policy Topology</title>
      </Helmet>
      <Page>
        <PageSection variant="light">
          <Title headingLevel="h1">Policy Topology</Title>
        </PageSection>
        <PageSection className='policy-topology-section'>
          <Card>
            <CardTitle>Topology View</CardTitle>
            <CardBody>
              <PolicyTopology initialDotString={dotString} />
            </CardBody>
          </Card>
        </PageSection>
      </Page>
    </>
  );
};

export default PolicyTopologyPage;
