import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import { TEST_NAMESPACE, dismissConsoleTour } from './helpers';

// unique suffix per call so parallel workers and repeated runs never collide
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function kubectl(args: string[], input?: string): string {
  return execFileSync('kubectl', args, {
    encoding: 'utf-8',
    ...(input !== undefined ? { input } : {}),
  }).trim();
}

function applyManifest(manifest: string): void {
  kubectl(['apply', '-f', '-'], manifest);
}

// Wait for the controller to write status before editing, otherwise its
// resourceVersion bump can race the form's watch and the Save PUT 409s.
function waitForAccepted(kind: string, name: string, namespace: string): void {
  kubectl(['wait', kind, name, '-n', namespace, '--for=condition=Accepted=true', '--timeout=15s']);
}

function resourceExists(kind: string, name: string, namespace: string): boolean {
  return kubectl(['get', kind, name, '-n', namespace, '--ignore-not-found', '-o', 'name']) !== '';
}

function deleteNamespace(namespace: string): void {
  if (namespace) {
    try {
      kubectl(['delete', 'namespace', namespace, '--ignore-not-found', '--wait=false']);
    } catch (error) {
      // cleanup failure must not fail the test from afterEach
      console.error(`Failed to delete namespace ${namespace}:`, error);
    }
  }
}

const gatewayManifest = (name: string, namespace: string) => `
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: ${name}
  namespace: ${namespace}
spec:
  gatewayClassName: istio
  listeners:
  - name: http
    port: 80
    protocol: HTTP
    allowedRoutes:
      namespaces:
        from: Same
`;

const httprouteManifest = (name: string, namespace: string) => `
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: ${name}
  namespace: ${namespace}
spec:
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /
`;

const grpcrouteManifest = (name: string, namespace: string) => `
apiVersion: gateway.networking.k8s.io/v1
kind: GRPCRoute
metadata:
  name: ${name}
  namespace: ${namespace}
spec:
  rules:
  - matches:
    - method:
        service: echo.EchoService
`;

// full page navigation so the console derives the active namespace from the
// URL (pushState does not update the console's namespace state)
async function gotoPage(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('domcontentloaded');
  await dismissConsoleTour(page);
}

const createPagePath = (namespace: string, gvk: string) => `/k8s/ns/${namespace}/${gvk}/~new`;

// <ResourceYAMLEditor> is a Monaco editor, so it can't be filled like a plain input.
// Set its content through Monaco's model API, which triggers onChange like real typing.
async function setEditorValue(page: Page, yaml: string): Promise<void> {
  await page.waitForFunction(
    () => {
      const monaco = (
        window as unknown as { monaco?: { editor?: { getModels?: () => unknown[] } } }
      ).monaco;
      return (monaco?.editor?.getModels?.()?.length ?? 0) > 0;
    },
    { timeout: 20_000 },
  );
  await page.evaluate((value) => {
    const monaco = (
      window as unknown as {
        monaco?: { editor?: { getModels?: () => { setValue(v: string): void }[] } };
      }
    ).monaco;
    monaco?.editor?.getModels?.()[0]?.setValue(value);
  }, yaml);
  await page.waitForTimeout(500);
}

test.describe('DNSPolicy form', () => {
  test('create form renders with required fields', { tag: '@smoke' }, async ({ page }) => {
    await gotoPage(page, createPagePath(TEST_NAMESPACE, 'kuadrant.io~v1~DNSPolicy'));

    await expect(page.getByRole('heading', { name: 'Create DNS Policy' })).toBeVisible({
      timeout: 15_000,
    });

    // Form tab should be selected by default
    await expect(page.getByRole('tab', { name: 'Form' })).toHaveAttribute('aria-selected', 'true');

    await expect(page.locator('#policy-name')).toBeVisible();
    await expect(page.locator('#gateway-select')).toBeVisible();
    await expect(page.locator('#provider-ref')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test(
    'create button enables only when required fields are set',
    { tag: '@smoke' },
    async ({ page }) => {
      await gotoPage(page, createPagePath(TEST_NAMESPACE, 'kuadrant.io~v1~DNSPolicy'));

      const createButton = page.getByRole('button', { name: 'Create', exact: true });
      await expect(createButton).toBeDisabled();

      await page.locator('#policy-name').fill(`e2e-dns-${uid()}`);
      await expect(createButton).toBeDisabled();

      // fixture gateway from e2e/manifests/test-resources.yaml (read-only use)
      const gatewayOption = page.locator(
        `#gateway-select option[value="${TEST_NAMESPACE}/test-gateway"]`,
      );
      await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
      await page.locator('#gateway-select').selectOption(`${TEST_NAMESPACE}/test-gateway`);
      await expect(createButton).toBeDisabled();

      await page.locator('#provider-ref').fill('e2e-provider-secret');
      await expect(createButton).toBeEnabled();

      // clearing a required field disables it again
      await page.locator('#policy-name').fill('');
      await expect(createButton).toBeDisabled();
    },
  );

  test.describe('with seeded namespace', () => {
    let namespace = '';
    let gateway = '';

    test.beforeEach(async () => {
      namespace = `e2e-dnsp-${uid()}`;
      gateway = `e2e-gw-${uid()}`;
      kubectl(['create', 'namespace', namespace]);
      applyManifest(gatewayManifest(gateway, namespace));
    });

    test.afterEach(async () => {
      deleteNamespace(namespace);
    });

    test('creates a DNSPolicy via the form', { tag: '@smoke' }, async ({ page }) => {
      const policyName = `e2e-dns-${uid()}`;
      await gotoPage(page, createPagePath(namespace, 'kuadrant.io~v1~DNSPolicy'));

      await expect(page.getByRole('heading', { name: 'Create DNS Policy' })).toBeVisible({
        timeout: 15_000,
      });

      await page.locator('#policy-name').fill(policyName);

      const gatewayOption = page.locator(`#gateway-select option[value="${namespace}/${gateway}"]`);
      await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
      await page.locator('#gateway-select').selectOption(`${namespace}/${gateway}`);

      await page.locator('#provider-ref').fill('e2e-provider-secret');

      const createButton = page.getByRole('button', { name: 'Create', exact: true });
      await expect(createButton).toBeEnabled();
      await createButton.click();

      // successful creation redirects to the DNS tab of the policies page
      await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/dns`), {
        timeout: 15_000,
      });

      expect(resourceExists('dnspolicy', policyName, namespace)).toBe(true);

      // created policy appears in the list
      await expect(page.locator(`a[data-test="${policyName}"]`)).toBeVisible({
        timeout: 15_000,
      });
    });

    test(
      'edits an existing DNSPolicy (name immutable, provider ref persisted)',
      { tag: '@smoke' },
      async ({ page }) => {
        const policyName = `e2e-dns-${uid()}`;
        applyManifest(`
apiVersion: kuadrant.io/v1
kind: DNSPolicy
metadata:
  name: ${policyName}
  namespace: ${namespace}
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: Gateway
    name: ${gateway}
  providerRefs:
  - name: e2e-provider-a
`);
        waitForAccepted('dnspolicy', policyName, namespace);

        await gotoPage(page, `/k8s/ns/${namespace}/dnspolicy/name/${policyName}/edit`);

        await expect(page.getByRole('heading', { name: 'Edit DNS Policy' })).toBeVisible({
          timeout: 15_000,
        });

        // form prefilled from the existing resource; name is immutable
        const nameInput = page.locator('#policy-name');
        await expect(nameInput).toHaveValue(policyName, { timeout: 15_000 });
        await expect(nameInput).toBeDisabled();
        await expect(page.locator('#gateway-select')).toHaveValue(`${namespace}/${gateway}`);
        await expect(page.locator('#provider-ref')).toHaveValue('e2e-provider-a');

        await page.locator('#provider-ref').fill('e2e-provider-b');

        const saveButton = page.getByRole('button', { name: 'Save', exact: true });
        await expect(saveButton).toBeEnabled();
        await saveButton.click();

        await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/dns`), {
          timeout: 15_000,
        });

        expect(
          kubectl([
            'get',
            'dnspolicy',
            policyName,
            '-n',
            namespace,
            '-o',
            'jsonpath={.spec.providerRefs[0].name}',
          ]),
        ).toBe('e2e-provider-b');
      },
    );
  });
});

test.describe('TLSPolicy form', () => {
  test('create form renders with required fields', { tag: '@smoke' }, async ({ page }) => {
    await gotoPage(page, createPagePath(TEST_NAMESPACE, 'kuadrant.io~v1~TLSPolicy'));

    await expect(page.getByRole('heading', { name: 'Create TLS Policy' })).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.locator('#simple-form-policy-name-01')).toBeVisible();
    await expect(page.locator('#gateway-select')).toBeVisible();

    // cluster issuer is the default issuer type
    await expect(page.locator('#cluster-issuer')).toBeChecked();
    await expect(page.locator('#clusterissuer-select')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test(
    'create button enables only when required fields are set',
    { tag: '@smoke' },
    async ({ page }) => {
      await gotoPage(page, createPagePath(TEST_NAMESPACE, 'kuadrant.io~v1~TLSPolicy'));

      const createButton = page.getByRole('button', { name: 'Create', exact: true });
      await expect(createButton).toBeDisabled();

      await page.locator('#simple-form-policy-name-01').fill(`e2e-tls-${uid()}`);
      await expect(createButton).toBeDisabled();

      const gatewayOption = page.locator(
        `#gateway-select option[value="${TEST_NAMESPACE}/test-gateway"]`,
      );
      await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
      await page.locator('#gateway-select').selectOption(`${TEST_NAMESPACE}/test-gateway`);
      await expect(createButton).toBeDisabled();

      // fixture ClusterIssuer from e2e/manifests/test-resources.yaml (read-only use)
      const issuerOption = page.locator('#clusterissuer-select option[value="test-selfsigned"]');
      await expect(issuerOption).toBeAttached({ timeout: 15_000 });
      await page.locator('#clusterissuer-select').selectOption('test-selfsigned');
      await expect(createButton).toBeEnabled();
    },
  );

  test.describe('with seeded namespace', () => {
    let namespace = '';
    let gateway = '';

    test.beforeEach(async () => {
      namespace = `e2e-tlsp-${uid()}`;
      gateway = `e2e-gw-${uid()}`;
      kubectl(['create', 'namespace', namespace]);
      applyManifest(gatewayManifest(gateway, namespace));
    });

    test.afterEach(async () => {
      deleteNamespace(namespace);
    });

    test('creates a TLSPolicy via the form', { tag: '@smoke' }, async ({ page }) => {
      const policyName = `e2e-tls-${uid()}`;
      await gotoPage(page, createPagePath(namespace, 'kuadrant.io~v1~TLSPolicy'));

      await expect(page.getByRole('heading', { name: 'Create TLS Policy' })).toBeVisible({
        timeout: 15_000,
      });

      await page.locator('#simple-form-policy-name-01').fill(policyName);

      const gatewayOption = page.locator(`#gateway-select option[value="${namespace}/${gateway}"]`);
      await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
      await page.locator('#gateway-select').selectOption(`${namespace}/${gateway}`);

      const issuerOption = page.locator('#clusterissuer-select option[value="test-selfsigned"]');
      await expect(issuerOption).toBeAttached({ timeout: 15_000 });
      await page.locator('#clusterissuer-select').selectOption('test-selfsigned');

      const createButton = page.getByRole('button', { name: 'Create', exact: true });
      await expect(createButton).toBeEnabled();
      await createButton.click();

      await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/tls`), {
        timeout: 15_000,
      });

      expect(resourceExists('tlspolicy', policyName, namespace)).toBe(true);
      expect(
        kubectl([
          'get',
          'tlspolicy',
          policyName,
          '-n',
          namespace,
          '-o',
          'jsonpath={.spec.issuerRef.name}',
        ]),
      ).toBe('test-selfsigned');
    });

    test(
      'edits an existing TLSPolicy (retarget gateway persisted)',
      { tag: '@smoke' },
      async ({ page }) => {
        const policyName = `e2e-tls-${uid()}`;
        const secondGateway = `e2e-gw-b-${uid()}`;
        applyManifest(gatewayManifest(secondGateway, namespace));
        applyManifest(`
apiVersion: kuadrant.io/v1
kind: TLSPolicy
metadata:
  name: ${policyName}
  namespace: ${namespace}
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: Gateway
    name: ${gateway}
  issuerRef:
    name: test-selfsigned
    kind: ClusterIssuer
`);
        waitForAccepted('tlspolicy', policyName, namespace);

        await gotoPage(page, `/k8s/ns/${namespace}/tlspolicy/name/${policyName}/edit`);

        await expect(page.getByRole('heading', { name: 'Edit TLS Policy' })).toBeVisible({
          timeout: 15_000,
        });

        const nameInput = page.locator('#simple-form-policy-name-01');
        await expect(nameInput).toHaveValue(policyName, { timeout: 15_000 });
        await expect(nameInput).toBeDisabled();
        await expect(page.locator('#gateway-select')).toHaveValue(`${namespace}/${gateway}`);

        const secondGatewayOption = page.locator(
          `#gateway-select option[value="${namespace}/${secondGateway}"]`,
        );
        await expect(secondGatewayOption).toBeAttached({ timeout: 15_000 });
        await page.locator('#gateway-select').selectOption(`${namespace}/${secondGateway}`);

        const saveButton = page.getByRole('button', { name: 'Save', exact: true });
        await expect(saveButton).toBeEnabled();
        await saveButton.click();

        await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/tls`), {
          timeout: 15_000,
        });

        expect(
          kubectl([
            'get',
            'tlspolicy',
            policyName,
            '-n',
            namespace,
            '-o',
            'jsonpath={.spec.targetRef.name}',
          ]),
        ).toBe(secondGateway);
      },
    );
  });
});

// AuthPolicy create page is YAML-editor only, prefilled with an example
// resource. Creating with the default YAML uses the example name, so each
// creation test runs in its own namespace for isolation.
test.describe('YAML-based policy create pages', () => {
  // wait for the monaco editor to render the given text
  async function expectEditorContains(page: Page, text: string): Promise<void> {
    await page.waitForSelector('.monaco-editor .view-lines', {
      state: 'visible',
      timeout: 15_000,
    });
    await page.waitForFunction(
      (expected) => {
        const lines = document.querySelector('.monaco-editor .view-lines');
        return (lines?.textContent || '').includes(expected);
      },
      text,
      { timeout: 15_000 },
    );
  }

  test(
    'AuthPolicy create page renders YAML editor with example resource',
    { tag: '@smoke' },
    async ({ page }) => {
      await gotoPage(page, createPagePath(TEST_NAMESPACE, 'kuadrant.io~v1~AuthPolicy'));

      await expect(page.locator('text=Create AuthPolicy').first()).toBeVisible({ timeout: 15_000 });
      await expectEditorContains(page, 'example-authpolicy');
      await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    },
  );

  test.describe('with seeded namespace', () => {
    let namespace = '';

    test.beforeEach(async () => {
      namespace = `e2e-yamlp-${uid()}`;
      kubectl(['create', 'namespace', namespace]);
    });

    test.afterEach(async () => {
      deleteNamespace(namespace);
    });

    test('creates an AuthPolicy from the default YAML', { tag: '@smoke' }, async ({ page }) => {
      await gotoPage(page, createPagePath(namespace, 'kuadrant.io~v1~AuthPolicy'));

      await expect(page.locator('text=Create AuthPolicy').first()).toBeVisible({
        timeout: 15_000,
      });
      // active namespace propagated from the URL into the example resource
      await expectEditorContains(page, namespace);

      await page.getByRole('button', { name: 'Create', exact: true }).click();

      await expect
        .poll(() => resourceExists('authpolicy', 'example-authpolicy', namespace), {
          timeout: 15_000,
        })
        .toBe(true);
    });
  });
});

test.describe('other policy create pages render', () => {
  test('OIDCPolicy create form renders', { tag: '@smoke' }, async ({ page }) => {
    await gotoPage(
      page,
      createPagePath(TEST_NAMESPACE, 'extensions.kuadrant.io~v1alpha1~OIDCPolicy'),
    );

    await expect(page.getByRole('heading', { name: 'Create OIDC Policy' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('#policy-name')).toBeVisible();
    await expect(page.locator('#client-id')).toBeVisible();
    await expect(page.locator('#issuer-url')).toBeVisible();
  });

  test(
    'PlanPolicy create form renders with required fields',
    { tag: '@smoke' },
    async ({ page }) => {
      await gotoPage(
        page,
        createPagePath(TEST_NAMESPACE, 'extensions.kuadrant.io~v1alpha1~PlanPolicy'),
      );

      await expect(page.getByRole('heading', { name: 'Create Plan Policy' })).toBeVisible({
        timeout: 15_000,
      });

      // Form tab should be selected by default
      await expect(page.getByRole('tab', { name: 'Form' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(page.locator('#policy-name')).toBeVisible();
      await expect(page.locator('#plan-tier-0')).toBeVisible();
      await expect(page.locator('#plan-predicate-0')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    },
  );

  test(
    'TokenRateLimitPolicy create form renders with required fields',
    { tag: '@smoke' },
    async ({ page }) => {
      await gotoPage(
        page,
        createPagePath(TEST_NAMESPACE, 'kuadrant.io~v1alpha1~TokenRateLimitPolicy'),
      );

      await expect(page.getByRole('heading', { name: 'Create TokenRateLimit Policy' })).toBeVisible(
        {
          timeout: 15_000,
        },
      );

      // Form tab should be selected by default
      await expect(page.getByRole('tab', { name: 'Form' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(page.locator('#policy-name')).toBeVisible();
      await expect(page.locator('#gateway-select')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    },
  );

  test(
    'TokenRateLimitPolicy create page renders YAML editor',
    { tag: '@smoke' },
    async ({ page }) => {
      await gotoPage(
        page,
        createPagePath(TEST_NAMESPACE, 'kuadrant.io~v1alpha1~TokenRateLimitPolicy'),
      );

      await expect(page.getByRole('heading', { name: 'Create TokenRateLimit Policy' })).toBeVisible(
        {
          timeout: 15_000,
        },
      );

      await page.getByRole('tab', { name: 'YAML' }).click();
      await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 15_000 });
    },
  );
});

test.describe('OIDCPolicy form', () => {
  test(
    'create button enables only when required fields are set',
    { tag: '@smoke' },
    async ({ page }) => {
      await gotoPage(
        page,
        createPagePath(TEST_NAMESPACE, 'extensions.kuadrant.io~v1alpha1~OIDCPolicy'),
      );

      const createButton = page.getByRole('button', { name: 'Create', exact: true });
      await expect(createButton).toBeDisabled();

      await page.locator('#policy-name').fill(`e2e-oidc-${uid()}`);
      await expect(createButton).toBeDisabled();

      const gatewayOption = page.locator(
        `#gateway-select option[value="${TEST_NAMESPACE}/test-gateway"]`,
      );
      await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
      await page.locator('#gateway-select').selectOption(`${TEST_NAMESPACE}/test-gateway`);
      await expect(createButton).toBeDisabled();

      await page.locator('#client-id').fill('my-client-id');
      await expect(createButton).toBeDisabled();

      await page.locator('#issuer-url').fill('https://auth.example.com');
      await expect(createButton).toBeEnabled();

      // clearing a required field disables it again — consistent with DNS/TLS tests
      await page.locator('#policy-name').fill('');
      await expect(createButton).toBeDisabled();
    },
  );

  test.describe('with seeded namespace', () => {
    let namespace = '';
    let gateway = '';
    let httproute = '';

    test.beforeEach(async () => {
      namespace = `e2e-oidcp-${uid()}`;
      gateway = `e2e-gw-${uid()}`;
      httproute = `e2e-route-${uid()}`;
      kubectl(['create', 'namespace', namespace]);
      applyManifest(gatewayManifest(gateway, namespace));
      applyManifest(httprouteManifest(httproute, namespace));
    });

    test.afterEach(async () => {
      deleteNamespace(namespace);
    });

    test(
      'switching Target Type clears the previously selected target',
      { tag: '@nightly' },
      async ({ page }) => {
        const foreignNamespace = `e2e-oidcp-foreign-${uid()}`;
        const foreignGateway = `e2e-gw-foreign-${uid()}`;
        kubectl(['create', 'namespace', foreignNamespace]);
        applyManifest(gatewayManifest(foreignGateway, foreignNamespace));

        try {
          await gotoPage(
            page,
            createPagePath(namespace, 'extensions.kuadrant.io~v1alpha1~OIDCPolicy'),
          );

          await page.locator('#policy-name').fill(`e2e-oidc-${uid()}`);
          await page.locator('#client-id').fill('my-client-id');
          await page.locator('#issuer-url').fill('https://auth.example.com');

          const gatewayOption = page.locator(
            `#gateway-select option[value="${namespace}/${gateway}"]`,
          );
          await expect(gatewayOption).toBeAttached({ timeout: 15_000 });

          // the Gateway selector is scoped to the policy's own namespace - a
          // Gateway from a foreign namespace must never be selectable, since
          // the targetRef has no namespace field and would silently attach
          // to a same-named (or nonexistent) Gateway in this namespace
          await expect(
            page.locator(`#gateway-select option[value="${foreignNamespace}/${foreignGateway}"]`),
          ).not.toBeAttached();

          await page.locator('#gateway-select').selectOption(`${namespace}/${gateway}`);

          const createButton = page.getByRole('button', { name: 'Create', exact: true });
          await expect(createButton).toBeEnabled();

          // switching kind must reset the previously selected name, not carry a
          // Gateway name over into an HTTPRoute targetRef
          await page.locator('#target-type-radio-httproute').click();
          await expect(page.locator('#gateway-select')).not.toBeVisible();
          await expect(page.locator('#httproute-select')).toBeVisible();
          await expect(createButton).toBeDisabled();

          await page.locator('#httproute-select').click();
          await page.getByRole('menuitem', { name: `${namespace}/${httproute}` }).click();
          await expect(createButton).toBeEnabled();
        } finally {
          deleteNamespace(foreignNamespace);
        }
      },
    );

    test(
      'creates an OIDCPolicy targeting an HTTPRoute via the form',
      { tag: '@smoke' },
      async ({ page }) => {
        const policyName = `e2e-oidc-${uid()}`;
        await gotoPage(
          page,
          createPagePath(namespace, 'extensions.kuadrant.io~v1alpha1~OIDCPolicy'),
        );

        await page.locator('#policy-name').fill(policyName);

        await page.locator('#target-type-radio-httproute').click();
        await page.locator('#httproute-select').click();
        await page.getByRole('menuitem', { name: `${namespace}/${httproute}` }).click();

        await page.locator('#client-id').fill('my-client-id');
        await page.locator('#issuer-url').fill('https://auth.example.com');

        const createButton = page.getByRole('button', { name: 'Create', exact: true });
        await expect(createButton).toBeEnabled();
        await createButton.click();

        await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/oidc`), {
          timeout: 15_000,
        });

        expect(
          kubectl([
            'get',
            'oidcpolicy',
            policyName,
            '-n',
            namespace,
            '-o',
            'jsonpath={.spec.targetRef.kind}/{.spec.targetRef.name}',
          ]),
        ).toBe(`HTTPRoute/${httproute}`);
      },
    );

    test(
      'YAML target hydrates the Form Target Type and selector',
      { tag: '@nightly' },
      async ({ page }) => {
        await gotoPage(
          page,
          createPagePath(namespace, 'extensions.kuadrant.io~v1alpha1~OIDCPolicy'),
        );

        await page.getByRole('tab', { name: 'YAML' }).click();
        await setEditorValue(
          page,
          `apiVersion: extensions.kuadrant.io/v1alpha1
kind: OIDCPolicy
metadata:
  name: yaml-hydrate-check
  namespace: ${namespace}
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: ${httproute}
  provider:
    clientID: my-client-id
    issuerURL: https://auth.example.com
`,
        );

        await page.getByRole('tab', { name: 'Form' }).click();

        await expect(page.locator('#target-type-radio-httproute')).toBeChecked();
        await expect(page.locator('#httproute-select')).toContainText(`${namespace}/${httproute}`);
        await expect(page.locator('#client-id')).toHaveValue('my-client-id');
      },
    );

    test('creates an OIDCPolicy via the form', { tag: '@smoke' }, async ({ page }) => {
      const policyName = `e2e-oidc-${uid()}`;
      await gotoPage(page, createPagePath(namespace, 'extensions.kuadrant.io~v1alpha1~OIDCPolicy'));

      await expect(page.getByRole('heading', { name: 'Create OIDC Policy' })).toBeVisible({
        timeout: 15_000,
      });

      await page.locator('#policy-name').fill(policyName);

      const gatewayOption = page.locator(`#gateway-select option[value="${namespace}/${gateway}"]`);
      await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
      await page.locator('#gateway-select').selectOption(`${namespace}/${gateway}`);

      await page.locator('#client-id').fill('my-client-id');
      await page.locator('#issuer-url').fill('https://auth.example.com');

      const createButton = page.getByRole('button', { name: 'Create', exact: true });
      await expect(createButton).toBeEnabled();
      await createButton.click();

      await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/oidc`), {
        timeout: 15_000,
      });

      expect(resourceExists('oidcpolicy', policyName, namespace)).toBe(true);

      await expect(page.locator(`a[data-test="${policyName}"]`)).toBeVisible({
        timeout: 15_000,
      });
    });

    test(
      'edits an existing OIDCPolicy (name immutable, clientID persisted)',
      { tag: '@smoke' },
      async ({ page }) => {
        const policyName = `e2e-oidc-${uid()}`;
        applyManifest(`
apiVersion: extensions.kuadrant.io/v1alpha1
kind: OIDCPolicy
metadata:
  name: ${policyName}
  namespace: ${namespace}
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: Gateway
    name: ${gateway}
  provider:
    clientID: original-client-id
    issuerURL: https://auth.example.com
`);
        waitForAccepted('oidcpolicy', policyName, namespace);

        await gotoPage(page, `/k8s/ns/${namespace}/oidcpolicy/name/${policyName}/edit`);

        await expect(page.getByRole('heading', { name: 'Edit OIDC Policy' })).toBeVisible({
          timeout: 15_000,
        });

        const nameInput = page.locator('#policy-name');
        await expect(nameInput).toHaveValue(policyName, { timeout: 15_000 });
        await expect(nameInput).toBeDisabled();
        await expect(page.locator('#gateway-select')).toHaveValue(`${namespace}/${gateway}`);
        await expect(page.locator('#client-id')).toHaveValue('original-client-id');
        await expect(page.locator('#issuer-url')).toHaveValue('https://auth.example.com');

        await page.locator('#client-id').fill('updated-client-id');

        const saveButton = page.getByRole('button', { name: 'Save', exact: true });
        await expect(saveButton).toBeEnabled();
        await saveButton.click();

        await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/oidc`), {
          timeout: 15_000,
        });

        expect(
          kubectl([
            'get',
            'oidcpolicy',
            policyName,
            '-n',
            namespace,
            '-o',
            'jsonpath={.spec.provider.clientID}',
          ]),
        ).toBe('updated-client-id');
      },
    );
  });
});

test.describe('TokenRateLimitPolicy form', () => {
  test(
    'create button enables only when required fields are set',
    { tag: '@smoke' },
    async ({ page }) => {
      await gotoPage(
        page,
        createPagePath(TEST_NAMESPACE, 'kuadrant.io~v1alpha1~TokenRateLimitPolicy'),
      );

      const createButton = page.getByRole('button', { name: 'Create', exact: true });
      await expect(createButton).toBeDisabled();

      await page.locator('#policy-name').fill(`e2e-trl-${uid()}`);
      await expect(createButton).toBeDisabled();

      const gatewayOption = page.locator(
        `#gateway-select option[value="${TEST_NAMESPACE}/test-gateway"]`,
      );
      await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
      await page.locator('#gateway-select').selectOption(`${TEST_NAMESPACE}/test-gateway`);
      await expect(createButton).toBeEnabled();

      await page.locator('#policy-name').fill('');
      await expect(createButton).toBeDisabled();
    },
  );

  test.describe('with seeded namespace', () => {
    let namespace = '';
    let gateway = '';
    let httproute = '';

    test.beforeEach(async () => {
      namespace = `e2e-trlp-${uid()}`;
      gateway = `e2e-gw-${uid()}`;
      httproute = `e2e-route-${uid()}`;
      kubectl(['create', 'namespace', namespace]);
      applyManifest(gatewayManifest(gateway, namespace));
      applyManifest(httprouteManifest(httproute, namespace));
    });

    test.afterEach(async () => {
      deleteNamespace(namespace);
    });

    test(
      'creates a TokenRateLimitPolicy targeting an HTTPRoute via the form',
      { tag: '@smoke' },
      async ({ page }) => {
        const policyName = `e2e-trl-${uid()}`;
        await gotoPage(
          page,
          createPagePath(namespace, 'kuadrant.io~v1alpha1~TokenRateLimitPolicy'),
        );

        await page.locator('#policy-name').fill(policyName);

        await page.locator('#target-type-radio-httproute').click();
        await page.locator('#httproute-select').click();
        await page.getByRole('menuitem', { name: `${namespace}/${httproute}` }).click();

        // CRD requires at least one spec.limits entry
        await page.getByRole('button', { name: 'Add Limit' }).click();
        await page.locator('#new-limit-name').fill('default');
        await page.locator('#new-limit-value').fill('100');
        await page.locator('#new-limit-window').fill('1m');
        await page.getByRole('button', { name: 'Add Rate' }).click();
        await page.getByRole('button', { name: 'Save Limit' }).click();

        const createButton = page.getByRole('button', { name: 'Create', exact: true });
        await expect(createButton).toBeEnabled();
        await createButton.click();

        await expect(page).toHaveURL(
          new RegExp(`/kuadrant/policies/ns/${namespace}/tokenratelimit`),
          { timeout: 15_000 },
        );

        expect(
          kubectl([
            'get',
            'tokenratelimitpolicy',
            policyName,
            '-n',
            namespace,
            '-o',
            'jsonpath={.spec.targetRef.kind}/{.spec.targetRef.name}',
          ]),
        ).toBe(`HTTPRoute/${httproute}`);
      },
    );

    test(
      'YAML with an unsupported target kind does not populate the Form target',
      { tag: '@nightly' },
      async ({ page }) => {
        await gotoPage(
          page,
          createPagePath(namespace, 'kuadrant.io~v1alpha1~TokenRateLimitPolicy'),
        );

        // establish a valid, Create-enabled target first so the later
        // disabled result is caused by the guard rejecting the YAML, not by
        // an untouched empty form that was never going to be valid anyway
        await page.locator('#policy-name').fill(`e2e-trl-${uid()}`);
        const gatewayOption = page.locator(
          `#gateway-select option[value="${namespace}/${gateway}"]`,
        );
        await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
        await page.locator('#gateway-select').selectOption(`${namespace}/${gateway}`);
        await page.getByRole('button', { name: 'Add Limit' }).click();
        await page.locator('#new-limit-name').fill('default');
        await page.locator('#new-limit-value').fill('100');
        await page.locator('#new-limit-window').fill('1m');
        await page.getByRole('button', { name: 'Add Rate' }).click();
        await page.getByRole('button', { name: 'Save Limit' }).click();

        const createButton = page.getByRole('button', { name: 'Create', exact: true });
        await expect(createButton).toBeEnabled();

        await page.getByRole('tab', { name: 'YAML' }).click();
        await setEditorValue(
          page,
          `apiVersion: kuadrant.io/v1alpha1
kind: TokenRateLimitPolicy
metadata:
  name: yaml-guard-check
  namespace: ${namespace}
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: GRPCRoute
    name: does-not-matter
  limits:
    yaml-limit:
      rates:
      - limit: 200
        window: 1m
`,
        );

        await page.getByRole('tab', { name: 'Form' }).click();

        // name and limits hydrated from the YAML, proving the onChange
        // callback actually fired for this edit...
        await expect(page.locator('#policy-name')).toHaveValue('yaml-guard-check');
        await expect(page.getByText('yaml-limit')).toBeVisible();
        // ...but the unsupported GRPCRoute target was rejected rather than
        // carried over, so Create stays disabled instead of persisting a
        // reference the CRD would reject
        await expect(page.locator('#gateway-select')).not.toHaveValue(`${namespace}/${gateway}`);
        await expect(createButton).toBeDisabled();
      },
    );

    test('creates a TokenRateLimitPolicy via the form', { tag: '@smoke' }, async ({ page }) => {
      const policyName = `e2e-trl-${uid()}`;
      await gotoPage(page, createPagePath(namespace, 'kuadrant.io~v1alpha1~TokenRateLimitPolicy'));

      await expect(page.getByRole('heading', { name: 'Create TokenRateLimit Policy' })).toBeVisible(
        { timeout: 15_000 },
      );

      await page.locator('#policy-name').fill(policyName);

      const gatewayOption = page.locator(`#gateway-select option[value="${namespace}/${gateway}"]`);
      await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
      await page.locator('#gateway-select').selectOption(`${namespace}/${gateway}`);

      // CRD requires at least one spec.limits entry
      await page.getByRole('button', { name: 'Add Limit' }).click();
      await page.locator('#new-limit-name').fill('default');
      await page.locator('#new-limit-value').fill('100');
      await page.locator('#new-limit-window').fill('1m');
      await page.getByRole('button', { name: 'Add Rate' }).click();
      await page.getByRole('button', { name: 'Save Limit' }).click();

      const createButton = page.getByRole('button', { name: 'Create', exact: true });
      await expect(createButton).toBeEnabled();
      await createButton.click();

      await expect(page).toHaveURL(
        new RegExp(`/kuadrant/policies/ns/${namespace}/tokenratelimit`),
        { timeout: 15_000 },
      );

      expect(resourceExists('tokenratelimitpolicy', policyName, namespace)).toBe(true);

      await expect(page.locator(`a[data-test="${policyName}"]`)).toBeVisible({
        timeout: 15_000,
      });
    });

    test(
      'edits an existing TokenRateLimitPolicy (name immutable)',
      { tag: '@smoke' },
      async ({ page }) => {
        const policyName = `e2e-trl-${uid()}`;
        applyManifest(`
apiVersion: kuadrant.io/v1alpha1
kind: TokenRateLimitPolicy
metadata:
  name: ${policyName}
  namespace: ${namespace}
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: Gateway
    name: ${gateway}
  limits:
    default:
      rates:
      - limit: 100
        window: 1m
`);
        waitForAccepted('tokenratelimitpolicy', policyName, namespace);

        await gotoPage(page, `/k8s/ns/${namespace}/tokenratelimitpolicy/name/${policyName}/edit`);

        await expect(page.getByRole('heading', { name: 'Edit TokenRateLimit Policy' })).toBeVisible(
          { timeout: 15_000 },
        );

        const nameInput = page.locator('#policy-name');
        await expect(nameInput).toHaveValue(policyName, { timeout: 15_000 });
        await expect(nameInput).toBeDisabled();
        await expect(page.locator('#gateway-select')).toHaveValue(`${namespace}/${gateway}`);

        // open the limit label and verify it loaded
        await expect(page.locator('text=default')).toBeVisible({ timeout: 10_000 });

        // remove existing limit and add updated one
        await page.getByRole('button', { name: 'Add Limit' }).click();
        await page.locator('#new-limit-name').fill('updated');
        await page.locator('#new-limit-value').fill('200');
        await page.locator('#new-limit-window').fill('1h');
        await page.getByRole('button', { name: 'Add Rate' }).click();
        await page.getByRole('button', { name: 'Save Limit' }).click();

        const saveButton = page.getByRole('button', { name: 'Save', exact: true });
        await expect(saveButton).toBeEnabled();
        await saveButton.click();

        await expect(page).toHaveURL(
          new RegExp(`/kuadrant/policies/ns/${namespace}/tokenratelimit`),
          { timeout: 15_000 },
        );

        expect(
          kubectl([
            'get',
            'tokenratelimitpolicy',
            policyName,
            '-n',
            namespace,
            '-o',
            'jsonpath={.spec.limits.updated.rates[0].limit}',
          ]),
        ).toBe('200');
      },
    );
  });
});

test.describe('RateLimitPolicy form', () => {
  test('create form renders with required fields', { tag: '@smoke' }, async ({ page }) => {
    await gotoPage(page, createPagePath(TEST_NAMESPACE, 'kuadrant.io~v1~RateLimitPolicy'));

    await expect(page.getByRole('heading', { name: 'Create RateLimit Policy' })).toBeVisible({
      timeout: 15_000,
    });

    // Form tab should be selected by default
    await expect(page.getByRole('tab', { name: 'Form' })).toHaveAttribute('aria-selected', 'true');

    await expect(page.locator('#policy-name')).toBeVisible();
    await expect(page.locator('#gateway-select')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test(
    'create button enables only when required fields are set',
    { tag: '@smoke' },
    async ({ page }) => {
      await gotoPage(page, createPagePath(TEST_NAMESPACE, 'kuadrant.io~v1~RateLimitPolicy'));

      const createButton = page.getByRole('button', { name: 'Create', exact: true });
      await expect(createButton).toBeDisabled();

      await page.locator('#policy-name').fill(`e2e-rlp-${uid()}`);
      await expect(createButton).toBeDisabled();

      const gatewayOption = page.locator(
        `#gateway-select option[value="${TEST_NAMESPACE}/test-gateway"]`,
      );
      await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
      await page.locator('#gateway-select').selectOption(`${TEST_NAMESPACE}/test-gateway`);
      await expect(createButton).toBeEnabled();

      await page.locator('#policy-name').fill('');
      await expect(createButton).toBeDisabled();
    },
  );

  test('RateLimitPolicy create page renders YAML editor', { tag: '@smoke' }, async ({ page }) => {
    await gotoPage(page, createPagePath(TEST_NAMESPACE, 'kuadrant.io~v1~RateLimitPolicy'));

    await expect(page.getByRole('heading', { name: 'Create RateLimit Policy' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('tab', { name: 'YAML' }).click();
    await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 15_000 });
  });

  test.describe('with seeded namespace', () => {
    let namespace = '';
    let gateway = '';

    test.beforeEach(async () => {
      namespace = `e2e-rlp-${uid()}`;
      gateway = `e2e-gw-${uid()}`;
      kubectl(['create', 'namespace', namespace]);
      applyManifest(gatewayManifest(gateway, namespace));
    });

    test.afterEach(async () => {
      deleteNamespace(namespace);
    });

    test('creates a RateLimitPolicy via the form', { tag: '@smoke' }, async ({ page }) => {
      const policyName = `e2e-rlp-${uid()}`;
      await gotoPage(page, createPagePath(namespace, 'kuadrant.io~v1~RateLimitPolicy'));

      await expect(page.getByRole('heading', { name: 'Create RateLimit Policy' })).toBeVisible({
        timeout: 15_000,
      });

      await page.locator('#policy-name').fill(policyName);

      const gatewayOption = page.locator(`#gateway-select option[value="${namespace}/${gateway}"]`);
      await expect(gatewayOption).toBeAttached({ timeout: 15_000 });
      await page.locator('#gateway-select').selectOption(`${namespace}/${gateway}`);

      await page.getByRole('button', { name: 'Add Limit' }).click();
      await page.locator('#new-limit-name').fill('default');
      await page.locator('#new-limit-value').fill('100');
      await page.locator('#new-limit-window').fill('1m');
      await page.getByRole('button', { name: 'Add Rate' }).click();
      await page.locator('#new-counter-expression').fill('auth.identity.username');
      await page.getByRole('button', { name: 'Add Counter' }).click();
      await page.locator('#new-when-predicate').fill('request.method == "GET"');
      await page.getByRole('button', { name: 'Add Condition' }).click();
      await page.getByRole('button', { name: 'Save Limit' }).click();

      const createButton = page.getByRole('button', { name: 'Create', exact: true });
      await expect(createButton).toBeEnabled();
      await createButton.click();

      await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/ratelimit`), {
        timeout: 15_000,
      });

      expect(resourceExists('ratelimitpolicy', policyName, namespace)).toBe(true);

      expect(
        kubectl([
          'get',
          'ratelimitpolicy',
          policyName,
          '-n',
          namespace,
          '-o',
          'jsonpath={.spec.limits.default.rates[0].limit}',
        ]),
      ).toBe('100');
      expect(
        kubectl([
          'get',
          'ratelimitpolicy',
          policyName,
          '-n',
          namespace,
          '-o',
          'jsonpath={.spec.limits.default.counters[0].expression}',
        ]),
      ).toBe('auth.identity.username');
      expect(
        kubectl([
          'get',
          'ratelimitpolicy',
          policyName,
          '-n',
          namespace,
          '-o',
          'jsonpath={.spec.limits.default.when[0].predicate}',
        ]),
      ).toBe('request.method == "GET"');

      await expect(page.locator(`a[data-test="${policyName}"]`)).toBeVisible({
        timeout: 15_000,
      });
    });

    test(
      'edits an existing RateLimitPolicy (name immutable)',
      { tag: '@smoke' },
      async ({ page }) => {
        const policyName = `e2e-rlp-${uid()}`;
        applyManifest(`
apiVersion: kuadrant.io/v1
kind: RateLimitPolicy
metadata:
  name: ${policyName}
  namespace: ${namespace}
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: Gateway
    name: ${gateway}
  limits:
    default:
      rates:
      - limit: 100
        window: 1m
`);

        await gotoPage(page, `/k8s/ns/${namespace}/ratelimitpolicy/name/${policyName}/edit`);

        await expect(page.getByRole('heading', { name: 'Edit RateLimit Policy' })).toBeVisible({
          timeout: 15_000,
        });

        const nameInput = page.locator('#policy-name');
        await expect(nameInput).toHaveValue(policyName, { timeout: 15_000 });
        await expect(nameInput).toBeDisabled();
        await expect(page.locator('#gateway-select')).toHaveValue(`${namespace}/${gateway}`);

        await expect(page.getByText('default', { exact: true })).toBeVisible({ timeout: 10_000 });

        await page.getByRole('button', { name: 'Add Limit' }).click();
        await page.locator('#new-limit-name').fill('updated');
        await page.locator('#new-limit-value').fill('200');
        await page.locator('#new-limit-window').fill('1h');
        await page.getByRole('button', { name: 'Add Rate' }).click();
        await page.getByRole('button', { name: 'Save Limit' }).click();

        const saveButton = page.getByRole('button', { name: 'Save', exact: true });
        await expect(saveButton).toBeEnabled();
        await saveButton.click();

        await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/ratelimit`), {
          timeout: 15_000,
        });

        expect(
          kubectl([
            'get',
            'ratelimitpolicy',
            policyName,
            '-n',
            namespace,
            '-o',
            'jsonpath={.spec.limits.updated.rates[0].limit}',
          ]),
        ).toBe('200');
      },
    );
  });
});

test.describe('PlanPolicy form', () => {
  test(
    'create button enables only when required fields are set',
    { tag: '@smoke' },
    async ({ page }) => {
      await gotoPage(
        page,
        createPagePath(TEST_NAMESPACE, 'extensions.kuadrant.io~v1alpha1~PlanPolicy'),
      );

      const createButton = page.getByRole('button', { name: 'Create', exact: true });
      await expect(createButton).toBeDisabled();

      await page.locator('#policy-name').fill(`e2e-plan-${uid()}`);
      await expect(createButton).toBeDisabled();

      await page.locator('#plan-tier-0').fill('gold');
      await expect(createButton).toBeDisabled();

      await page.locator('#plan-predicate-0').fill('auth.identity.tier == "gold"');
      await expect(createButton).toBeDisabled();

      await page.locator('#target-type-radio-httproute').click();
      await page.locator('#httproute-select').click();
      await page.getByRole('menuitem', { name: `${TEST_NAMESPACE}/test-route` }).click();
      await expect(createButton).toBeEnabled();

      await page.locator('#plan-tier-0').fill('');
      await expect(createButton).toBeDisabled();
    },
  );

  test.describe('with seeded namespace', () => {
    let namespace = '';
    let httproute = '';
    let grpcroute = '';

    test.beforeEach(async () => {
      namespace = `e2e-planp-${uid()}`;
      httproute = `e2e-route-${uid()}`;
      grpcroute = `e2e-grpc-${uid()}`;
      kubectl(['create', 'namespace', namespace]);
      applyManifest(httprouteManifest(httproute, namespace));
      applyManifest(grpcrouteManifest(grpcroute, namespace));
    });

    test.afterEach(async () => {
      deleteNamespace(namespace);
    });

    test(
      'creates a PlanPolicy targeting a GRPCRoute via the form',
      { tag: '@smoke' },
      async ({ page }) => {
        const policyName = `e2e-plan-${uid()}`;
        await gotoPage(
          page,
          createPagePath(namespace, 'extensions.kuadrant.io~v1alpha1~PlanPolicy'),
        );

        await page.locator('#policy-name').fill(policyName);
        await page.locator('#plan-tier-0').fill('gold');
        await page.locator('#plan-predicate-0').fill('auth.identity.tier == "gold"');

        await page.locator('#target-type-radio-grpcroute').click();
        await page.locator('#grpcroute-select').click();
        await page.getByRole('menuitem', { name: `${namespace}/${grpcroute}` }).click();

        const createButton = page.getByRole('button', { name: 'Create', exact: true });
        await expect(createButton).toBeEnabled();
        await createButton.click();

        await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/plan`), {
          timeout: 15_000,
        });

        expect(
          kubectl([
            'get',
            'planpolicy',
            policyName,
            '-n',
            namespace,
            '-o',
            'jsonpath={.spec.targetRef.kind}/{.spec.targetRef.name}',
          ]),
        ).toBe(`GRPCRoute/${grpcroute}`);
      },
    );

    test('creates a PlanPolicy via the form', { tag: '@smoke' }, async ({ page }) => {
      const policyName = `e2e-plan-${uid()}`;
      await gotoPage(page, createPagePath(namespace, 'extensions.kuadrant.io~v1alpha1~PlanPolicy'));

      await expect(page.getByRole('heading', { name: 'Create Plan Policy' })).toBeVisible({
        timeout: 15_000,
      });

      await page.locator('#policy-name').fill(policyName);
      await page.locator('#plan-tier-0').fill('gold');
      await page
        .locator('#plan-predicate-0')
        .fill(
          'has(auth.identity) && auth.identity.metadata.annotations["secret.kuadrant.io/plan-id"] == "gold"',
        );
      await page.locator('#plan-daily-0').fill('100');

      await page.locator('#target-type-radio-httproute').click();
      await page.locator('#httproute-select').click();
      await page.getByRole('menuitem', { name: `${namespace}/${httproute}` }).click();

      const createButton = page.getByRole('button', { name: 'Create', exact: true });
      await expect(createButton).toBeEnabled();
      await createButton.click();

      await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/plan`), {
        timeout: 15_000,
      });

      expect(resourceExists('planpolicy', policyName, namespace)).toBe(true);
    });

    test(
      'edits an existing PlanPolicy (name immutable, plan tier persisted)',
      { tag: '@smoke' },
      async ({ page }) => {
        const policyName = `e2e-plan-${uid()}`;
        applyManifest(`
apiVersion: extensions.kuadrant.io/v1alpha1
kind: PlanPolicy
metadata:
  name: ${policyName}
  namespace: ${namespace}
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: ${httproute}
  plans:
  - tier: gold
    predicate: 'auth.identity.tier == "gold"'
    limits:
      daily: 100
`);

        await gotoPage(page, `/k8s/ns/${namespace}/planpolicy/name/${policyName}/edit`);

        await expect(page.getByRole('heading', { name: 'Edit Plan Policy' })).toBeVisible({
          timeout: 15_000,
        });

        const nameInput = page.locator('#policy-name');
        await expect(nameInput).toHaveValue(policyName, { timeout: 15_000 });
        await expect(nameInput).toBeDisabled();
        await expect(page.locator('#plan-tier-0')).toHaveValue('gold');
        await expect(page.locator('#plan-predicate-0')).toHaveValue('auth.identity.tier == "gold"');
        await expect(page.locator('#plan-daily-0')).toHaveValue('100');

        // target type must not be re-editable once a policy already targets a resource
        await expect(page.locator('#target-type-radio-gateway')).toBeDisabled();
        await expect(page.locator('#target-type-radio-httproute')).toBeDisabled();
        await expect(page.locator('#target-type-radio-grpcroute')).toBeDisabled();
        await expect(page.locator('#httproute-select')).toBeDisabled();

        await page.locator('#plan-daily-0').fill('200');

        const saveButton = page.getByRole('button', { name: 'Save', exact: true });
        await expect(saveButton).toBeEnabled();
        await saveButton.click();

        await expect(page).toHaveURL(new RegExp(`/kuadrant/policies/ns/${namespace}/plan`), {
          timeout: 15_000,
        });

        expect(
          kubectl([
            'get',
            'planpolicy',
            policyName,
            '-n',
            namespace,
            '-o',
            'jsonpath={.spec.plans[0].limits.daily}',
          ]),
        ).toBe('200');
      },
    );

    test('add and remove plans dynamically', { tag: '@smoke' }, async ({ page }) => {
      await gotoPage(page, createPagePath(namespace, 'extensions.kuadrant.io~v1alpha1~PlanPolicy'));

      await expect(page.locator('#plan-tier-0')).toBeVisible();
      await expect(page.locator('#plan-tier-1')).not.toBeVisible();
      await expect(page.getByRole('button', { name: 'Remove Plan' }).first()).toBeDisabled();

      await page.getByRole('button', { name: 'Add Plan' }).click();
      await expect(page.locator('#plan-tier-1')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Remove Plan' }).first()).toBeEnabled();

      await page.getByRole('button', { name: 'Remove Plan' }).nth(1).click();
      await expect(page.locator('#plan-tier-1')).not.toBeVisible();
      await expect(page.getByRole('button', { name: 'Remove Plan' }).first()).toBeDisabled();
    });
  });
});

test.describe('policies page create dropdown', () => {
  test(
    'lists all policy types and navigates to the DNSPolicy form',
    { tag: '@smoke' },
    async ({ page }) => {
      await gotoPage(page, `/kuadrant/policies/ns/${TEST_NAMESPACE}`);

      const createButton = page.locator('button:has-text("Create Policy")');
      await expect(createButton).toBeVisible({ timeout: 15_000 });
      await expect(createButton).toBeEnabled();
      await createButton.click();

      for (const policy of [
        'AuthPolicy',
        'RateLimitPolicy',
        'TokenRateLimitPolicy',
        'OIDCPolicy',
        'PlanPolicy',
        'DNSPolicy',
        'TLSPolicy',
      ]) {
        await expect(page.getByRole('menuitem', { name: policy, exact: true })).toBeVisible();
      }

      await page.getByRole('menuitem', { name: 'DNSPolicy', exact: true }).click();

      // namespace resolution depends on console state; the destination form is what matters
      await expect(page).toHaveURL(/\/k8s\/ns\/[^/]+\/kuadrant\.io~v1~DNSPolicy\/~new/, {
        timeout: 15_000,
      });
      await expect(page.getByRole('heading', { name: 'Create DNS Policy' })).toBeVisible({
        timeout: 15_000,
      });
    },
  );
});
