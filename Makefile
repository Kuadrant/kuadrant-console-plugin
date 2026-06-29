.PHONY: oinc oinc-teardown

oinc:
	./start-local.sh

oinc-teardown:
	./scripts/teardown.sh
