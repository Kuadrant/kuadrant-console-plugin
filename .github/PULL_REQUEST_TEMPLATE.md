## Description

<!-- Clear description of what this PR does and why -->

Fixes # (issue)

## Type of change

- [ ] `[fix]` Bug fix
- [ ] `[feat]` New feature
- [ ] `[refactor]` Refactor (no functional changes)
- [ ] `[test]` Test updates
- [ ] `[chore]` Dependency / config update

## Changes made

-
-

## Test plan

- [ ] `yarn lint` passes (no changes after running)
- [ ] `yarn build` passes
- [ ] `yarn i18n` passes (no changes after running — commit updated locale files if needed)
- [ ] Tested manually in OpenShift Console
- [ ] Tested in both light and dark themes
- [ ] Tested in all-namespaces and single namespace mode

## Screenshots

<!-- For UI changes, add before/after screenshots -->

| Before | After |
|--------|-------|
|        |       |

## Checklist

- [ ] All user-facing strings use `t()` and are added to `locales/en/plugin__kuadrant-console-plugin.json`
- [ ] CSS classes are prefixed with `kuadrant-` — no bare `.pf-*` or `.co-*` selectors, no hex colours
- [ ] No `console.log` statements left in
- [ ] Commits include `Signed-off-by` line (`git commit -s`)
