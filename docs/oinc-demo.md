# oinc demo resources

Run `make oinc ARGS=--demo` to create the development environment, seed sample
resources, and start the plugin with hot reload. `./start-local.sh --demo` is
equivalent; Make itself does not accept a custom `--demo` option.

To seed an existing environment without restarting the plugin server:

```bash
kubectl config use-context oinc
make oinc-demo
```

The installer enables the developer portal controller and waits for its APIs,
backends, Gateway, policies, APIProducts, and generated key requests. It can
be rerun: manifests are applied by name and existing approval decisions are
preserved. Plain `make oinc` leaves this optional demo set alone. The existing
MCP demo remains part of the standard cluster setup.

Both `make oinc ARGS=--demo` and `make oinc-demo` also refresh the shared MCP
samples through `scripts/setup-mcp-demo.sh`, including on existing clusters.
MCP configuration stays in its existing setup scripts. See
[MCP demo servers](mcp-inspector.md#demo-servers) for the available extensions
and credentials.

## Resources

All sample backends use Kuadrant's talker API image, which returns information
about the request. The catalog entries illustrate different API management
workflows; they are not implementations of toy, game, or inventory databases.
Their Definition tabs use the illustrative Kuadrant Petstore OpenAPI document,
fetched by the portal controller from GitHub.

| Namespace                 | Resources                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kuadrant-demo-gateway`   | `demo` HTTP Gateway with an Istio/MetalLB Service configuration                                                                                                                       |
| `kuadrant-demo-toystore`  | Talker backend, `toystore` HTTPRoute, API-key AuthPolicy, gold/silver/bronze PlanPolicy, published Toystore APIProduct with manual approval, ReferenceGrant for the inventory backend |
| `kuadrant-demo-gamestore` | Talker backend; `gamestore`, `inventory`, and `analytics` HTTPRoutes; API-key AuthPolicy and PlanPolicy for Gamestore; Inventory RateLimitPolicy; three APIProducts                   |
| `kuadrant-demo-consumer`  | Three APIKeys and their development-only Secrets                                                                                                                                      |

Gamestore is published with automatic approval. Inventory is published and public,
with a limit of 10 requests per 10 seconds. Its route forwards across namespaces
to the Toystore backend using a ReferenceGrant. Analytics starts as a draft so
you can try publishing it. The plan limits are 10,000 requests/day for gold,
1,000 for silver, and 100 for bronze.

The portal controller creates APIKeyRequests in each product's namespace and
an APIKeyApproval for the automatic flow. On the first installation:

| Consumer APIKey    | Product   | Plan   | Approval               |
| ------------------ | --------- | ------ | ---------------------- |
| `alice-toystore`   | Toystore  | gold   | Pending manual review  |
| `bob-toystore`     | Toystore  | bronze | Pending manual review  |
| `gamestore-client` | Gamestore | silver | Automatically approved |

Open **Kuadrant → API Products** and **API Key Approvals**, using all namespaces
or a demo product namespace. The sample keys belong to Alice, Bob, and Carol,
so they may not appear in **My API Keys** for your logged-in user. Create a
request through the UI to exercise that view as yourself. You can also explore
the Gateway, HTTPRoutes, policies, and their topology relationships.

## Send traffic

Port forwarding works without DNS setup or direct access to the MetalLB subnet.
In one terminal:

```bash
kubectl --context=oinc -n kuadrant-demo-gateway port-forward service/demo-istio 8080:80
```

In another terminal, call the public Inventory API:

```bash
curl -i -H 'Host: inventory.demo.kuadrant.local' http://localhost:8080/
```

Repeated calls beyond the configured limit return HTTP 429. Gamestore requires
an API key; an unauthenticated call returns HTTP 401:

```bash
curl -i -H 'Host: gamestore.demo.kuadrant.local' http://localhost:8080/
curl -i -H 'Host: gamestore.demo.kuadrant.local' \
  -H 'Authorization: APIKEY demo-gamestore-client-key' http://localhost:8080/
```

Once automatic approval has reconciled, the second call succeeds. After approving
Alice's Toystore request in the Console, try:

```bash
curl -i -H 'Host: toystore.demo.kuadrant.local' \
  -H 'Authorization: APIKEY demo-alice-toystore-key' http://localhost:8080/
```

These are public sample credentials for local development. DNSPolicy and
TLSPolicy are intentionally omitted; the demo Gateway uses HTTP on port 80.

## Cleanup

Delete the dedicated namespaces to remove this demo, including any resources
you added inside those namespaces. The portal controller cleans up the
associated enforcement Secrets it created in `kuadrant-system`.

```bash
kubectl --context=oinc delete namespace \
  kuadrant-demo-consumer kuadrant-demo-gamestore \
  kuadrant-demo-toystore kuadrant-demo-gateway
```

The shared MCP samples live in separate namespaces and remain installed.

Run `make oinc-demo` again for a fresh set of pending requests, or
`make oinc-teardown` to remove the entire development cluster.

## Sources

The manifests in [`scripts/demo`](../scripts/demo) adapt the
[Backstage toystore/gamestore examples](https://github.com/Kuadrant/kuadrant-backstage-plugin/tree/main/kuadrant-dev-setup/demo)
and follow the Kuadrant references for
[APIProduct](https://docs.kuadrant.io/dev/backstage/apiproduct/),
[PlanPolicy](https://docs.kuadrant.io/dev/kuadrant-operator/doc/extensions/planpolicy/),
and the [developer portal controller samples](https://github.com/Kuadrant/developer-portal-controller/tree/main/config/samples).
