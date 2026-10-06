# E2E tests

Playwright tests either the plugin installed on the selected OpenShift cluster or the plugin in this checkout. Install dependencies with `yarn install` and Chromium with `npx playwright install chromium`.

## Test an installed console plugin or RC

Select the same cluster in `oc` and `kubectl`. The runner prompts for Console credentials, applies fixtures if needed, and leaves them in place.

```bash
yarn test:e2e:installed
yarn test:e2e:installed e2e/tests/overview.spec.ts
yarn test:e2e:installed --grep @smoke
E2E_USE_EXISTING_CLUSTER=true yarn test:e2e:teardown
```

## Test the plugin in this checkout

```bash
yarn test:e2e:setup
yarn start # separate terminal
yarn test:e2e
yarn test:e2e:teardown
```

Setup uses oinc by default. To use an existing cluster, export `E2E_USE_EXISTING_CLUSTER=true` and start `yarn start-console` in another terminal.
