// Browser-only OAuth 2.1 authorization-code flow with PKCE. Discovery follows
// the MCP protected-resource challenge and client registration is dynamic.

import { MCP_PROTOCOL_VERSION } from './client';

export const PKCE_SCOPES = ['openid', 'profile', 'email'];

const PENDING_KEY = 'kuadrant-mcp-inspector-pkce';
const CALLBACK_KEY = 'kuadrant-mcp-inspector-pkce-callback';
const EXCHANGE_LOCK_KEY = 'kuadrant-mcp-inspector-pkce-lock';

export interface PkcePending {
  verifier: string;
  state: string;
  selectedKey: string;
  mcpEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  redirectUri: string;
  resource: string;
}

export interface ResourceMetadata {
  resource?: string;
  authorization_servers?: string[];
}

export interface AuthorizationServerMetadata {
  authorization_endpoint?: string;
  token_endpoint?: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
}

export interface OAuthConfiguration {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  resource: string;
  scopes: string;
}

export function parseResourceMetadataUrl(wwwAuthenticate: string | null): string | null {
  if (!wwwAuthenticate) {
    return null;
  }
  const quoted = wwwAuthenticate.match(/resource_metadata="([^"]+)"/i);
  if (quoted?.[1]) {
    return quoted[1];
  }
  // Authorino/mcp-gateway can emit an unquoted URI.
  const unquoted = wwwAuthenticate.match(/resource_metadata=([^\s,]+)/i);
  return unquoted?.[1] ?? null;
}

export function authorizationServerMetadataUrl(issuer: string): string {
  const url = new URL(issuer);
  const path = url.pathname.replace(/\/$/, '');
  return `${url.origin}/.well-known/oauth-authorization-server${path}`;
}

export function resourceMetadataFallbackUrl(mcpEndpoint: string): string {
  const url = new URL(mcpEndpoint);
  return `${url.origin}/.well-known/oauth-protected-resource${url.pathname}`;
}

export function pluginRedirectUri(): string {
  return `${window.location.origin}/mcp-inspector`;
}

export function stashOauthCallback(code: string, state: string): void {
  sessionStorage.setItem(CALLBACK_KEY, JSON.stringify({ code, state }));
}

export function peekOauthCallback(): { code: string; state: string } | null {
  const raw = sessionStorage.getItem(CALLBACK_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { code?: string; state?: string };
    if (parsed.code && parsed.state) {
      return { code: parsed.code, state: parsed.state };
    }
  } catch {
    return null;
  }
  return null;
}

// one-tab lock so React Strict Mode does not exchange the same code twice.
export function takeOauthExchangeLock(): boolean {
  if (sessionStorage.getItem(EXCHANGE_LOCK_KEY)) {
    return false;
  }
  sessionStorage.setItem(EXCHANGE_LOCK_KEY, '1');
  return true;
}

export function clearPkceStorage(): void {
  sessionStorage.removeItem(CALLBACK_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  sessionStorage.removeItem(EXCHANGE_LOCK_KEY);
}

export async function discoverOAuthConfiguration(opts: {
  mcpEndpoint: string;
  wwwAuthenticate: string | null;
  redirectUri: string;
}): Promise<OAuthConfiguration> {
  const metadataUrl =
    parseResourceMetadataUrl(opts.wwwAuthenticate) ?? resourceMetadataFallbackUrl(opts.mcpEndpoint);
  const resourceMeta = await fetchJson<ResourceMetadata>(metadataUrl);
  const issuer = resourceMeta.authorization_servers?.[0];
  if (!issuer) {
    throw new Error('MCP resource metadata does not advertise an authorization server.');
  }

  const asMeta = await fetchJson<AuthorizationServerMetadata>(
    authorizationServerMetadataUrl(issuer),
  );
  if (!asMeta.authorization_endpoint || !asMeta.token_endpoint) {
    throw new Error('Authorization server metadata is missing authorization or token endpoints.');
  }
  if (!asMeta.registration_endpoint) {
    throw new Error(
      'OIDC sign-in is unavailable because the authorization server does not support dynamic client registration. Use a bearer token instead.',
    );
  }

  const registration = await registerClient(asMeta.registration_endpoint, opts.redirectUri);
  const supportedScopes = asMeta.scopes_supported;
  const scopes = supportedScopes
    ? PKCE_SCOPES.filter((scope) => supportedScopes.includes(scope)).join(' ')
    : PKCE_SCOPES.join(' ');

  return {
    authorizationEndpoint: asMeta.authorization_endpoint,
    tokenEndpoint: asMeta.token_endpoint,
    clientId: registration.client_id,
    resource: resourceMeta.resource || opts.mcpEndpoint,
    scopes,
  };
}

export async function beginPkce(opts: {
  mcpEndpoint: string;
  selectedKey: string;
  wwwAuthenticate: string | null;
}): Promise<void> {
  const redirectUri = pluginRedirectUri();
  const configuration = await discoverOAuthConfiguration({
    mcpEndpoint: opts.mcpEndpoint,
    wwwAuthenticate: opts.wwwAuthenticate,
    redirectUri,
  });

  const verifier = randomUrlSafe(32);
  const state = randomUrlSafe(16);
  const challenge = await pkceChallenge(verifier);

  const pending: PkcePending = {
    verifier,
    state,
    selectedKey: opts.selectedKey,
    mcpEndpoint: opts.mcpEndpoint,
    tokenEndpoint: configuration.tokenEndpoint,
    clientId: configuration.clientId,
    redirectUri,
    resource: configuration.resource,
  };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));

  const auth = new URL(configuration.authorizationEndpoint);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('client_id', configuration.clientId);
  auth.searchParams.set('redirect_uri', redirectUri);
  auth.searchParams.set('state', state);
  auth.searchParams.set('code_challenge', challenge);
  auth.searchParams.set('code_challenge_method', 'S256');
  if (configuration.scopes) {
    auth.searchParams.set('scope', configuration.scopes);
  }
  auth.searchParams.set('resource', configuration.resource);

  window.location.assign(auth.toString());
}

export async function completePkce(): Promise<{
  accessToken: string;
  selectedKey: string;
  mcpEndpoint: string;
}> {
  const callback = peekOauthCallback();
  const pendingRaw = sessionStorage.getItem(PENDING_KEY);
  if (!callback || !pendingRaw) {
    throw new Error('OAuth callback is missing PKCE state');
  }
  const pending = JSON.parse(pendingRaw) as PkcePending;
  if (callback.state !== pending.state) {
    clearPkceStorage();
    throw new Error('OAuth state mismatch');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: callback.code,
    redirect_uri: pending.redirectUri,
    client_id: pending.clientId,
    code_verifier: pending.verifier,
    resource: pending.resource,
  });

  const res = await fetch(pending.tokenEndpoint, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    clearPkceStorage();
    throw new Error(`token exchange failed (http ${res.status}): ${text}`);
  }
  const token = (await res.json()) as { access_token?: string };
  if (!token.access_token) {
    clearPkceStorage();
    throw new Error('token response has no access_token');
  }
  const { selectedKey, mcpEndpoint } = pending;
  clearPkceStorage();
  return { accessToken: token.access_token, selectedKey, mcpEndpoint };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
    },
  });
  if (!res.ok) {
    throw new Error(`GET ${url} failed (http ${res.status})`);
  }
  return res.json() as Promise<T>;
}

async function registerClient(
  registrationEndpoint: string,
  redirectUri: string,
): Promise<{ client_id: string }> {
  const body = {
    client_name: 'Kuadrant Console MCP Inspector',
    redirect_uris: [redirectUri],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'],
    response_types: ['code'],
  };
  const res = await fetch(registrationEndpoint, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dynamic OAuth client registration failed (http ${res.status}): ${text}`);
  }
  const registration = (await res.json()) as { client_id?: string };
  if (!registration.client_id) {
    throw new Error('Dynamic OAuth client registration returned no client_id.');
  }
  return { client_id: registration.client_id };
}

function randomUrlSafe(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
