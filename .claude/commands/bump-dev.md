---
description: Bump version to next -dev after a release
---

Bump the version to the next development version after a release:

1. Sync with upstream first:
   - Run: git fetch upstream
   - Check if local main is behind upstream/main
   - If behind, rebase: git rebase upstream/main
2. Read package.json to get current version
3. Calculate next patch version with -dev suffix (e.g., 0.2.3 -> 0.2.4-dev)
4. Update version in package.json (both top-level and consolePlugin.version)
5. Git add package.json
6. Git commit with message "Bump to v{VERSION}" (e.g., "Bump to v0.2.4-dev")
7. Push to upstream (this repo uses fork workflow):
   - Run: git push upstream main
   - If push fails due to upstream being ahead, fetch and rebase again, then retry
8. Sync fork:
   - Remind to run: git push origin main --force-with-lease

Important notes:
- This repo uses a fork workflow (origin = jasonmadigan/*, upstream = Kuadrant/*)
- Always push to upstream, not origin
- Sync with upstream before starting to avoid conflicts
- Use exact format from git history: "Bump to v0.2.4-dev"
- Update BOTH version fields in package.json
- No need to run build for -dev bumps
