#!/usr/bin/env bash
set -euo pipefail

# delegates to shared teardown
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../scripts/teardown.sh"
