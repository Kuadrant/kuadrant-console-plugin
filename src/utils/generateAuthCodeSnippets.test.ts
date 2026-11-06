import {
  DEFAULT_AUTHORIZATION_PREFIX,
  generateAuthCodeSnippets,
  resolveCredentialLocation,
} from './generateAuthCodeSnippets';

const KEY = 'YOUR_API_KEY';
const HOST = 'api.example.com';
const URL = `https://${HOST}/api/v1/example`;

const allSnippets = (credentials?: Parameters<typeof generateAuthCodeSnippets>[2]) =>
  Object.values(generateAuthCodeSnippets(KEY, HOST, credentials));

describe('resolveCredentialLocation', () => {
  it('defaults to a Bearer Authorization header when no credentials are set', () => {
    expect(resolveCredentialLocation(KEY)).toEqual({
      in: 'header',
      name: 'Authorization',
      value: `${DEFAULT_AUTHORIZATION_PREFIX} ${KEY}`,
    });
  });

  it('defaults to Bearer when authorizationHeader is set without a prefix', () => {
    expect(resolveCredentialLocation(KEY, { authorizationHeader: {} })).toEqual({
      in: 'header',
      name: 'Authorization',
      value: `Bearer ${KEY}`,
    });
    expect(resolveCredentialLocation(KEY, { authorizationHeader: { prefix: '  ' } }).value).toBe(
      `Bearer ${KEY}`,
    );
  });

  it('uses the configured Authorization prefix', () => {
    expect(resolveCredentialLocation(KEY, { authorizationHeader: { prefix: 'APIKEY' } })).toEqual({
      in: 'header',
      name: 'Authorization',
      value: `APIKEY ${KEY}`,
    });
  });

  it('uses a custom header when configured', () => {
    expect(resolveCredentialLocation(KEY, { customHeader: { name: 'X-API-Key' } })).toEqual({
      in: 'header',
      name: 'X-API-Key',
      value: KEY,
    });
  });

  it('uses a query string parameter when configured', () => {
    expect(resolveCredentialLocation(KEY, { queryString: { name: 'api_key' } })).toEqual({
      in: 'query',
      name: 'api_key',
      value: KEY,
    });
  });

  it('uses a cookie when configured', () => {
    expect(resolveCredentialLocation(KEY, { cookie: { name: 'session' } })).toEqual({
      in: 'cookie',
      name: 'session',
      value: KEY,
    });
  });

  it('prefers authorizationHeader over other locations, matching Authorino', () => {
    const location = resolveCredentialLocation(KEY, {
      authorizationHeader: { prefix: 'APIKEY' },
      customHeader: { name: 'X-API-Key' },
    });
    expect(location).toEqual({ in: 'header', name: 'Authorization', value: `APIKEY ${KEY}` });
  });

  it('ignores locations that have no name', () => {
    expect(resolveCredentialLocation(KEY, { customHeader: {} }).name).toBe('Authorization');
    expect(resolveCredentialLocation(KEY, { queryString: { name: '' } }).name).toBe(
      'Authorization',
    );
  });
});

describe('generateAuthCodeSnippets', () => {
  it('keeps the Bearer scheme when the APIKey has no auth scheme', () => {
    for (const snippet of allSnippets()) {
      expect(snippet).toContain(URL);
      expect(snippet).toContain(`Bearer ${KEY}`);
    }
  });

  it('renders the configured Authorization prefix in every language', () => {
    for (const snippet of allSnippets({ authorizationHeader: { prefix: 'APIKEY' } })) {
      expect(snippet).toContain(`APIKEY ${KEY}`);
      expect(snippet).not.toContain('Bearer');
    }
  });

  it('renders a custom header without an Authorization header', () => {
    const snippets = generateAuthCodeSnippets(KEY, HOST, { customHeader: { name: 'X-API-Key' } });

    expect(snippets.curl).toContain(`-H "X-API-Key: ${KEY}"`);
    expect(snippets.nodejs).toContain(`'X-API-Key': '${KEY}'`);
    expect(snippets.python).toContain(`"X-API-Key": "${KEY}"`);
    expect(snippets.go).toContain(`req.Header.Add("X-API-Key", "${KEY}")`);
    for (const snippet of Object.values(snippets)) {
      expect(snippet).not.toContain('Authorization');
      expect(snippet).not.toContain('Bearer');
    }
  });

  it('renders a query string parameter instead of a header', () => {
    const snippets = generateAuthCodeSnippets(KEY, HOST, { queryString: { name: 'api_key' } });

    expect(snippets.curl).toBe(`curl -X GET "${URL}?api_key=${KEY}"`);
    expect(snippets.nodejs).toContain(`params: {\n    'api_key': '${KEY}'\n  }`);
    expect(snippets.python).toContain(`params = {\n    "api_key": "${KEY}"\n}`);
    expect(snippets.python).toContain('requests.get(url, params=params)');
    expect(snippets.go).toContain(`url := "${URL}?api_key=${KEY}"`);
    expect(snippets.go).not.toContain('req.Header.Add');
    for (const snippet of Object.values(snippets)) {
      expect(snippet).not.toContain('Authorization');
    }
  });

  it('renders a cookie instead of a header', () => {
    const snippets = generateAuthCodeSnippets(KEY, HOST, { cookie: { name: 'session' } });

    expect(snippets.curl).toContain(`--cookie "session=${KEY}"`);
    expect(snippets.nodejs).toContain(`'Cookie': 'session=${KEY}'`);
    expect(snippets.python).toContain(`cookies = {\n    "session": "${KEY}"\n}`);
    expect(snippets.python).toContain('requests.get(url, cookies=cookies)');
    expect(snippets.go).toContain(`req.AddCookie(&http.Cookie{Name: "session", Value: "${KEY}"})`);
    for (const snippet of Object.values(snippets)) {
      expect(snippet).not.toContain('Authorization');
    }
  });

  it('always targets the API hostname', () => {
    for (const snippet of allSnippets({ cookie: { name: 'session' } })) {
      expect(snippet).toContain(URL);
    }
  });
});
