export interface AuthCodeSnippets {
  curl: string;
  nodejs: string;
  python: string;
  go: string;
}

export const generateAuthCodeSnippets = (apiKey: string, hostname: string): AuthCodeSnippets => {
  const url = `https://${hostname}/api/v1/example`;

  return {
    curl: `curl -X GET "${url}" \\
  -H "Authorization: Bearer ${apiKey}"`,

    nodejs: `const axios = require('axios');

axios.get('${url}', {
  headers: {
    'Authorization': 'Bearer ${apiKey}'
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
    "Authorization": f"Bearer ${apiKey}"
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
    req.Header.Add("Authorization", "Bearer ${apiKey}")

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
