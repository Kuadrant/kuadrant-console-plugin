# Versioning and OpenShift compatibility

OpenShift Console provides React, React Router, `react-i18next`, Redux,
PatternFly Topology and the SDK to dynamic plugins as Module Federation
singletons. These modules use `allowFallback: false`; the plugin cannot ship a
second copy.

The versions in `package.json` provide TypeScript types and federation version
requirements at build time. `ConsoleRemotePlugin` derives `requiredVersion`
from the SDK's `peerDependencies`. SDK 4.22.0 was the first release to declare
the shared modules as peers.

OCP 4.22 moved React from 17 to 18 and React Router from 5 to 7. A 4.22 plugin
build fails on a 4.21 console because it receives the older singletons. We keep
separate branches for the two console generations.

## Loading checks

| Setting                                            | Effect                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| `consolePlugin.dependencies["@console/pluginAPI"]` | Hard gate. The console rejects a plugin outside this range.               |
| Federation `requiredVersion`                       | Logs a warning on mismatch, then loads the host singleton.                |
| `consolePlugin.latestSupportedOpenshiftVersion`    | Metadata written to the ConsolePlugin resource. It does not gate loading. |

## Console runtimes

The values below come from the matching SDK package manifests.

| OCP        | SDK                   | React | React Router            | PF Topology | react-i18next |
| ---------- | --------------------- | ----- | ----------------------- | ----------- | ------------- |
| 4.17       | `1.6.0`               | 17    | 5.3.x                   | 5.3.0       | 11.x          |
| 4.18       | `4.18.0`              | 17    | 5.3.x (+ v5-compat 6.x) | 5.3.0       | 11.x          |
| 4.19       | `4.19.1`              | 17    | 5.3.x (+ v5-compat 6.x) | 6.2.x       | 11.x          |
| 4.20       | `4.20.0`              | 17    | 5.3.x (+ v5-compat 6.x) | 6.2.x       | 11.x          |
| 4.21       | `4.21.0`              | 17    | 5.3.x (+ v5-compat 6.x) | 6.2.x       | 11.x          |
| 4.22       | `4.22.0`              | 18    | 7.13.x                  | 6.4.x       | 16.5.x        |
| 4.23 / 5.0 | `4.23.0-prerelease.5` | 18    | 7.18.x                  | 6.6.x       | 16.5.x        |

`react-router-dom-v5-compat` is still shared by the 4.23 and 5.0 console
branches, but is deprecated. Support ends when the console removes that share
name.

## Plugin streams

| Stream  | OCP              | Branch        | Release  | Image tags                                              | `pluginAPI`  | `latestSupportedOpenshiftVersion` |
| ------- | ---------------- | ------------- | -------- | ------------------------------------------------------- | ------------ | --------------------------------- |
| Current | 4.22+            | `main`        | none yet | `latest`, `<git sha>`                                   | `>=4.22.0-0` | `4.22`                            |
| Legacy  | 4.21 and earlier | `release-0.x` | `v0.6.0` | `v0.6.0`, `release-0.x-latest`, `release-0.x-<git sha>` | `*`          | `4.21`                            |

`main` builds against React Router 7.13.x, matching OCP 4.22.
