import {
  buildMCPGatewayExtension,
  mcpExtensionToFormState,
  isMCPGatewayExtensionValid,
  buildMCPServerRegistration,
  mcpServerToFormState,
  isMCPServerRegistrationValid,
  buildMCPServerRegistrationTemplate,
} from './mcpResourceUtils';
import {
  MCPWizardFormState,
  initialFormState,
  MCPGatewayExtension,
  MCPServerFormState,
  MCPServerRegistration,
  initialServerFormState,
} from './types';

const baseServerFormState = (overrides: Partial<MCPServerFormState> = {}): MCPServerFormState => ({
  ...initialServerFormState,
  registrationName: 'my-reg',
  namespace: 'reg-ns',
  targetHTTPRouteName: 'my-route',
  toolPrefix: '/mcp',
  ...overrides,
});

const baseFormState = (overrides: Partial<MCPWizardFormState> = {}): MCPWizardFormState => ({
  ...initialFormState,
  extensionName: 'my-ext',
  extensionNamespace: 'ext-ns',
  targetGateway: 'my-gw',
  selectedGatewayNamespace: 'gw-ns',
  sectionName: 'https',
  ...overrides,
});

describe('buildMCPGatewayExtension', () => {
  it('builds a minimal resource with the correct apiVersion, kind and targetRef', () => {
    const resource = buildMCPGatewayExtension(baseFormState(), 'default');

    expect(resource.apiVersion).toBe('mcp.kuadrant.io/v1');
    expect(resource.kind).toBe('MCPGatewayExtension');
    expect(resource.metadata).toEqual({ name: 'my-ext', namespace: 'ext-ns' });
    expect(resource.spec.targetRef).toEqual({
      group: 'gateway.networking.k8s.io',
      kind: 'Gateway',
      name: 'my-gw',
      namespace: 'gw-ns',
      sectionName: 'https',
    });
  });

  it('falls back to the provided namespace when extensionNamespace is empty', () => {
    const resource = buildMCPGatewayExtension(
      baseFormState({ extensionNamespace: '', selectedGatewayNamespace: '' }),
      'fallback-ns',
    );

    expect(resource.metadata.namespace).toBe('fallback-ns');
    // gateway namespace falls back to the extension namespace when unset
    expect(resource.spec.targetRef.namespace).toBe('fallback-ns');
  });

  it('omits hostnames unless overrideHostnames is enabled', () => {
    const resource = buildMCPGatewayExtension(
      baseFormState({ publicHost: 'pub.example.com', privateHost: 'priv.svc' }),
      'default',
    );

    expect(resource.spec.publicHost).toBeUndefined();
    expect(resource.spec.privateHost).toBeUndefined();
  });

  it('includes hostnames when overrideHostnames is enabled', () => {
    const resource = buildMCPGatewayExtension(
      baseFormState({
        overrideHostnames: true,
        publicHost: 'pub.example.com',
        privateHost: 'priv.svc',
      }),
      'default',
    );

    expect(resource.spec.publicHost).toBe('pub.example.com');
    expect(resource.spec.privateHost).toBe('priv.svc');
  });

  it('includes sessionStore only when enabled and a secret name is provided', () => {
    expect(
      buildMCPGatewayExtension(baseFormState({ sessionStorageEnabled: true }), 'default').spec
        .sessionStore,
    ).toBeUndefined();

    const resource = buildMCPGatewayExtension(
      baseFormState({ sessionStorageEnabled: true, sessionStoreSecretName: 'redis-secret' }),
      'default',
    );
    expect(resource.spec.sessionStore).toEqual({ secretName: 'redis-secret' });
  });

  it('parses comma-separated OAuth authorization servers and trims entries', () => {
    const resource = buildMCPGatewayExtension(
      baseFormState({
        oauthEnabled: true,
        oauthAuthorizationServers: 'https://a.example.com,  https://b.example.com ',
        oauthResourceName: 'MCP Server',
      }),
      'default',
    );

    expect(resource.spec.oauthProtectedResource).toEqual({
      authorizationServers: ['https://a.example.com', 'https://b.example.com'],
      resourceName: 'MCP Server',
    });
  });

  it('omits resourceName from OAuth metadata when not provided', () => {
    const resource = buildMCPGatewayExtension(
      baseFormState({
        oauthEnabled: true,
        oauthAuthorizationServers: 'https://a.example.com',
      }),
      'default',
    );

    expect(resource.spec.oauthProtectedResource).toEqual({
      authorizationServers: ['https://a.example.com'],
    });
  });

  it('preserves original metadata (e.g. resourceVersion) in edit mode', () => {
    const originalMetadata: MCPGatewayExtension['metadata'] = {
      name: 'my-ext',
      namespace: 'ext-ns',
      resourceVersion: '12345',
      uid: 'abc-uid',
    };

    const resource = buildMCPGatewayExtension(baseFormState(), 'default', originalMetadata);

    expect(resource.metadata.resourceVersion).toBe('12345');
    expect(resource.metadata.uid).toBe('abc-uid');
    expect(resource.metadata.name).toBe('my-ext');
  });
});

describe('mcpExtensionToFormState', () => {
  it('is the inverse of buildMCPGatewayExtension for a fully-populated resource', () => {
    const formState = baseFormState({
      overrideHostnames: true,
      publicHost: 'pub.example.com',
      privateHost: 'priv.svc',
      sessionStorageEnabled: true,
      sessionStoreSecretName: 'redis-secret',
      oauthEnabled: true,
      oauthAuthorizationServers: 'https://a.example.com, https://b.example.com',
      oauthResourceName: 'MCP Server',
    });

    const resource = buildMCPGatewayExtension(formState, 'default');
    const roundTripped = mcpExtensionToFormState(resource, 'default');

    expect(roundTripped).toMatchObject({
      extensionName: 'my-ext',
      extensionNamespace: 'ext-ns',
      targetGateway: 'my-gw',
      selectedGatewayNamespace: 'gw-ns',
      sectionName: 'https',
      overrideHostnames: true,
      publicHost: 'pub.example.com',
      privateHost: 'priv.svc',
      sessionStorageEnabled: true,
      sessionStoreSecretName: 'redis-secret',
      oauthEnabled: true,
      oauthAuthorizationServers: 'https://a.example.com, https://b.example.com',
      oauthResourceName: 'MCP Server',
    });
  });

  it('defaults toggles to false when optional spec fields are absent', () => {
    const resource: MCPGatewayExtension = {
      apiVersion: 'mcp.kuadrant.io/v1',
      kind: 'MCPGatewayExtension',
      metadata: { name: 'n', namespace: 'ns' },
      spec: { targetRef: { name: 'gw', sectionName: 'https' } },
    };

    const formState = mcpExtensionToFormState(resource, 'ns');

    expect(formState.overrideHostnames).toBe(false);
    expect(formState.sessionStorageEnabled).toBe(false);
    expect(formState.oauthEnabled).toBe(false);
  });
});

describe('isMCPGatewayExtensionValid', () => {
  it('returns true when name, gateway and listener are all set', () => {
    expect(isMCPGatewayExtensionValid(baseFormState())).toBe(true);
  });

  it.each([
    ['extensionName', { extensionName: '' }],
    ['extensionName (whitespace only)', { extensionName: '   ' }],
    ['targetGateway', { targetGateway: '' }],
    ['sectionName', { sectionName: '' }],
  ])('returns false when %s is missing', (_label, overrides) => {
    expect(isMCPGatewayExtensionValid(baseFormState(overrides))).toBe(false);
  });
});

describe('buildMCPServerRegistration', () => {
  it('builds a minimal resource with the correct apiVersion, kind and targetRef', () => {
    const resource = buildMCPServerRegistration(baseServerFormState(), 'default');

    expect(resource.apiVersion).toBe('mcp.kuadrant.io/v1');
    expect(resource.kind).toBe('MCPServerRegistration');
    expect(resource.metadata).toEqual({ name: 'my-reg', namespace: 'reg-ns' });
    expect(resource.spec.targetRef).toEqual({
      group: 'gateway.networking.k8s.io',
      kind: 'HTTPRoute',
      name: 'my-route',
    });
    expect(resource.spec.prefix).toBe('/mcp');
  });

  it('falls back to the provided namespace when the form namespace is empty', () => {
    const resource = buildMCPServerRegistration(
      baseServerFormState({ namespace: '' }),
      'fallback-ns',
    );

    expect(resource.metadata?.namespace).toBe('fallback-ns');
  });

  it('preserves original metadata (e.g. resourceVersion) in edit mode', () => {
    const originalMetadata: MCPServerRegistration['metadata'] = {
      name: 'my-reg',
      namespace: 'reg-ns',
      resourceVersion: '98765',
      uid: 'reg-uid',
    };

    const resource = buildMCPServerRegistration(baseServerFormState(), 'default', originalMetadata);

    expect(resource.metadata?.resourceVersion).toBe('98765');
    expect(resource.metadata?.uid).toBe('reg-uid');
    expect(resource.metadata?.name).toBe('my-reg');
  });
});

describe('mcpServerToFormState', () => {
  it('is the inverse of buildMCPServerRegistration for a populated resource', () => {
    const resource = buildMCPServerRegistration(baseServerFormState(), 'default');
    const roundTripped = mcpServerToFormState(resource, 'default');

    expect(roundTripped).toEqual({
      registrationName: 'my-reg',
      namespace: 'reg-ns',
      targetHTTPRouteName: 'my-route',
      toolPrefix: '/mcp',
    });
  });

  it('defaults optional fields to empty strings when absent', () => {
    const resource: MCPServerRegistration = {
      apiVersion: 'mcp.kuadrant.io/v1',
      kind: 'MCPServerRegistration',
      metadata: { name: 'n', namespace: 'ns' },
      spec: { targetRef: { name: '' } },
    };

    expect(mcpServerToFormState(resource, 'ns')).toEqual({
      registrationName: 'n',
      namespace: 'ns',
      targetHTTPRouteName: '',
      toolPrefix: '',
    });
  });
});

describe('isMCPServerRegistrationValid', () => {
  it('returns true when name, namespace, target HTTPRoute and tool prefix are all set', () => {
    expect(isMCPServerRegistrationValid(baseServerFormState())).toBe(true);
  });

  it.each([
    ['registrationName', { registrationName: '' }],
    ['registrationName (whitespace only)', { registrationName: '   ' }],
    ['namespace', { namespace: '' }],
    ['targetHTTPRouteName', { targetHTTPRouteName: '' }],
    ['targetHTTPRouteName (whitespace only)', { targetHTTPRouteName: '   ' }],
    ['toolPrefix', { toolPrefix: '' }],
  ])('returns false when %s is missing', (_label, overrides) => {
    expect(isMCPServerRegistrationValid(baseServerFormState(overrides))).toBe(false);
  });
});

describe('buildMCPServerRegistrationTemplate', () => {
  it('builds a template scaffolded for the given namespace', () => {
    const template = buildMCPServerRegistrationTemplate('my-ns');

    expect(template.apiVersion).toBe('mcp.kuadrant.io/v1');
    expect(template.kind).toBe('MCPServerRegistration');
    expect(template.metadata?.namespace).toBe('my-ns');
    expect(template.spec.targetRef).toEqual({
      group: 'gateway.networking.k8s.io',
      kind: 'HTTPRoute',
      name: '',
    });
    expect(template.spec.prefix).toBe('');
  });
});
