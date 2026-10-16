import { APIKeyCredentials } from './resources';

export interface AuthCodeSnippets {
  curl: string;
  nodejs: string;
  python: string;
  go: string;
}

// Authorino falls back to this scheme when an authorizationHeader credential has no prefix,
// and it is also what we assume when the APIKey status carries no auth scheme at all.
export const DEFAULT_AUTHORIZATION_PREFIX = 'Bearer';

/**
 * Where the API key has to be sent, derived from the Authorino credentials block that the
 * developer-portal controller copies into `APIKey.status.authScheme.credentials`.
 */
export type CredentialLocation =
  | { in: 'header'; name: string; value: string }
  | { in: 'query'; name: string; value: string }
  | { in: 'cookie'; name: string; value: string };

export const resolveCredentialLocation = (
  apiKey: string,
  credentials?: APIKeyCredentials,
): CredentialLocation => {
  // Same precedence Authorino uses when more than one location is set.
  if (credentials?.authorizationHeader) {
    const prefix = credentials.authorizationHeader.prefix?.trim() || DEFAULT_AUTHORIZATION_PREFIX;
    return { in: 'header', name: 'Authorization', value: `${prefix} ${apiKey}` };
  }
  if (credentials?.customHeader?.name) {
    return { in: 'header', name: credentials.customHeader.name, value: apiKey };
  }
  if (credentials?.queryString?.name) {
    return { in: 'query', name: credentials.queryString.name, value: apiKey };
  }
  if (credentials?.cookie?.name) {
    return { in: 'cookie', name: credentials.cookie.name, value: apiKey };
  }
  return {
    in: 'header',
    name: 'Authorization',
    value: `${DEFAULT_AUTHORIZATION_PREFIX} ${apiKey}`,
  };
};

const curlSnippet = (url: string, location: CredentialLocation): string => {
  switch (location.in) {
    case 'query':
      return `curl -X GET "${url}?${location.name}=${location.value}"`;
    case 'cookie':
      return `curl -X GET "${url}" \
  --cookie "${location.name}=${location.value}"`;
    default:
      return `curl -X GET "${url}" \
  -H "${location.name}: ${location.value}"`;
  }
};

const nodejsSnippet = (url: string, location: CredentialLocation): string => {
  let options: string;
  switch (location.in) {
    case 'query':
      options = `  params: {
    '${location.name}': '${location.value}'
  }`;
      break;
    case 'cookie':
      options = `  headers: {
    'Cookie': '${location.name}=${location.value}'
  }`;
      break;
    default:
      options = `  headers: {
    '${location.name}': '${location.value}'
  }`;
  }

  return `const axios = require('axios');

axios.get('${url}', {
${options}
})
.then(response => {
  console.log(response.data);
})
.catch(error => {
  console.error('Error:', error);
});`;
};

const pythonSnippet = (url: string, location: CredentialLocation): string => {
  let setup: string;
  let call: string;
  switch (location.in) {
    case 'query':
      setup = `params = {
    "${location.name}": "${location.value}"
}`;
      call = 'requests.get(url, params=params)';
      break;
    case 'cookie':
      setup = `cookies = {
    "${location.name}": "${location.value}"
}`;
      call = 'requests.get(url, cookies=cookies)';
      break;
    default:
      setup = `headers = {
    "${location.name}": "${location.value}"
}`;
      call = 'requests.get(url, headers=headers)';
  }

  return `import requests

url = "${url}"
${setup}

response = ${call}
print(response.json())`;
};

const goSnippet = (url: string, location: CredentialLocation): string => {
  const requestUrl = location.in === 'query' ? `${url}?${location.name}=${location.value}` : url;
  let attach = '';
  switch (location.in) {
    case 'query':
      break;
    case 'cookie':
      attach = `
    req.AddCookie(&http.Cookie{Name: "${location.name}", Value: "${location.value}"})`;
      break;
    default:
      attach = `
    req.Header.Add("${location.name}", "${location.value}")`;
  }

  return `package main

import (
    "fmt"
    "io"
    "net/http"
)

func main() {
    url := "${requestUrl}"

    req, _ := http.NewRequest("GET", url, nil)${attach}

    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    fmt.Println(string(body))
}`;
};

export const generateAuthCodeSnippets = (
  apiKey: string,
  hostname: string,
  credentials?: APIKeyCredentials,
): AuthCodeSnippets => {
  const url = `https://${hostname}/api/v1/example`;
  const location = resolveCredentialLocation(apiKey, credentials);

  return {
    curl: curlSnippet(url, location),
    nodejs: nodejsSnippet(url, location),
    python: pythonSnippet(url, location),
    go: goSnippet(url, location),
  };
};
