# Release E2E Tests

These scripts run the Playwright E2E suite against a Kuadrant / RHCL release already
installed on an OCP cluster.

## Prerequisites

- Network access to the target cluster; VPN access is only needed for clusters
  that are private
- Permission / credentials to access the target OpenShift cluster
- `oc`, `kubectl`, Node, Yarn, and Playwright dependencies installed
- An OCP cluster with the release candidate deployed

On Apple Silicon Macs, make sure `oc` and `kubectl` are ARM-compatible binaries.
For Homebrew installations, the binaries should normally come from
`/opt/homebrew/bin`:

```bash
file "$(which oc)"
file "$(which kubectl)"
```

The output should include `arm64`. An `x86_64` binary can fail with
`Bad CPU type in executable`.

## Run locally

From the repository root:

```bash
bash e2e/release/run-release-local.sh smoke
```

The script asks for the OCP API URL when it is not provided. You can also pass
the URL as the second argument:

```bash
bash e2e/release/run-release-local.sh smoke https://api.example.openshift.com:6443
```

For repeated runs, set `OCP_API_URL` instead:

```bash
OCP_API_URL=https://api.example.openshift.com:6443 \
  bash e2e/release/run-release-local.sh smoke
```

Use `full` instead of `smoke` to run the complete suite.

To run one spec file, pass its path as the third argument. Use `full` to run
all tags in that file:

```bash
bash e2e/release/run-release-local.sh full \
  https://api.example.openshift.com:6443 \
  apikey-lifecycle.spec.ts
```

Use `smoke` instead of `full` when you only want the `@smoke` tests from that
file.

The script prompts for the OpenShift cluster username and password, checks the cluster
version and ConsolePlugin deployment, applies release test fixtures, runs the
tests, and removes the fixtures afterwards.

The API endpoint and Console route must be reachable from your machine. VPN access is
only needed for private clusters; it is not required by the script itself.

MCP tests and fixtures are skipped automatically on OCP 4.x. They are included
on OCP 5.x when the required MCP components are available.

## Contributor note

Contributors may not be able to run this workflow because they may not have
network access or OpenShift cluster credentials. A VPN is only needed when the
target cluster is private. Use the normal local OINC E2E workflow in
[`e2e/README.md`](../README.md) for day-to-day development and contribution
testing.
