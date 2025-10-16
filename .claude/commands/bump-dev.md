---
description: Bump version to next -dev after a release
---

Bump the version to the next development version after a release:

1. Read package.json to get current version
2. Calculate next patch version with -dev suffix (e.g., 0.2.3 -> 0.2.4-dev)
3. Update version in package.json (both top-level and consolePlugin.version)
4. Git add package.json
5. Git commit with message "Bump to v{VERSION}" (e.g., "Bump to v0.2.4-dev")
6. Show summary and remind me to:
   - Review the commit
   - Push with: git push

Important notes:
- DO NOT push automatically (per my CLAUDE.md instructions)
- Use exact format from git history: "Bump to v0.2.4-dev"
- Update BOTH version fields in package.json
- No need to run build for -dev bumps
