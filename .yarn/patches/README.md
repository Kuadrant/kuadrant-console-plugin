# Patches

## `@openshift-console-dynamic-plugin-sdk-npm-4.22.0-*.patch`

Widens the SDK's `react-router` peer range from `~7.13.1` to `>=7.13.1 <8.0.0`.

SDK 4.22.0 peers react-router `~7.13.1`, which carries published advisories (see #654). We hold react-router `~7.18.1` as a devDependency for types. `ConsoleRemotePlugin` reads the SDK's peer range at build time and fails the build when our resolved version falls outside it:

```
Console provides shared module react-router ~7.13.1 but plugin uses version 7.18.2
[webpack-cli] Error: Validation failed
```

The range also becomes the Module Federation `requiredVersion` for the shared singleton. The widened range accepts any 7.x host router, so it covers both OCP 4.22 consoles (7.13.x) and post-openshift/console#16726 consoles (7.18.x).

The plugin bundles no react-router: it is a federation singleton with `allowFallback: false`, so the host console always provides the running copy.

### Removing this patch

Delete when an SDK release we depend on peers react-router `>=7.18.2` directly. `4.23.0-prerelease.5` peers `~7.18.1`; 4.23 GA is the likely candidate. Tracked in #654.
