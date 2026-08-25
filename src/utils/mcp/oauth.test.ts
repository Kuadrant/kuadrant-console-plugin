import {
  authorizationServerMetadataUrl,
  discoverOAuthConfiguration,
  parseResourceMetadataUrl,
  pluginRedirectUri,
  resourceMetadataFallbackUrl,
} from './oauth';

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response);

const resourceMetadataParam = 'resource' + '_metadata';

describe('parseResourceMetadataUrl', () => {
  it('extracts a quoted URI from a WWW-Authenticate Bearer challenge', () => {
    const header = `Bearer ${resourceMetadataParam}="https://mcp.example/.well-known/oauth-protected-resource/mcp", scope="openid"`;
    expect(parseResourceMetadataUrl(header)).toBe(
      'https://mcp.example/.well-known/oauth-protected-resource/mcp',
    );
  });

  it('extracts an unquoted URI (Authorino / mcp-gateway)', () => {
    const header = `Bearer ${resourceMetadataParam}=https://mcp.example/.well-known/oauth-protected-resource/mcp`;
    expect(parseResourceMetadataUrl(header)).toBe(
      'https://mcp.example/.well-known/oauth-protected-resource/mcp',
    );
  });

  it('returns null when the header is missing or has no resource metadata param', () => {
    expect(parseResourceMetadataUrl(null)).toBeNull();
    expect(parseResourceMetadataUrl('Bearer realm="mcp"')).toBeNull();
  });
});

describe('authorizationServerMetadataUrl', () => {
  it('builds the RFC 8414 path for a Keycloak realm issuer', () => {
    expect(authorizationServerMetadataUrl('https://keycloak.example/realms/mcp')).toBe(
      'https://keycloak.example/.well-known/oauth-authorization-server/realms/mcp',
    );
  });

  it('strips a trailing slash on the issuer path', () => {
    expect(authorizationServerMetadataUrl('https://keycloak.example/realms/mcp/')).toBe(
      'https://keycloak.example/.well-known/oauth-authorization-server/realms/mcp',
    );
  });
});

describe('resourceMetadataFallbackUrl', () => {
  it('inserts /.well-known/oauth-protected-resource before the resource path', () => {
    expect(resourceMetadataFallbackUrl('https://mcp.example/mcp')).toBe(
      'https://mcp.example/.well-known/oauth-protected-resource/mcp',
    );
  });
});

describe('pluginRedirectUri', () => {
  it('is the inspector page on the current origin', () => {
    expect(pluginRedirectUri()).toBe(`${window.location.origin}/mcp-inspector`);
  });
});

describe('discoverOAuthConfiguration', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('discovers metadata and dynamically registers a public PKCE client', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonResponse({
          resource: 'https://mcp.example/mcp',
          authorization_servers: ['https://id.example/realms/mcp'],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          authorization_endpoint: 'https://id.example/realms/mcp/protocol/openid-connect/auth',
          token_endpoint: 'https://id.example/realms/mcp/protocol/openid-connect/token',
          registration_endpoint:
            'https://id.example/realms/mcp/clients-registrations/openid-connect',
          scopes_supported: ['openid', 'profile', 'email'],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ client_id: 'dynamic-console-client' }, 201));

    const configuration = await discoverOAuthConfiguration({
      mcpEndpoint: 'https://mcp.example/mcp',
      wwwAuthenticate:
        'Bearer resource_metadata="https://mcp.example/.well-known/oauth-protected-resource/mcp"',
      redirectUri: 'https://console.example/mcp-inspector',
    });

    expect(configuration).toEqual({
      authorizationEndpoint: 'https://id.example/realms/mcp/protocol/openid-connect/auth',
      tokenEndpoint: 'https://id.example/realms/mcp/protocol/openid-connect/token',
      clientId: 'dynamic-console-client',
      resource: 'https://mcp.example/mcp',
      scopes: 'openid profile email',
    });
    expect(global.fetch).toHaveBeenLastCalledWith(
      'https://id.example/realms/mcp/clients-registrations/openid-connect',
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        body: JSON.stringify({
          client_name: 'Kuadrant Console MCP Inspector',
          redirect_uris: ['https://console.example/mcp-inspector'],
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code'],
          response_types: ['code'],
        }),
      }),
    );
  });

  it('explains when OIDC cannot register a browser client', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonResponse({ authorization_servers: ['https://id.example/realms/mcp'] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          authorization_endpoint: 'https://id.example/auth',
          token_endpoint: 'https://id.example/token',
        }),
      );

    await expect(
      discoverOAuthConfiguration({
        mcpEndpoint: 'https://mcp.example/mcp',
        wwwAuthenticate: null,
        redirectUri: 'https://console.example/mcp-inspector',
      }),
    ).rejects.toThrow(
      'OIDC sign-in is unavailable because the authorization server does not support dynamic client registration. Use a bearer token instead.',
    );
  });
});
