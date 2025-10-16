---
description: Create a minor release (e.g., 0.2.3 -> 0.3.0)
---

Perform a minor release of the kuadrant-console-plugin:

1. Read package.json to get current version
2. Calculate next minor version (increment minor number, reset patch to 0, remove -dev suffix)
3. Update version in package.json (both top-level and consolePlugin.version)
4. Run yarn build to verify everything compiles
5. Git add package.json
6. Git commit with message "v{VERSION}" (e.g., "v0.3.0")
7. Git tag with "v{VERSION}"
8. Check if gh CLI is available
9. If gh is available:
   - Create GitHub release using: gh release create v{VERSION} --generate-notes
   - This will auto-generate release notes from commits since last release
10. Show summary and remind me to:
    - Review the commit and tag
    - Push with: git push && git push --tags
    - If gh wasn't available or failed, create release manually on GitHub

Important notes:
- DO NOT push automatically (per my CLAUDE.md instructions)
- Use exact version format from git history (just "v0.3.0", not "Bump to" or other text)
- Update BOTH version fields in package.json
- Verify build succeeds before committing
- Use --generate-notes flag for automatic release notes from git history
