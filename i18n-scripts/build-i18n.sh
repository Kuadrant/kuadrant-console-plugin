#!/usr/bin/env bash

set -exuo pipefail

# .claude holds local worktrees with their own node_modules
FILE_PATTERN="{!(dist|node_modules|.claude)/**/*.{js,jsx,ts,tsx,json},*.{js,jsx,ts,tsx,json}}"

i18next "${FILE_PATTERN}" [-oc] -c "./i18next-parser.config.js" -o "locales/\$LOCALE/\$NAMESPACE.json"
