#!/usr/bin/env bash
# Maps changed source files to relevant e2e spec files.
# Outputs space-separated spec paths relative to repo root, or empty string for full smoke fallback.
# Compatible with bash 3.2+ (macOS default).

set -euo pipefail

SPEC_DIR="e2e/tests"

# Get changed files — in CI GITHUB_BASE_REF is set; locally fall back to HEAD~1
BASE="${GITHUB_BASE_REF:-main}"
CHANGED=$(git diff --name-only "origin/${BASE}...HEAD" 2>/dev/null || git diff --name-only HEAD~1 2>/dev/null || echo "")

if [ -z "$CHANGED" ]; then
  echo ""
  exit 0
fi

# Changes to these paths affect all tests → fall back to full smoke suite
for pattern in \
  "^src/utils/" \
  "^src/hooks/" \
  "^src/constants/" \
  "^e2e/tests/helpers\.ts" \
  "^e2e/manifests/" \
  "^e2e/setup\.sh" \
  "^e2e/teardown\.sh" \
  "^scripts/" \
  "^package\.json" \
  "^yarn\.lock" \
  "^\.github/workflows/"
do
  if echo "$CHANGED" | grep -qE "$pattern"; then
    echo ""
    exit 0
  fi
done

# Collect matching spec files
SPECS=""

if echo "$CHANGED" | grep -qE "^src/components/apikey/"; then
  SPECS="$SPECS apikey-lifecycle.spec.ts apikey-approvals.spec.ts apiproduct-apikeys-tab.spec.ts"
fi

if echo "$CHANGED" | grep -qE "^src/components/apiproduct/APIProductsListPage"; then
  SPECS="$SPECS api-product-list.spec.ts"
fi

if echo "$CHANGED" | grep -qE "^src/components/apiproduct/APIProductAPIKeysTab"; then
  SPECS="$SPECS apiproduct-apikeys-tab.spec.ts"
fi

if echo "$CHANGED" | grep -qE "^src/components/apiproduct/APIProductDefinitionTab|^src/components/apiproduct/APIProductPoliciesTab"; then
  SPECS="$SPECS apiproduct-details-tabs.spec.ts"
fi

if echo "$CHANGED" | grep -qE "^src/components/apiproduct/(APIProductOverviewTab|ContactInfoEdit|PublishStatusEdit|DocumentationEdit|TagsEdit)"; then
  SPECS="$SPECS apiproduct-overview-tab.spec.ts"
fi

if echo "$CHANGED" | grep -qE "^src/components/apiproduct/"; then
  SPECS="$SPECS apiproduct-crud.spec.ts apiproduct-overview-tab.spec.ts api-product-list.spec.ts apiproduct-rbac.spec.ts"
fi

if echo "$CHANGED" | grep -qE "^src/components/NoPermissionsView"; then
  SPECS="$SPECS apiproduct-rbac.spec.ts rbac.spec.ts"
fi

if echo "$CHANGED" | grep -qE "^src/components/topology/"; then
  SPECS="$SPECS topology.spec.ts rbac.spec.ts"
fi

if echo "$CHANGED" | grep -qE "^src/components/(gateway|KuadrantOverview|KuadrantPolicies|ResourceList|DropdownWithKebab)"; then
  SPECS="$SPECS overview.spec.ts rbac.spec.ts"
fi

if echo "$CHANGED" | grep -qE "^src/components/(dnspolicy|tlspolicy)/"; then
  SPECS="$SPECS policy-forms.spec.ts rbac.spec.ts"
fi

if echo "$CHANGED" | grep -qE "^src/components/(ratelimitpolicy|authpolicy)/"; then
  SPECS="$SPECS policy-forms.spec.ts rbac.spec.ts"
fi

if echo "$CHANGED" | grep -qE "^src/components/(httproute|issuer)/"; then
  SPECS="$SPECS rbac.spec.ts"
fi

# No mapping matched → fall back to full smoke
if [ -z "$SPECS" ]; then
  echo ""
  exit 0
fi

# Deduplicate and prefix with SPEC_DIR
RESULT=$(echo "$SPECS" | tr ' ' '\n' | grep -v '^$' | sort -u | sed "s|^|${SPEC_DIR}/|" | tr '\n' ' ')
echo "${RESULT% }"
