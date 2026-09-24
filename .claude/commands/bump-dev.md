---
description: Prepare a PR for the next development version
argument-hint: <minor|patch> [X.Y.Z-dev]
disable-model-invocation: true
---

# Prepare the next development version

Arguments supplied by the user: `$ARGUMENTS`

Follow the post-release guidance in `RELEASE.md`. Accept `minor` or `patch`,
with an optional canonical `X.Y.Z-dev` assertion. If the release plan already
specifies the next version, use it; otherwise ask which increment is intended.
Reject extra arguments and never evaluate unvalidated input in a shell.

1. Fetch `upstream/main` and the intended stable release tag. Verify that the
   release is complete and its `release-X.Y` maintenance branch exists before
   moving `main` to a new minor.
2. Read both version fields from `upstream/main` and the release tag. Calculate
   the next version from that stable release: `X.(Y+1).0-dev` for `minor`, or
   `X.Y.(Z+1)-dev` for `patch`. Require any supplied assertion to match. If main
   already has that version, report no change needed. If main has a newer
   development version, preserve it; an older maintenance release must not
   downgrade main. Stop on mismatched manifest fields or ambiguous versions.
3. Create a topic branch from `upstream/main` in a clean worktree. Place task
   worktrees inside the repository under `.worktrees/<task>` and use
   `git worktree add --relative-paths`. Preserve existing local work.
4. Update only `version` and `consolePlugin.version` in `package.json`. Verify
   that both equal the intended version and inspect `git diff --check` and the
   diff. A version-only edit does not require a local build.
5. Commit with `git commit --signoff -m "Bump to vX.Y.Z-dev"`. Push the topic
   branch to the contributor's fork (`origin` after checking its URL) and open
   a PR against `Kuadrant/kuadrant-console-plugin`, base `main`.
6. Report the PR URL and CI status. The PR follows normal maintainer review and
   required CI before merge.

Never push directly to `main` or a maintenance branch, force-sync a fork, or
merge the PR as part of this command.
