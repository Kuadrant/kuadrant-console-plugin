export interface AuthCodeSnippets {
  curl: string;
  nodejs: string;
  python: string;
  go: string;
}

export const generateAuthCodeSnippets = (
  apiKey: string,
  hostname: string,
  authPrefix = 'Bearer',
): AuthCodeSnippets => {
  const url = `https://${hostname}/api/v1/example`;
  // Some auth schemes use an empty prefix; only prepend one (with a space) when present.
  const credential = authPrefix ? `${authPrefix} ${apiKey}` : apiKey;

  return {
    curl: `curl -X GET "${url}" \\
  -H "Authorization: ${credential}"`,

    nodejs: `const axios = require('axios');

axios.get('${url}', {
  headers: {
    'Authorization': '${credential}'
  }
})
.then(response => {
  console.log(response.data);
})
.catch(error => {
  console.error('Error:', error);
});`,

    python: `import requests

url = "${url}"
headers = {
    "Authorization": "${credential}"
}

response = requests.get(url, headers=headers)
print(response.json())`,

    go: `package main

import (
    "fmt"
    "io"
    "net/http"
)

func main() {
    url := "${url}"

    req, _ := http.NewRequest("GET", url, nil)
    req.Header.Add("Authorization", "${credential}")

    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    fmt.Println(string(body))
}`,
  };
};
