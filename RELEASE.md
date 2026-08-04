# Releasing kuadrant-console-plugin

Stable releases are tagged on `main` after a reviewed release PR is merged.
Version changes go through a pull request and CI; the release step never commits
or pushes a branch.

There are two publication points:

1. A signed annotated Git tag fixes `vX.Y.Z` to a reviewed commit.
2. A GitHub Release publishes generated notes for that existing tag.

The tag push triggers `build-push.yaml`, which builds and pushes the
`kuadrant-console-plugin` container image to
[Quay.io](https://quay.io/repository/kuadrant/console-plugin?tab=tags).

Use the guarded Claude command for the happy path. The manual steps below are
the equivalent fallback and are also useful when diagnosing a failed release.

## Prerequisites

- Push access to `Kuadrant/console-plugin`
- A signing key configured for `git tag -s`
- `git`, `gh`, and `node`
- A human GitHub login stored by `gh auth`

Do not set `GH_TOKEN` or `GITHUB_TOKEN` while creating the GitHub Release. Those
environment variables take precedence over the account stored by `gh auth`.
Confirm the human identity before releasing:

```shell
gh auth status --hostname github.com
gh api user --jq .login
```

## Prepare a minor release

A minor release is `X.Y.0` with `Y` incremented and patch reset to `0`.

1. Create a release branch from the current `upstream/main`:

   ```shell
   git fetch upstream main
   git checkout -b release/vX.Y.0 upstream/main
   ```

2. Remove the `-dev` suffix from both version fields in `package.json`:
   - `version`
   - `consolePlugin.version`

3. Verify the build compiles:

   ```shell
   yarn build
   ```

4. Commit and push to your fork:

   ```shell
   git add package.json
   git commit -s -m "vX.Y.0"
   git push origin release/vX.Y.0
   ```

5. Open a PR targeting `main`:

   ```shell
   gh pr create --repo Kuadrant/console-plugin \
     --base main --title "vX.Y.0" --body "Release vX.Y.0"
   ```

6. Merge only after all required CI checks pass. The commit eventually tagged
   must be a reviewed PR merge at the tip of `main`.

## Prepare a patch release

A patch release is `X.Y.Z` where `Z > 0`.

1. Create a release branch from the current `upstream/main`:

   ```shell
   git fetch upstream main
   git checkout -b release/vX.Y.Z upstream/main
   ```

2. Set both version fields in `package.json` to the patch version (e.g.,
   `0.5.0` → `0.5.1`).

3. Verify the build compiles:

   ```shell
   yarn build
   ```

4. Commit and push to your fork:

   ```shell
   git add package.json
   git commit -s -m "vX.Y.Z"
   git push origin release/vX.Y.Z
   ```

5. Open a PR targeting `main`:

   ```shell
   gh pr create --repo Kuadrant/console-plugin \
     --base main --title "vX.Y.Z" --body "Release vX.Y.Z"
   ```

6. Merge only after all required CI checks pass.

## Command-driven release

After the preparation PR is merged, check out the merge commit at the tip of
`main` with a clean worktree, then run one of:

```text
/release minor
/release minor X.Y.0
/release patch
/release patch X.Y.Z
```

The version is normally derived from `package.json`. Supplying it makes the
version an additional assertion; the command never edits any file.

Before changing anything, the command checks the branch, upstream
synchronization, stable versions, release PR, required CI, tag/release absence,
and Quay.io state. It prints the one tag ref it will push and asks for
confirmation. It then creates and verifies a signed tag, pushes only that tag,
creates the GitHub Release with generated notes, waits for the Quay.io image
build, and verifies the image exists.

## Equivalent manual release

Run these commands from the repository root after the release PR has merged.
Set `RELEASE_TYPE` to `minor` or `patch` and omit the leading `v` from
`VERSION`.

```shell
REPO=Kuadrant/console-plugin
RELEASE_TYPE=minor
VERSION=X.Y.Z
TAG=v${VERSION}
HEAD_SHA=$(git rev-parse HEAD)
```

### 1. Preflight

Require a clean, synchronized `main` branch and human `gh` credentials:

```shell
test -z "$(git status --porcelain=v1)"
test "$(git branch --show-current)" = "main"
test -z "${GH_TOKEN:-}"
test -z "${GITHUB_TOKEN:-}"

git remote get-url upstream
gh auth status --hostname github.com
gh api user --jq .login

git fetch --no-tags upstream \
  "refs/heads/main:refs/remotes/upstream/main"
test "$HEAD_SHA" = "$(git rev-parse "refs/remotes/upstream/main")"
```

Read and compare the two version fields:

```shell
TOP_VERSION=$(node -p "require('./package.json').version")
PLUGIN_VERSION=$(node -p "require('./package.json').consolePlugin.version")

test "$TOP_VERSION" = "$PLUGIN_VERSION"
test "$TOP_VERSION" = "$VERSION"
node -e 'process.exit(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(process.argv[1]) ? 0 : 1)' \
  "$VERSION"
```

For a minor release, require the patch component to be zero. For a patch
release, require it to be greater than zero:

```shell
PATCH_VERSION=${VERSION##*.}
if test "$RELEASE_TYPE" = minor; then
  test "$PATCH_VERSION" -eq 0
elif test "$RELEASE_TYPE" = patch; then
  test "$PATCH_VERSION" -gt 0
else
  exit 1
fi
```

Require the tag and GitHub Release to be absent:

```shell
if git show-ref --verify --quiet "refs/tags/${TAG}"; then exit 1; fi
REMOTE_TAG_REFS=$(git ls-remote --tags upstream \
  "refs/tags/${TAG}" "refs/tags/${TAG}^{}") || exit 1
test -z "$REMOTE_TAG_REFS"

RELEASE_OUTPUT=$(gh release view "$TAG" --repo "$REPO" 2>&1)
RELEASE_STATUS=$?
if test "$RELEASE_STATUS" -eq 0 || \
   test "$RELEASE_OUTPUT" != "release not found"; then
  printf '%s\n' "$RELEASE_OUTPUT" >&2
  exit 1
fi
```

Find the PR associated with the exact commit. The output must contain exactly
one merged PR targeting `main`, with `merge_commit_sha` equal to `HEAD_SHA`:

```shell
gh api "repos/${REPO}/commits/${HEAD_SHA}/pulls" \
  --jq '.[] | {number, base: .base.ref, merge_commit_sha, merged_at, url: .html_url}'
```

Set `PR` to that number and verify its state and required checks. The required
checks must include passing `build`, `lint`, `i18n`, `unit`, and `e2e` jobs:

```shell
PR=<release-pr-number>
gh pr view "$PR" --repo "$REPO" \
  --json state,mergedAt,baseRefName,mergeCommit,url
gh pr checks "$PR" --repo "$REPO" --required
```

Verify the image tag is absent from Quay.io:

```shell
QUAY_RESPONSE=$(curl -sf \
  "https://quay.io/api/v1/repository/kuadrant/console-plugin/tag/?specificTag=${TAG}")
QUAY_TAG_COUNT=$(printf '%s' "$QUAY_RESPONSE" | node -e '
  const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
  console.log((data.tags || []).length);
')
test "$QUAY_TAG_COUNT" -eq 0
```

### 2. Sign and push the tag

Fetch and repeat the branch, version, PR/CI, remote-tag, release, and Quay.io
checks immediately before tagging. Then create the signed annotated tag:

```shell
git tag -s "$TAG" "$HEAD_SHA" -m "$TAG"
test "$(git cat-file -t "refs/tags/${TAG}")" = tag
git verify-tag "$TAG"
test "$(git rev-list -n 1 "$TAG")" = "$HEAD_SHA"
```

Push only the intended ref. Never use `--tags`, `--follow-tags`, or force:

```shell
git push upstream "refs/tags/${TAG}:refs/tags/${TAG}"
```

Verify the remote tag object and its peeled commit:

```shell
test "$(git ls-remote --tags upstream "refs/tags/${TAG}" | awk '{print $1}')" = \
  "$(git rev-parse "refs/tags/${TAG}")"
test "$(git ls-remote --tags upstream "refs/tags/${TAG}^{}" | awk '{print $1}')" = \
  "$HEAD_SHA"
```

### 3. Publish the GitHub Release

The existing remote tag is the source of truth. Do not pass `--target`:

```shell
test -z "${GH_TOKEN:-}"
test -z "${GITHUB_TOKEN:-}"
gh api user --jq .login
gh release create "$TAG" --repo "$REPO" --verify-tag --generate-notes
gh release view "$TAG" --repo "$REPO" \
  --json tagName,isDraft,isPrerelease,publishedAt,url
```

### 4. Wait for the Quay.io image build

Allow up to two minutes for the tag-push event to appear. Repeat this query
until it returns exactly one run whose branch is `$TAG` and SHA is `$HEAD_SHA`:

```shell
gh run list --repo "$REPO" \
  --workflow build-push.yaml \
  --event push \
  --branch "$TAG" \
  --commit "$HEAD_SHA" \
  --json databaseId,headBranch,headSha,status,conclusion,url
```

Then wait for that exact run:

```shell
RUN_ID=<databaseId>
gh run watch "$RUN_ID" --repo "$REPO" --compact --exit-status
```

After it succeeds, poll Quay.io for up to five minutes:

```shell
curl -sf \
  "https://quay.io/api/v1/repository/kuadrant/console-plugin/tag/?specificTag=${TAG}"
```

Require the `tags` array to be non-empty.

## Recovery

Never move or force-push a remote tag. Inventory the tag, GitHub Release,
workflow run, and Quay.io image before choosing a recovery point.

### The tag already exists

Inspect it with `git ls-remote`. If the remote tag is absent locally, fetch only
that tag before inspecting:

```shell
git fetch --no-tags upstream \
  "refs/tags/${TAG}:refs/tags/${TAG}"
```

- If it exists only locally and was created by a failed release attempt, reuse
  it only when it is signed, annotated, and points to the synchronized `main`
  tip. Otherwise, after confirming the exact tag name, remove only the local tag
  with `git tag -d $TAG` and rerun the full preflight.
- If the remote tag is correct but no GitHub Release exists, verify that the tag
  is signed and points to the synchronized `main` tip, rerun the remaining
  read-only preflight checks while skipping the tag-absence gate, and resume
  with `gh release create --verify-tag`.
- If the remote tag points anywhere unexpected, stop. Do not delete or replace
  it; choose a new version or agree a recovery with the maintainers.

### GitHub Release creation failed

Use `gh release view $TAG` to determine whether publication actually happened. If
no release exists and the remote tag verifies correctly, retry release creation.
If the release exists, do not create another one; locate the matching push-event
run by tag and SHA.

### Quay.io image build failed

Check `gh run view $RUN_ID --log-failed` for the failure details. The user can
rerun the failed workflow manually via GitHub Actions. Do not automatically rerun
from the command. If the image already exists at the expected tag, do not rebuild
— verify and report it.

## Post-release development version

After the release is complete, run `/bump-dev` to prepare the next development
version. This creates a PR to `main` with the `-dev` suffix added to both
version fields in `package.json`.

Choose the next version deliberately: `X.Y.(Z+1)-dev` is appropriate when the
next planned release is another patch; `X.(Y+1).0-dev` is appropriate when main
moves to the next minor. The release command does not make this commit and
nothing in this process pushes directly to `main`.
