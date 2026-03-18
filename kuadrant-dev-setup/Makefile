.PHONY: help local-setup

MKFILE_PATH := $(abspath $(lastword $(MAKEFILE_LIST)))
PROJECT_PATH := $(patsubst %/,%,$(dir $(MKFILE_PATH)))

local-setup:
	@echo ""
	@echo "installing cert-manager operator..."
	@$(MAKE) cert-manager-install
	@echo ""
	@echo "installing default gatewayclass..."
	@$(MAKE) gatewayclass 
	@echo ""
	@echo "installing kuadrant..."
	@$(MAKE) kuadrant-install
	@echo ""
	@echo "installing demo resources..."
	@$(MAKE) demo-install
	@echo ""
	@echo "cluster ready! kuadrant and demo resources installed."
	@echo ""

cert-manager-install: 
	@oc apply -f $(PROJECT_PATH)/cert-manager-operator/manifests.yaml

gatewayclass: 
	@oc apply -f $(PROJECT_PATH)/gatewayclass.yaml

kuadrant-install:
	@echo ""
	@oc create namespace kuadrant-system --dry-run=client -o yaml | oc apply -f -
	@echo ""
	@echo "installing kuadrant operator"
	@oc apply -f $(PROJECT_PATH)/kuadrant/operatorgroup.yaml
	@oc apply -f $(PROJECT_PATH)/kuadrant/catalogsource.yaml
	@oc apply -f $(PROJECT_PATH)/kuadrant/subscription.yaml
	@echo "waiting for kuadrant operator..."
	@oc wait --for=jsonpath='{.status.state}'=AtLatestKnown subscription/kuadrant-operator -n kuadrant-system --timeout=600s
	@KUADRANT_VERSION=$$(oc get subscription kuadrant-operator -n kuadrant-system -o jsonpath='{.status.installedCSV}'); \
		oc wait --for=jsonpath='{.status.phase}'=Succeeded csv/$$KUADRANT_VERSION --timeout=300s -n kuadrant-system; \
		echo "$$KUADRANT_VERSION installed!"
	@echo ""
	@echo "creating kuadrant instance..."
	@oc apply -f $(PROJECT_PATH)/kuadrant/kuadrant-instance.yaml
	@echo "waiting for kuadrant instance..."
	@oc wait --timeout=120s kuadrant kuadrant -n kuadrant-system --for=condition=Ready
	@echo ""
	@echo "waiting for developer portal controller..."
	@oc -n kuadrant-system wait --timeout=120s --for=condition=Available deployments developer-portal-controller
	@echo ""
	@echo "kuadrant installed!"

demo-install:
	@echo "installing demo resources..."
	@kubectl apply -f demo/toystore-demo.yaml
	@kubectl apply -f demo/gamestore-demo.yaml
	@kubectl apply -f demo/additional-demos.yaml
	@echo ""
	@echo "demo resources installed!"
	@echo ""
	@echo "verify with:"
	@echo "  kubectl get pods -n toystore"
	@echo "  kubectl get apiproducts -n toystore"
