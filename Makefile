.PHONY: oinc oinc-backend oinc-mcp-demo oinc-sync-plugin-proxy oinc-teardown

oinc:
	./start-local.sh

oinc-backend:
	./scripts/build-inspector-backend.sh

oinc-sync-plugin-proxy:
	./scripts/sync-console-plugin-proxy.sh

oinc-mcp-demo:
	bash ./scripts/setup-mcp-demo.sh

oinc-teardown:
	./scripts/teardown.sh
