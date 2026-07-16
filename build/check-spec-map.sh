#!/usr/bin/env bash
set -euo pipefail

MISSING=$(comm -23 \
  <(ls e2e/tests/*.spec.ts | xargs -n1 basename | sort) \
  <(grep -oE '[a-z0-9-]+\.spec\.ts' build/suite-router.sh | sort -u))

if [ -n "$MISSING" ]; then
  echo "some spec not mapped in suite-router.sh:"
  echo "$MISSING"
  exit 1
fi

echo "all specs mapped"
