# makefile wraps yarn scripts so the project works regardless of yarn version.
# use `make <target>` instead of `yarn <script>`.

.DEFAULT_GOAL := help

.PHONY: help clean build build-dev start start-console i18n lint test \
        test-e2e test-e2e-setup test-e2e-teardown webpack \
        downstream-replacements upstream-replacements oinc oinc-teardown

help: ## show available targets
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'

clean: ## remove build artefacts
	yarn clean

build: ## production build
	yarn build

build-dev: ## development build (no optimisation)
	yarn build-dev

start: ## start webpack dev server
	yarn start

start-console: ## start local openshift console
	yarn start-console

i18n: ## build i18n translation files
	yarn i18n

lint: ## run eslint and stylelint with auto-fix
	yarn lint

test: ## run jest unit tests
	yarn test

test-e2e: ## run playwright e2e tests
	yarn test:e2e

test-e2e-setup: ## set up e2e test environment
	yarn test:e2e:setup

test-e2e-teardown: ## tear down e2e test environment
	yarn test:e2e:teardown

webpack: ## run webpack directly
	yarn webpack

downstream-replacements: ## apply downstream (rhcl) replacements
	yarn downstream-replacements

upstream-replacements: ## revert downstream replacements
	yarn upstream-replacements

oinc: ## start local dev environment
	./start-local.sh

oinc-teardown: ## tear down local dev environment
	./scripts/teardown.sh
