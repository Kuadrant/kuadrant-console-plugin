.PHONY: oinc oinc-sync-plugin-proxy oinc-teardown

oinc:
	./start-local.sh

oinc-sync-plugin-proxy:
	./scripts/sync-console-plugin-proxy.sh

oinc-teardown:
	./scripts/teardown.sh
