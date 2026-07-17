#!/usr/bin/env bash
set -euo pipefail

SPECS=$(ls e2e/tests/*.spec.ts | xargs -n1 basename | LC_ALL=C sort)
[ -n "$SPECS" ] || { echo "error: no spec files found in e2e/tests/"; exit 1; }

MAPPED=$(grep -oE '[a-z0-9-]+\.spec\.ts' build/suite-router.sh | LC_ALL=C sort -u)

MISSING=$(comm -23 <(echo "$SPECS") <(echo "$MAPPED"))

if [ -n "$MISSING" ]; then
  echo "some spec not mapped in suite-router.sh:"
  echo "$MISSING"
  exit 1
fi

echo "all specs mapped"
