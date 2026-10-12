# Versioning and OpenShift compatibility

OpenShift Console provides React, React Router, `react-i18next`, Redux,
PatternFly Topology and the SDK to dynamic plugins as Module Federation
singletons. These modules use `allowFallback: false`; the plugin cannot ship a
second copy.

The versions in `package.json` provide TypeScript types and federation version
requirements at build time. `ConsoleRemotePlugin` derives `requiredVersion`
from the SDK's `peerDependencies`. SDK 4.22.0 was the first release to declare
the shared modules as peers.

## Introduction and migration requirements

The host console's dependency upgrades, the operator's image choices and the
plugin's enforced requirements are separate decisions:

- OCP 4.22 introduced React 18 and React Router 7 in the host console.
- The plugin adopted that stack in [#721](https://github.com/Kuadrant/kuadrant-console-plugin/pull/721),
  released as v0.7.0. That build explicitly requires
  `@console/pluginAPI >=4.22.0-0`, so consoles below 4.22 reject it.
- The [earlier plugin was tested successfully on 4.22](https://github.com/Kuadrant/kuadrant-console-plugin/issues/333#issuecomment-4978807617)
  using the router compatibility alias. Introducing the new host runtime did
  not immediately make that build unusable.

## Loading checks

| Setting                                            | Effect                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| `consolePlugin.dependencies["@console/pluginAPI"]` | Hard gate. The console rejects a plugin outside this range.               |
| Federation `requiredVersion`                       | Logs a warning on mismatch, then loads the host singleton.                |
| `consolePlugin.latestSupportedOpenshiftVersion`    | Metadata written to the ConsolePlugin resource. It does not gate loading. |

## Console runtimes

The values below summarise the matching published SDK package manifests.
The console's [4.20](https://github.com/openshift/console/blob/release-4.20/frontend/package.json)
and [4.21](https://github.com/openshift/console/blob/release-4.21/frontend/package.json)
branches declare React `^17.0.1`; [4.22](https://github.com/openshift/console/blob/release-4.22/frontend/package.json)
declares `^18.3.1`. Red Hat's [4.22 migration guide](https://developers.redhat.com/articles/2026/07/14/red-hat-openshift-4-22-what-dynamic-plugin-developers-need-know)
confirms the React 17 to 18 and React Router 5 to 7 transitions.

| OCP           | SDK                   | React | React Router            | PF Topology | react-i18next |
| ------------- | --------------------- | ----- | ----------------------- | ----------- | ------------- |
| 4.19          | `4.19.1`              | 17    | 5.3.x (+ v5-compat 6.x) | 6.2.x       | 11.x          |
| 4.20          | `4.20.0`              | 17    | 5.3.x (+ v5-compat 6.x) | 6.2.x       | 11.x          |
| 4.21          | `4.21.0`              | 17    | 5.3.x (+ v5-compat 6.x) | 6.2.x       | 11.x          |
| 4.22          | `4.22.0`              | 18    | 7.13.x                  | 6.4.x       | 16.5.x        |
| 4.23 (future) | `4.23.0-prerelease.5` | 18    | 7.18.x                  | 6.6.x       | 16.5.x        |
| 5.0 (future)  | `4.23.0-prerelease.5` | 18    | 7.18.x                  | 6.6.x       | 16.5.x        |

The future rows describe the same upcoming console generation using a
prerelease SDK snapshot. The console's
[4.23](https://github.com/openshift/console/blob/release-4.23/frontend/package.json)
and [5.0](https://github.com/openshift/console/blob/release-5.0/frontend/package.json)
branches currently declare the same React, React Router and PatternFly
versions. Both target the v0.7.0 plugin stream; final OCP release validation
is still required.

The old `react-router-dom-v5-compat` import remains available as a deprecated
alias on 4.22, 4.23 and 5.0. Red Hat's migration guide documents the 4.22
alias, and the shared-module metadata on
[4.23](https://github.com/openshift/console/blob/release-4.23/frontend/packages/console-dynamic-plugin-sdk/src/shared-modules/shared-modules-meta.ts)
and [5.0](https://github.com/openshift/console/blob/release-5.0/frontend/packages/console-dynamic-plugin-sdk/src/shared-modules/shared-modules-meta.ts)
retains it. Deprecation alone does not establish a mandatory 4.23/5.0
migration deadline for those imports. Removing the aliases would break
plugins still using them. Their availability also does not make the React 18
build compatible with older consoles.

## Plugin streams

| Stream                  | OCP                                  | Release branch | Release  | `pluginAPI`  |
| ----------------------- | ------------------------------------ | -------------- | -------- | ------------ |
| React 18                | 4.22; 4.23 and 5.0 as future targets | `release-0.7`  | `v0.7.0` | `>=4.22.0-0` |
| React 17 / PatternFly 6 | 4.20–4.21                            | `release-0.6`  | `v0.6.0` | `*`          |

This follows the operator's [version-based image selection](https://github.com/Kuadrant/kuadrant-operator/pull/2183).

Although `v0.6.0` declares `latestSupportedOpenshiftVersion: "4.19"`, it
supports 4.20–4.21; that field does not gate loading. The `release-0.6`
branch corrects the metadata to 4.21.

`main` develops the next release and publishes `latest`. Its local React
Router dependency is 7.18.x, while the running router comes from the host
console. The SDK peer-range patch accepts `>=7.13.1 <8.0.0`, retaining
compatibility with the 4.22 host's 7.13.x router.

## Operator image environment variables

The operator reads the cluster's OpenShift version and selects one of the
image references configured on its Deployment. The README's
[environment variable matrix](../README.md#operator-image-environment-variables)
lists the variables for the release streams above, using the
[operator v1.6.0-rc1 bundle](https://github.com/Kuadrant/kuadrant-operator/blob/v1.6.0-rc1/bundle/manifests/kuadrant-operator.clusterserviceversion.yaml).
This is upstream image selection; RHCL's product support matrix defines its
supported OCP versions separately.

The variable suffixes name compatibility tiers:

- `RELATED_IMAGE_CONSOLE_PLUGIN_LATEST`: the React 18 / SDK 4.22 tier for
  OCP 4.22+, including the future 4.23/5.0 targets. Pin this to the appropriate
  release tag or digest; the moving `:latest` image is for development.
- `RELATED_IMAGE_CONSOLE_PLUGIN_SDK1`: the SDK 1.x / React 17 / PatternFly 6
  build for OCP 4.20–4.21.

For RHCL releases, use the corresponding downstream build's image digest
in each variable. Include the same image references in the bundle's
`relatedImages` so disconnected installations can mirror the release images.

## Deployment manifests

`install.yaml` on `main` uses the development Go-server image for OCP 4.22+.
For a stable install, use the manifest from the same release tag as the
image: [v0.6.0](https://github.com/Kuadrant/kuadrant-console-plugin/blob/v0.6.0/install.yaml)
or [v0.7.0](https://github.com/Kuadrant/kuadrant-console-plugin/blob/v0.7.0/install.yaml),
according to the [version matrix](../README.md#version-matrix).

These tagged manifests still reference `quay.io/kuadrant/console-plugin:latest`.
Before applying one, replace that image with its matching release tag or
digest, such as `quay.io/kuadrant/console-plugin:v0.6.0` for the v0.6.0 manifest.

The nginx-based v0.6.0 image needs its nginx ConfigMap mounted to serve HTTPS
on port 9443. The v0.7.0 Go server uses the serving certificate
through `TLS_CERTIFICATE_FILE` and `TLS_KEY_FILE`. Match the deployment
configuration to the selected image when installing or upgrading.
