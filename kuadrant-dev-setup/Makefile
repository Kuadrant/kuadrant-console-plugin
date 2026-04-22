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
	@echo "enabling observability user workload"
	@$(MAKE) enable-user-metrics
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

enable-user-metrics:
	@oc apply -f $(PROJECT_PATH)/cluster-monitoring.yaml

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
	@echo ""
	@echo "applying API Management ClusterRoles..."
	@kubectl apply -f $(PROJECT_PATH)/../config/rbac/api-management/api-catalog-browser-clusterrole.yaml
	@kubectl apply -f $(PROJECT_PATH)/../config/rbac/api-management/api-consumer-clusterrole.yaml
	@kubectl apply -f $(PROJECT_PATH)/../config/rbac/api-management/api-owner-clusterrole.yaml
	@kubectl apply -f $(PROJECT_PATH)/../config/rbac/api-management/api-admin-clusterrole.yaml
	@echo ""
	@echo "applying demo-specific ClusterRole for namespace visibility..."
	@kubectl apply -f demo/demo-namespace-viewer-clusterrole.yaml
	@echo ""
	@echo "creating demo namespaces and (Cluster)RoleBindings..."
	@kubectl apply -f demo/rbac-demo-users.yaml
	@echo ""
	@echo "creating demo API resources..."
	@kubectl apply -f demo/toystore-demo.yaml
	@kubectl apply -f demo/gamestore-demo.yaml
	@kubectl apply -f demo/additional-demos.yaml
	@kubectl patch apikey rejected-shipping-apikey -n toystore --subresource=status --type=merge -p '{"status":{"phase":"Rejected"}}'
	@echo ""
	@echo "demo resources installed!"
	@echo ""
	@echo "Demo Users (user-based bindings for OpenShift Console impersonation):"
	@echo "  Consumers:"
	@echo "    - alice-mobile-dev (consumer-team-mobile)"
	@echo "    - bob-backend-dev (consumer-team-backend)"
	@echo "  API Owners:"
	@echo "    - charlie-payments-team (api-team-payments)"
	@echo "    - dave-shipping-team (api-team-shipping)"
	@echo "  Platform Admin:"
	@echo "    - eve-admin (cluster-wide)"
	@echo ""
	@echo "Consumer bindings (3 total):"
	@echo "  1. api-consumer RoleBinding (namespace-scoped APIKey management)"
	@echo "  2. api-catalog-browser ClusterRoleBinding (cluster-wide catalog browsing)"
	@echo "  3. demo-namespace-viewer ClusterRoleBinding (namespace visibility)"
	@echo ""
	@echo "Owner bindings (2 total):"
	@echo "  1. api-owner RoleBinding (namespace-scoped API product management)"
	@echo "  2. demo-namespace-viewer ClusterRoleBinding (namespace visibility)"
	@echo ""
	@echo "Admin bindings (2 total):"
	@echo "  1. api-admin ClusterRoleBinding (cluster-wide troubleshooting)"
	@echo "  2. demo-namespace-viewer ClusterRoleBinding (namespace visibility)"
	@echo ""
	@echo "Test Consumer (alice-mobile-dev):"
	@echo "  kubectl get apiproducts --all-namespaces --as=alice-mobile-dev"
	@echo "  kubectl get apikeys -n consumer-team-mobile --as=alice-mobile-dev"
	@echo "  kubectl get namespaces --as=alice-mobile-dev"
	@echo ""
	@echo "Test Owner (charlie-payments-team):"
	@echo "  kubectl get apiproducts -n api-team-payments --as=charlie-payments-team"
	@echo "  kubectl get apikeyrequests -n api-team-payments --as=charlie-payments-team"
	@echo ""
	@echo "Test Admin (eve-admin):"
	@echo "  kubectl get apiproducts --all-namespaces --as=eve-admin"
	@echo "  kubectl get apikeys --all-namespaces --as=eve-admin"
	@echo ""
	@echo "Verify permissions:"
	@echo "  kubectl auth can-i list apiproducts --as=alice-mobile-dev --all-namespaces  # yes"
	@echo "  kubectl auth can-i create apikeys --as=alice-mobile-dev -n consumer-team-mobile  # yes"
	@echo "  kubectl auth can-i list namespaces --as=alice-mobile-dev  # yes"
	@echo "  kubectl auth can-i create apiproducts --as=charlie-payments-team -n api-team-payments  # yes"
	@echo ""
	@echo "OpenShift Console impersonation:"
	@echo "  Username: alice-mobile-dev, bob-backend-dev, charlie-payments-team, dave-shipping-team, eve-admin"
	@echo "  Groups: (leave empty - user bindings work without groups)"
	@echo ""
	@echo "Verify resources:"
	@echo "  kubectl get pods -n toystore"
	@echo "  kubectl get apiproducts -n toystore"
	@echo "  kubectl get namespaces | grep -E 'consumer-team|api-team'"
