---
description: Create a minor release (e.g., 0.2.3 -> 0.3.0)
---

Perform a minor release of the kuadrant-console-plugin:

1. Sync with upstream first:
   - Run: git fetch upstream
   - Check if local main is behind upstream/main
   - If behind, rebase: git rebase upstream/main
2. Read package.json to get current version
3. Calculate next minor version (increment minor number, reset patch to 0, remove -dev suffix)
4. Update version in package.json (both top-level and consolePlugin.version)
5. Run yarn build to verify everything compiles
6. Git add package.json
7. Git commit with message "v{VERSION}" (e.g., "v0.3.0")
8. Git tag with "v{VERSION}"
9. Push to upstream (this repo uses fork workflow):
   - Run: git push upstream main
   - Run: git push upstream --tags
   - If push fails due to upstream being ahead, fetch and rebase again, then retry
10. Create GitHub release:
    - Run: gh release create v{VERSION} --generate-notes
    - This will auto-generate release notes from commits since last release
11. Bump to next -dev version:
    - Calculate next patch version with -dev suffix (e.g., 0.3.0 -> 0.3.1-dev)
    - Update version in package.json (both top-level and consolePlugin.version)
    - Git add package.json
    - Git commit with message "Bump to v{VERSION}" (e.g., "Bump to v0.3.1-dev")
    - Push to upstream: git push upstream main
12. Sync fork:
    - Remind to run: git push origin main --force-with-lease

Important notes:
- This repo uses a fork workflow (origin = jasonmadigan/*, upstream = Kuadrant/*)
- Always push to upstream, not origin
- Sync with upstream before starting to avoid conflicts
- Use exact version format from git history (just "v0.3.0", not "Bump to" or other text)
- Update BOTH version fields in package.json
- Verify build succeeds before committing
- Use --generate-notes flag for automatic release notes from git history
- ALWAYS bump to next -dev version after releasing
