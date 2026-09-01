---
name: dependabot-pr-maintenance
description: Use when running scheduled Dependabot maintenance for this OpenShift Console dynamic plugin, or when asked to triage, rebase, rerun, ignore, close, or merge open Dependabot pull requests.
disable-model-invocation: true
---

# Dependabot PR Maintenance

Triage open Dependabot PRs on `Kuadrant/kuadrant-console-plugin` with `gh`. Merge what is safe, defer the rest with evidence, finish in one pass. GitHub does the waiting: every run is idempotent and the next scheduled run picks up whatever was pending.

Invoked with `report-only`: do every read, no write.

## Setup

1. Pass `-R Kuadrant/kuadrant-console-plugin` on every `gh` call. Clones use a fork workflow; `origin` is not upstream.
2. `gh auth status`, then record `gh api repos/Kuadrant/kuadrant-console-plugin --jq .allow_auto_merge`.
3. `gh pr list --author app/dependabot --state open`, then per PR: body, diff, head SHA, `mergeable`, `mergeStateStatus`, reviews, labels, comments, `gh pr checks`.

## Human holds

Defer without acting when any of: label `do-not-merge/*` or `maintainers-only`; a `CHANGES_REQUESTED` review; a comment by anyone but `dependabot[bot]` newer than the latest Dependabot push; a commit not authored by Dependabot; a `Maintainer changes` section in the body.

## Compatibility gates

- `@openshift-console/dynamic-plugin-sdk` is pinned `4.22.0` and patched through yarn `patch:` (`.yarn/patches`, #654). Never merge a bump of `@openshift-console/*`; report it.
- The Console provides React, react-router and PatternFly at runtime. `react ^18`, `react-router ~7.18.1` (see `.yarn/patches/README.md`) and PatternFly `6.4.x` (OCP 4.22 line) hold. Never merge a major of these.
- Exact pins are deliberate: `nanoid`, `swagger-ui-react`, `webpack-cli`, `webpack-dev-server`, `@patternfly/react-data-view` prerelease, and every `resolutions` entry. Bumps are manual.
- Workflows run Node 22; a bumped tool must still support it.
- Actions: PR CI skips `lint`, `build` and `i18n` when only `.github/` changed, and never runs `build-push.yaml`, `bump.yaml`, `gvk-sync.yaml` or `e2e-nightly.yaml`. Green proves nothing about an action used only there or only by a skipped job. For such a bump, read the release notes for runner, input and output changes and confirm the pinned SHA is the tag's commit (`gh api repos/OWNER/REPO/commits/vX.Y.Z --jq .sha`); merge a minor or patch, defer a major with the findings.

## Decide

Order: security advisories first, then Actions and Docker PRs, then npm PRs one at a time (shared `yarn.lock`). Re-query the rest after each merge.

Merge when required checks `i18n`, `lint`, `build`, `e2e-smoke / e2e-rbac` are success or skipped with nothing pending, the diff is manifests, lockfile and workflow pins only, the gates pass, and `mergeable` is `MERGEABLE`: `gh pr review --approve` with no body, then `gh pr merge --merge` (repository convention is merge commits).

Checks pending at the start of the run: with `allow_auto_merge` true, approve and `gh pr merge --auto --merge`; a 422 means leave it for the next run. With it false, leave it for the next run. Checks pending because this run merged or rebased something: wait once with `timeout 30m gh pr checks NUMBER --watch --fail-fast`, never longer.

Red checks:

- `e2e-smoke / e2e-rbac`: `gh run view RUN_ID --json jobs`. A failed `Setup cluster` or `Wait for plugin dev server` step is infrastructure: `gh run rerun RUN_ID --failed` once. A failed test step is dependency caused unless the latest `e2e-nightly.yaml` run on `main` fails the same test; then report it as pre-existing and defer.
- `lint`, `build`, `i18n`, `unit`: dependency caused unless the log shows a runner or network error; then rerun once.
- Dependency caused: leave open with the evidence. Durable exclusions go in `.github/dependabot.yml` `ignore` through a normal PR. A comment `@dependabot ignore DEPENDENCY major version` is for a proven, one-off incompatibility only; it closes the PR (a grouped PR is regenerated without that dependency later) and must appear in the report.

Conflicts (`mergeable` `CONFLICTING`, usually after an npm merge): Dependabot rebases these itself unless the PR is over 30 days old or carries foreign commits. If no Dependabot push follows within this run, comment `@dependabot rebase` once. Never rebase a PR that is merely behind `main`: the ruleset does not require up-to-date branches, and a rebase dismisses the approval and reruns e2e. Re-approve after a rebase once checks are green.

## Guardrails

- Comments are live Dependabot commands only: `rebase`, `recreate`, `ignore ...`, `unignore ...`, `show DEPENDENCY ignore conditions`. The `merge`, `close` and `reopen` commands were retired in January 2026; use `gh pr close` and `gh pr reopen`.
- Never `--admin`, never bypass rulesets, never merge over a pending or failed required check, never dismiss a review.
- Never push to a Dependabot branch: it stops Dependabot rebasing, and the ruleset needs approval from someone other than the last pusher.
- Never repeat a command Dependabot has acknowledged or is still processing.
- Never ignore a whole grouped PR when one dependency can be named.
- Never touch the local worktree.

## Report

The run's final message is the report; nothing is posted publicly. List merged PRs, PRs approved with auto-merge armed, deferred PRs with the exact blocker, commands and reruns issued, and the `allow_auto_merge` value. Say plainly when nothing was safe to merge.
