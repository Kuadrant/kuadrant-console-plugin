---
description: Publish a reviewed stable release from main
argument-hint: <minor|patch> [X.Y.Z]
disable-model-invocation: true
---

# Guarded stable release

Arguments supplied by the user: `$ARGUMENTS`

Publish an already-reviewed stable release from `main`. This command tags the
current commit, creates the GitHub Release, and verifies the Quay.io image
build. It does not edit versions, create release commits, or push a branch.

Follow every gate below in order. Treat an unexpected or ambiguous result as a
failure. Do not repair, force, delete, or bypass anything unless the recovery
section explicitly permits it and the user confirms the recovery action.

## Non-negotiable rules

- Never push to `main`.
- Never use `git push --tags`, `git push --follow-tags`, or a force push.
- Never create a tag through the GitHub Release API. The signed tag must already
  exist on `upstream` before creating the release.
- Never use `GH_TOKEN` or `GITHUB_TOKEN` for the GitHub Release. Use the human
  account stored by `gh auth`.
- Do not continue past a failed gate.

## 1. Parse the request

Accept exactly one of these forms:

```text
/release minor
/release minor X.Y.0
/release patch
/release patch X.Y.Z
```

`patch` requires `Z > 0`. Reject extra arguments, a leading `v`, prerelease or
build metadata, and non-canonical semver such as leading zeroes. Never evaluate
or interpolate an unvalidated argument in a shell command.

The version argument is an optional assertion, not permission to edit a file.
Derive the actual version from `package.json` and require the optional argument
to match it exactly.

## 2. Run the read-only preflight

Do all of this before creating a local tag.

1. Verify the tools `git`, `gh`, and `node` are available, and run from the
   repository root.
2. Set the repository to `Kuadrant/console-plugin`. Confirm the `upstream`
   remote points to that repository. Do not silently substitute `origin`.
3. If either `GH_TOKEN` or `GITHUB_TOKEN` is set, stop and ask the user to unset
   it. Then run:

   ```shell
   gh auth status --hostname github.com
   gh api user --jq .login
   ```

   Record the authenticated human login for the release plan.

4. Require `git status --porcelain=v1` to be empty, including untracked files.
5. Require the current branch to match exactly `main` and not be detached.
6. Fetch only main without tags:

   ```shell
   git fetch --no-tags upstream \
     "refs/heads/main:refs/remotes/upstream/main"
   ```

   Require local `HEAD` and `refs/remotes/upstream/main` to be the same commit.
   Record it as `HEAD_SHA`.

7. Read the versions from `package.json`:
   - `version` (top-level)
   - `consolePlugin.version`

   Require them to be identical canonical `X.Y.Z` values. Reject `-dev` and all
   other prerelease/build suffixes. Require `X.Y` to be consistent with the
   release type. Require `Z == 0` for `minor` and `Z > 0` for `patch`. If the
   user supplied a version, require an exact match. Set `TAG=vX.Y.Z` only after
   these checks.

8. Require the tag to be absent locally and on `upstream`. Use exact refs, and
   check both the tag object and its peeled form:

   ```shell
   git show-ref --verify --quiet "refs/tags/${TAG}"
   git ls-remote --tags upstream \
     "refs/tags/${TAG}" "refs/tags/${TAG}^{}"
   ```

   The first command must report no ref and the second must return no output.
   A failed remote query is not an empty result. Also require
   `gh release view "$TAG" --repo "$REPO"` to fail specifically because the
   release was not found; authentication, authorization, and network errors are
   failed gates.

9. Find pull requests associated with `HEAD_SHA`:

   ```shell
   gh api "repos/${REPO}/commits/${HEAD_SHA}/pulls" \
     --jq '.[] | {number, base: .base.ref, merge_commit_sha, merged_at, url: .html_url}'
   ```

   Require exactly one merged PR whose base is `main` and whose
   `merge_commit_sha` is `HEAD_SHA`. Verify it again with `gh pr view`. This is
   the reviewed release PR; an unassociated or direct commit is not releasable.

10. Run `gh pr checks "$PR" --required --repo "$REPO"`. Require it to exit
    successfully and specifically show all five repository CI jobs passing:
    `build`, `lint`, `i18n`, `unit`, and `e2e`. Pending, skipped, missing,
    cancelled, or failed required checks are failures.

11. Verify the tag version does not already exist on Quay.io:

    ```shell
    curl -sf "https://quay.io/api/v1/repository/kuadrant/console-plugin/tag/?specificTag=${TAG}"
    ```

    Parse the response: if the `tags` array is non-empty, the image already
    exists — stop and report a previous publication. A registry or network error
    is a failed check, not proof of absence.

## 3. Confirm the release plan

Print a compact plan containing:

- release type, version, and tag;
- branch and full `HEAD_SHA`;
- release PR number and URL;
- required CI results;
- `upstream` URL;
- authenticated GitHub login;
- Quay.io image: `quay.io/kuadrant/console-plugin:${TAG}`; and
- the only ref that will be pushed: `refs/tags/$TAG`.

Ask the user for explicit confirmation. The command invocation itself is not
confirmation. Stop without changing anything if they do not confirm.

## 4. Create and push only the signed tag

Immediately after confirmation, fetch main again and repeat the clean-worktree,
branch synchronization, package-version, remote-tag absence, release absence,
PR/CI, and Quay.io absence checks. This closes the gap between preflight and
push.

Create a signed annotated tag at the already-recorded commit:

```shell
git tag -s "$TAG" "$HEAD_SHA" -m "$TAG"
```

Require all of these before pushing:

```shell
git cat-file -t "refs/tags/${TAG}"  # must be: tag
git verify-tag "$TAG"               # must succeed
git rev-list -n 1 "$TAG"            # must be HEAD_SHA
```

If signing or verification fails, stop. If no remote tag appeared during the
final check, push this one ref with no shorthand or wildcard:

```shell
git push upstream "refs/tags/${TAG}:refs/tags/${TAG}"
```

Never retry with force. Verify that the remote tag object equals the local tag
object and that its peeled commit equals `HEAD_SHA` using `git ls-remote`.

## 5. Publish the GitHub Release

Reconfirm that `GH_TOKEN` and `GITHUB_TOKEN` are unset and that the
authenticated login still matches the one recorded in the confirmed plan; stop
on any mismatch. Create a non-draft GitHub Release from the existing remote tag:

```shell
gh release create "$TAG" \
  --repo Kuadrant/console-plugin \
  --verify-tag \
  --generate-notes
```

Do not pass `--target`; the tag is the source of truth. Read the release back
with `gh release view` and report its URL.

## 6. Monitor Quay.io image build

The tag push triggers `.github/workflows/build-push.yaml`. Poll for the run
matching all of these values, rather than selecting the latest run:

- workflow: `build-push.yaml`;
- event: `push`;
- branch: `$TAG`;
- commit: `HEAD_SHA`.

`gh run list` supports all four filters. Allow up to two minutes for the event to
appear, require exactly one matching run, then wait for it:

```shell
gh run watch "$RUN_ID" --repo Kuadrant/console-plugin --compact --exit-status
```

If it fails, show `gh run view "$RUN_ID" --log-failed`, inspect Quay.io state,
and stop. Do not automatically rerun it.

After a successful workflow, poll Quay.io for up to five minutes to allow for
registry propagation:

```shell
curl -sf "https://quay.io/api/v1/repository/kuadrant/console-plugin/tag/?specificTag=${TAG}"
```

Require the `tags` array to be non-empty and contain the expected tag. Report the
workflow URL and verified image tag.

## 7. Finish

Report the tag, release URL, workflow URL, and verified Quay.io image. Then
remind the user to run `/bump-dev` to prepare the next development version;
never make or push that change from this command.

## Recovery

An existing tag, release, workflow run, or Quay.io image is never a normal
preflight success. Stop, inventory the exact state, and consult this section.

- A local-only tag may be reused only if it is signed, annotated, and resolves
  to the synchronized main `HEAD`. Otherwise, delete only that local tag after
  the user confirms it was created by the failed attempt.
- Never move, overwrite, force-push, or automatically delete a remote tag.
- If the correct remote tag exists but the GitHub Release does not, rerun all
  branch, version, PR, CI, and tag verification before asking whether to resume
  at release creation.
- If the GitHub Release exists, do not recreate it. Locate its exact publication
  run and inspect Quay.io first.
- If the image build failed, show the failed workflow logs. The user can rerun
  the workflow manually via GitHub. Do not automatically rerun from the command.
