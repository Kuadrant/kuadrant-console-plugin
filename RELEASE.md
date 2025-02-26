# How to Release kuadrant-console-plugin

To release a version `vX.Y.Z` of the `kuadrant-console-plugin` on GitHub and Quay.io, follow these steps:

## 1. Select the Git Reference

Choose a `<git-ref>` (SHA-1) as the source for the release:

```shell
git checkout <git-ref>
```

## 2. Prepare the Release Commit

- Remove the `-dev` suffix from the `version` and `consolePlugin.version` fields in `package.json`.
- Commit these changes to create a "floating" release commit.

You can either:
- Push this commit directly to `main`, or
- Open a pull request (recommended if time allows).

## 3. Tag the Release

- Create a new tag for the release:

```shell
git tag -a vX.Y.Z -m "vX.Y.Z" -s
git push upstream vX.Y.Z
```

## 4. Publish the Release on GitHub

- [Create a new GitHub release](https://github.com/Kuadrant/kuadrant-console-plugin/releases) from the tag you just pushed.
- Use auto-generated release notes.

This triggers the `Build and Push Versioned Multi-arch Image (Release)` [GitHub workflow](https://github.com/Kuadrant/kuadrant-console-plugin/blob/da4dc0582c442be725a534ff2790811d9cf7ecd7/.github/workflows/build.yaml#L51), which:
- Builds the `kuadrant-console-plugin` image.
- Pushes the versioned image to [Quay.io](https://quay.io/repository/kuadrant/console-plugin?tab=tags).

## 5. Bump to the Next Development Version

- Update `package.json`:
  - Add the `-dev` suffix to `version` and `consolePlugin.version` for the next development iteration.
- Create a PR to merge these changes into `main`.
