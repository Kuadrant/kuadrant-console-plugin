// a realistic document for each yaml view, which yamlViews.test.tsx types in

export const serviceEntry = `apiVersion: networking.istio.io/v1beta1
kind: ServiceEntry
metadata:
  name: external-api
  namespace: mcp-test
spec:
  hosts:
    - api.example.com
  ports:
    - number: 443
      protocol: HTTPS
      name: https-443
  location: MESH_EXTERNAL
  resolution: DNS
`;

export const destinationRule = `apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: external-api
  namespace: mcp-test
spec:
  host: api.example.com
  trafficPolicy:
    tls:
      mode: SIMPLE
      sni: api.example.com
`;

export const credential = `apiVersion: v1
kind: Secret
metadata:
  name: external-api-token
  namespace: mcp-test
type: Opaque
stringData:
  token: Bearer abc123
`;

export const serverRegistration = `apiVersion: mcp.kuadrant.io/v1
kind: MCPServerRegistration
metadata:
  name: external-api
  namespace: mcp-test
spec:
  prefix: ext_
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: external-api
`;

export const mcpExtension = `apiVersion: mcp.kuadrant.io/v1
kind: MCPGatewayExtension
metadata:
  name: mcp-extension
  namespace: mcp-system
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: Gateway
    name: mcp-gateway
    namespace: gateway-system
    sectionName: mcp
  publicHost: mcp.example.com
  sessionStore:
    secretName: redis-credentials
  oauthProtectedResource:
    authorizationServers:
      - https://keycloak.example.com/realms/mcp
    resourceName: MCP Server
  httpRouteManagement: Disabled
`;

export const tlsPolicy = `apiVersion: kuadrant.io/v1
kind: TLSPolicy
metadata:
  name: prod-web-tls
  namespace: default
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: Gateway
    name: prod-web
  issuerRef:
    kind: ClusterIssuer
    name: letsencrypt-staging
`;

export const oidcPolicy = `apiVersion: extensions.kuadrant.io/v1alpha1
kind: OIDCPolicy
metadata:
  name: toystore-oidc
  namespace: default
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: toystore
  provider:
    issuerURL: https://accounts.google.com
    clientID: 1234567890-abc123.apps.googleusercontent.com
`;

export const dnsPolicy = `apiVersion: kuadrant.io/v1
kind: DNSPolicy
metadata:
  name: prod-web-dns
  namespace: default
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: Gateway
    name: prod-web
  providerRefs:
    - name: aws-credentials
  loadBalancing:
    weight: 100
    geo: GEO-EU
    defaultGeo: true
  healthCheck:
    path: /health
    port: 443
    protocol: HTTPS
    failureThreshold: 3
`;

export const plans = `  plans:
    - tier: gold
      predicate: auth.identity.tier == "gold"
      limits:
        daily: 1000
        custom:
          - limit: 10
            window: 1m
`;

export const planPolicy = `apiVersion: extensions.kuadrant.io/v1alpha1
kind: PlanPolicy
metadata:
  name: toystore-plans
  namespace: default
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: toystore
${plans}`;

export const limits = `  limits:
    global:
      rates:
        - limit: 10
          window: 1m
      counters:
        - expression: auth.identity.userid
      when:
        - predicate: request.path == "/toys"
`;

export const rateLimitPolicy = `apiVersion: kuadrant.io/v1
kind: RateLimitPolicy
metadata:
  name: toystore-rlp
  namespace: default
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: toystore
${limits}`;

export const tokenLimits = `  limits:
    free:
      rates:
        - limit: 10
          window: 1m
      counters:
        - expression: auth.identity.userid
`;

export const tokenRateLimitPolicy = `apiVersion: kuadrant.io/v1alpha1
kind: TokenRateLimitPolicy
metadata:
  name: llm-token-limits
  namespace: default
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: Gateway
    name: ai-gateway
${tokenLimits}`;

export const gateway = `apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: prod-web
  namespace: default
spec:
  gatewayClassName: istio
  listeners:
    - name: http
      port: 8080
      protocol: HTTP
      allowedRoutes:
        namespaces:
          from: Selector
          selector:
            matchLabels:
              env: prod
        kinds:
          - kind: HTTPRoute
    - name: https
      port: 443
      protocol: HTTPS
      hostname: api.example.com
      tls:
        mode: Terminate
        certificateRefs:
          - name: api-cert
            kind: Secret
        options:
          minVersion: TLSv1.2
  addresses:
    - type: IPAddress
      value: 192.168.1.100
`;

export const hostnames = `  hostnames:
    - toystore.example.com
`;

export const httpRoute = `apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: toystore
  namespace: default
spec:
  parentRefs:
    - name: prod-web
      namespace: gateway-system
      sectionName: https
${hostnames}  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /toys
          method: GET
      filters:
        - type: RequestHeaderModifier
          requestHeaderModifier:
            add:
              - name: x-route
                value: toystore
      backendRefs:
        - name: toystore
          port: 8080
`;

export const tags = `  tags:
    - public
    - beta
`;

export const apiProduct = `apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIProduct
metadata:
  name: 3d-prints
  namespace: default
spec:
  displayName: 3D Prints API
  description: Order prints of 3D models
  version: 2.1.0
${tags}  publishStatus: Published
  approvalMode: automatic
  documentation:
    openAPISpecURL: https://prints.example.com/openapi.yaml
    docsURL: https://prints.example.com/docs
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: prints
`;
