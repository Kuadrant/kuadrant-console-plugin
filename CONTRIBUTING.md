# Contributing

For general contribution guidelines, PR requirements, and issue triage rules, see the [Kuadrant contributing guide](https://github.com/Kuadrant/.github/blob/main/CONTRIBUTING.md).

## Issue Policy

**Do not start work on an issue unless it has been assigned to you by a maintainer.**

Issues go through a triage and planning process before they are ready for contribution. Working on unassigned issues — whether manually or via AI coding agents — wastes your time and ours.

**Pull requests submitted against unassigned issues will be automatically closed and will not be reopened.**

If you're interested in contributing to an issue, leave a comment and wait for a maintainer to assign it to you before starting any work.

## Contributions

We welcome code and non-code contributions to our project. Non-code contributions can come in the form of documentation updates, bug reports, enhancement requests, and feature requests.

### Finding Issues to Work On

The best place to start is to look through our issues for [bugs](https://github.com/Kuadrant/kuadrant-console-plugin/issues?q=is%3Aopen+is%3Aissue+label%3Akind%2Fbug), [good first issues](https://github.com/Kuadrant/kuadrant-console-plugin/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22), and [help wanted](https://github.com/Kuadrant/kuadrant-console-plugin/issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22). These are a great starting point for new contributors.

Remember: only work on issues that are `triage/accepted` and assigned to you.

### Bug Reporting

If you found a bug, please submit an [issue](https://github.com/Kuadrant/kuadrant-console-plugin/issues/new) describing the problem. Include:

- Steps to reproduce the bug
- The OpenShift/OKD version you are running
- Any relevant logs or screenshots

### Enhancement Requests

If you want an enhancement of a feature or workflow, submit an [issue](https://github.com/Kuadrant/kuadrant-console-plugin/issues/new) describing the enhancement. Include:

- What you are wanting to see improved
- The current behavior
- The new behavior you wish to see

### Feature Requests

If you want to see a new feature, file an [issue](https://github.com/Kuadrant/kuadrant-console-plugin/issues/new) detailing the new feature. Include:

- What you are trying to achieve with the new feature
- What you will need
- Any relevant documentation or information on the new feature

### Documentation

If there is documentation that is unclear or could use some improvements, please raise an issue or submit a pull request.

### Pull Requests

If you want to submit code changes to the project, here are some guidelines:

1. **Create a Branch**

   ```bash
   git checkout -b your-feature-branch
   ```

2. **Implement Your Changes**

   Make your code changes, ensuring that you follow the project's coding standards and best practices.

3. **Testing**

   Ensure your changes work correctly.

   - Test manually in the OpenShift Console
   - Test in both light and dark themes
   - Test in all-namespaces and single namespace mode

   For E2E tests (requires a running cluster and console):

   ```bash
   yarn test:e2e                   # run e2e tests
   ```

4. **Linting and Formatting**

   Ensure your code passes linting checks.

   ```bash
   yarn lint                       # check for linting errors
   yarn build                      # ensure production build succeeds
   ```

5. **i18n**

   All user-facing strings must use the `t()` translation hook. After adding or changing messages:

   ```bash
   yarn i18n                       # update locale files
   ```

   Commit any updated locale files with your changes.

6. **CSS Scoping**

   Prefix all CSS classes with `kuadrant-` to avoid conflicts with console styles. Do not use bare `.pf-*` or `.co-*` selectors or hex colors.

7. **Sign Your Commits**

   All commits must include a `Signed-off-by` line:

   ```bash
   git commit -s -m "feat: add new feature"
   ```

8. **Ensure CI Passes**

   Your contributions will need to pass the Continuous Integration (CI) tests for pull requests.

9. **Push to Your Fork**

   ```bash
   git push origin your-feature-branch
   ```

10. **Open a Pull Request**

    Go to the original repository and click on **New Pull Request**. Fill in the PR template with a clear description, the issue it fixes, and your test plan.

## Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat`: A new feature.
- `fix`: A bug fix.
- `docs`: Documentation changes.
- `style`: Code style changes (formatting, missing semi-colons, etc.).
- `refactor`: Code changes that neither fix a bug nor add a feature.
- `test`: Adding or correcting tests.
- `chore`: Changes to the build process or auxiliary tools.
