import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { dismissConsoleTour, spaNavigate } from './helpers';

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function kubectl(args: string[], input?: string): string {
  return execFileSync('kubectl', args, {
    encoding: 'utf-8',
    ...(input !== undefined ? { input } : {}),
  }).trim();
}

function resourceExists(kind: string, name: string, namespace: string): boolean {
  return kubectl(['get', kind, name, '-n', namespace, '--ignore-not-found', '-o', 'name']) !== '';
}

function deleteResource(kind: string, name: string, namespace: string): void {
  kubectl(['delete', kind, name, '-n', namespace, '--ignore-not-found', '--wait=false']);
}

function deleteNamespace(namespace: string): void {
  kubectl(['delete', 'namespace', namespace, '--ignore-not-found', '--wait=false']);
}

function applyGateway(name: string, namespace: string): void {
  kubectl(
    ['apply', '-f', '-'],
    `
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
`,
  );
}

function applyExtension(name: string, namespace: string, gateway: string): void {
  kubectl(
    ['apply', '-f', '-'],
    `
apiVersion: mcp.kuadrant.io/v1
kind: MCPGatewayExtension
metadata:
  name: ${name}
  namespace: ${namespace}
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: Gateway
    name: ${gateway}
    namespace: ${namespace}
    sectionName: http
`,
  );
}

function applyHTTPRoute(name: string, namespace: string, gateway: string): void {
  kubectl(
    ['apply', '-f', '-'],
    `
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: ${name}
  namespace: ${namespace}
spec:
  parentRefs:
  - name: ${gateway}
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /
`,
  );
}

function applyRegistration(name: string, namespace: string, route: string, prefix: string): void {
  kubectl(
    ['apply', '-f', '-'],
    `
apiVersion: mcp.kuadrant.io/v1
kind: MCPServerRegistration
metadata:
  name: ${name}
  namespace: ${namespace}
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: ${route}
  prefix: ${prefix}
`,
  );
}

// The SDK's <ResourceYAMLEditor> renders a Monaco editor (via react-monaco-editor),
// which loads asynchronously and exposes a global `window.monaco`. Wait for it to
// initialise, then assert its content contains `text`.
// Mirrors expectEditorContains in gateway-crud.spec.ts.
async function expectEditorContains(
  page: import('@playwright/test').Page,
  text: string,
): Promise<void> {
  await page.waitForSelector('.monaco-editor .view-lines', { state: 'visible', timeout: 15_000 });
  await page.waitForFunction(
    (expected) => {
      try {
        type MonacoType = {
          editor?: {
            getEditors?: () => Array<{ getValue: () => string; getDomNode: () => Element | null }>;
          };
        };
        const monaco = (window as unknown as { monaco?: MonacoType }).monaco;
        const editorEl = document.querySelector('.monaco-editor');
        if (monaco?.editor?.getEditors && editorEl) {
          const editors = monaco.editor.getEditors();
          const visible = editors.find(
            (e) => e.getDomNode() === editorEl || editorEl.contains(e.getDomNode()),
          );
          if (visible) return visible.getValue().includes(expected);
        }
      } catch {
        // fallthrough
      }
      const lines = document.querySelector('.monaco-editor .view-lines');
      return (lines?.textContent || '').includes(expected);
    },
    text,
    { timeout: 15_000 },
  );
}

// <ResourceYAMLEditor> is a Monaco editor, so it can't be filled like a plain input.
// Set its content through Monaco's model API, which triggers onChange like real typing.
async function setEditorValue(page: import('@playwright/test').Page, yaml: string): Promise<void> {
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

// Delete a resource from the MCP overview page's ResourceList via the kebab menu
// (DropdownWithKebab), following the kebab pattern in rbac.spec.ts. The MCP
// create/edit pages have no page-level Delete button, matching the policy pages.
async function deleteViaKebab(page: import('@playwright/test').Page, name: string): Promise<void> {
  const row = page.locator(`tr:has-text("${name}")`);
  await expect(row).toBeVisible({ timeout: 15_000 });

  await row.locator('[aria-label="kebab dropdown toggle"]').click();

  const deleteItem = page.getByRole('menuitem', { name: 'Delete', exact: true });
  await expect(deleteItem).toBeVisible({ timeout: 5_000 });
  await deleteItem.click();

  // Confirm in the DropdownWithKebab delete modal.
  const modal = page.locator('.pf-v6-c-modal-box');
  await expect(modal).toBeVisible({ timeout: 5_000 });
  await modal.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(modal).toBeHidden({ timeout: 10_000 });
}

async function fillListener(page: import('@playwright/test').Page, value: string): Promise<void> {
  const select = page.locator('[data-test="mcp-section-name"]');
  if (await select.isVisible().catch(() => false)) {
    await select.selectOption(value);
  } else {
    await page.locator('[data-test="mcp-section-name-input"]').fill(value);
  }
}

test.describe('MCP resource pages', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissConsoleTour(page);
  });

  test.describe('MCPGatewayExtension', () => {
    let namespace = '';
    const gatewayName = `e2e-page-gw-${uid()}`;

    test.beforeAll(() => {
      namespace = `e2e-mcp-pages-${uid()}`;
      kubectl(['create', 'namespace', namespace]);
      applyGateway(gatewayName, namespace);
    });

    test.afterAll(() => {
      deleteNamespace(namespace);
    });

    test(
      'creates an MCPGatewayExtension from the form page',
      { tag: '@smoke' },
      async ({ page }) => {
        const extName = `e2e-page-ext-${uid()}`;

        await spaNavigate(page, `/k8s/ns/${namespace}/mcp.kuadrant.io~v1~MCPGatewayExtension/~new`);

        await expect(page.getByRole('heading', { name: 'Create MCPGatewayExtension' })).toBeVisible(
          {
            timeout: 15_000,
          },
        );

        await page.locator('[data-test="mcp-extension-name"]').fill(extName);
        await page.locator('[data-test="mcp-target-gateway-select"]').selectOption(gatewayName);
        await fillListener(page, 'http');

        await page.getByRole('button', { name: 'Create', exact: true }).click();

        await expect(page).toHaveURL(new RegExp(`/kuadrant/mcp/overview/ns/${namespace}`), {
          timeout: 15_000,
        });
        expect(resourceExists('mcpgatewayextension', extName, namespace)).toBe(true);

        deleteResource('mcpgatewayextension', extName, namespace);
      },
    );

    test('edits an existing MCPGatewayExtension', { tag: '@smoke' }, async ({ page }) => {
      const extName = `e2e-page-edit-${uid()}`;
      applyExtension(extName, namespace, gatewayName);

      await spaNavigate(page, `/k8s/ns/${namespace}/mcpgatewayextension/name/${extName}/edit`);

      await expect(page.getByRole('heading', { name: 'Edit MCPGatewayExtension' })).toBeVisible({
        timeout: 15_000,
      });

      // Name is prefilled and immutable in edit mode
      await expect(page.locator('[data-test="mcp-extension-name"]')).toHaveValue(extName);
      await expect(page.locator('[data-test="mcp-extension-name"]')).toBeDisabled();

      // Change an advanced setting and save
      await page.getByRole('button', { name: 'Advanced broker settings' }).click();
      await page.locator('label[for="override-hostnames"]').click();
      await page.locator('[data-test="mcp-public-host"]').fill('mcp.e2e-edit.com');

      await page.getByRole('button', { name: 'Save', exact: true }).click();

      await expect(page).toHaveURL(new RegExp(`/kuadrant/mcp/overview/ns/${namespace}`), {
        timeout: 15_000,
      });

      const publicHost = kubectl([
        'get',
        'mcpgatewayextension',
        extName,
        '-n',
        namespace,
        '-o',
        'jsonpath={.spec.publicHost}',
      ]);
      expect(publicHost).toBe('mcp.e2e-edit.com');

      deleteResource('mcpgatewayextension', extName, namespace);
    });

    // The create/edit page has no page-level Delete button (matching the policy
    // create/edit pages). Deletion is handled from the overview ResourceList kebab
    // menu (DropdownWithKebab).
    test(
      'deletes an MCPGatewayExtension via the overview kebab menu',
      { tag: '@smoke' },
      async ({ page }) => {
        const extName = `e2e-page-del-${uid()}`;
        applyExtension(extName, namespace, gatewayName);

        await spaNavigate(page, `/kuadrant/mcp/overview/ns/${namespace}`);

        await deleteViaKebab(page, extName);

        await expect(() => {
          expect(resourceExists('mcpgatewayextension', extName, namespace)).toBe(false);
        }).toPass({ timeout: 15_000 });
      },
    );
  });

  test.describe('MCPServerRegistration', () => {
    let namespace = '';
    const gatewayName = `e2e-reg-gw-${uid()}`;
    const routeName = `e2e-reg-route-${uid()}`;

    test.beforeAll(() => {
      namespace = `e2e-mcp-reg-pages-${uid()}`;
      kubectl(['create', 'namespace', namespace]);
      applyGateway(gatewayName, namespace);
      applyHTTPRoute(routeName, namespace, gatewayName);
    });

    test.afterAll(() => {
      deleteNamespace(namespace);
    });

    test(
      'creates an MCPServerRegistration from the form page',
      { tag: '@smoke' },
      async ({ page }) => {
        const regName = `e2e-reg-form-${uid()}`;

        await spaNavigate(
          page,
          `/k8s/ns/${namespace}/mcp.kuadrant.io~v1~MCPServerRegistration/~new`,
        );

        await expect(
          page.getByRole('heading', { name: 'Create MCPServerRegistration' }),
        ).toBeVisible({ timeout: 15_000 });

        await expect(page.getByRole('tab', { name: 'Form' })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'YAML' })).toBeVisible();

        await page.locator('[data-test="mcp-registration-name"]').fill(regName);

        // The Target HTTPRoute dropdown populates from HTTPRoutes watched in the
        // namespace; select the route created in beforeAll.
        const routeSelect = page.locator('[data-test="mcp-registration-httproute"]');
        await expect(routeSelect).toBeVisible({ timeout: 15_000 });
        await routeSelect.selectOption(routeName);

        await page.locator('[data-test="mcp-registration-prefix"]').fill('e2e_form');

        await page.getByRole('button', { name: 'Create', exact: true }).click();

        await expect(page).toHaveURL(new RegExp(`/kuadrant/mcp/overview/ns/${namespace}`), {
          timeout: 15_000,
        });

        await expect(() => {
          expect(resourceExists('mcpserverregistration', regName, namespace)).toBe(true);
        }).toPass({ timeout: 15_000 });

        const route = kubectl([
          'get',
          'mcpserverregistration',
          regName,
          '-n',
          namespace,
          '-o',
          'jsonpath={.spec.targetRef.name}',
        ]);
        expect(route).toBe(routeName);

        deleteResource('mcpserverregistration', regName, namespace);
      },
    );

    test(
      'creates an MCPServerRegistration from the YAML tab',
      { tag: '@smoke' },
      async ({ page }) => {
        const regName = `e2e-reg-create-${uid()}`;

        await spaNavigate(
          page,
          `/k8s/ns/${namespace}/mcp.kuadrant.io~v1~MCPServerRegistration/~new`,
        );

        await expect(
          page.getByRole('heading', { name: 'Create MCPServerRegistration' }),
        ).toBeVisible({ timeout: 15_000 });

        // Form is the default view; switch to the YAML tab and set the full
        // resource content in the editor.
        await page.getByRole('tab', { name: 'YAML' }).click();
        await setEditorValue(
          page,
          `apiVersion: mcp.kuadrant.io/v1
kind: MCPServerRegistration
metadata:
  name: ${regName}
  namespace: ${namespace}
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: ${routeName}
  prefix: e2e_create
`,
        );

        // Create button is rendered by ResourceYAMLEditor.
        const createButton = page.locator('button:has-text("Create")').last();
        await expect(createButton).toBeEnabled({ timeout: 10_000 });
        await createButton.click();

        await expect(() => {
          expect(resourceExists('mcpserverregistration', regName, namespace)).toBe(true);
        }).toPass({ timeout: 15_000 });

        deleteResource('mcpserverregistration', regName, namespace);
      },
    );

    // Guards the latent race where the YAML editor could mount with the blank
    // template before the watched resource resolves: on edit the editor must show
    // the REAL resource (its name and server-populated prefix), not the template.
    test(
      'edit page loads the real MCPServerRegistration into the YAML editor (not the blank template)',
      { tag: '@smoke' },
      async ({ page }) => {
        const regName = `e2e-reg-edit-${uid()}`;
        applyRegistration(regName, namespace, routeName, 'e2e_real_prefix');

        await spaNavigate(page, `/k8s/ns/${namespace}/mcpserverregistration/name/${regName}/edit`);

        await expect(page.getByRole('heading', { name: 'Edit MCPServerRegistration' })).toBeVisible(
          {
            timeout: 15_000,
          },
        );

        // Form is the default view; switch to the YAML tab to inspect the editor.
        await page.getByRole('tab', { name: 'YAML' }).click();

        // The editor must contain the real resource, not the blank template.
        await expectEditorContains(page, regName);
        await expectEditorContains(page, 'e2e_real_prefix');

        deleteResource('mcpserverregistration', regName, namespace);
      },
    );

    // The create/edit page has no page-level Delete button (matching the policy
    // create/edit pages). Deletion is handled from the overview ResourceList kebab
    // menu (DropdownWithKebab).
    test(
      'deletes an MCPServerRegistration via the overview kebab menu',
      { tag: '@smoke' },
      async ({ page }) => {
        // The overview renders its resource tables only when at least one
        // MCPGatewayExtension exists, so create one alongside the registration.
        const extName = `e2e-reg-del-ext-${uid()}`;
        const regName = `e2e-reg-del-${uid()}`;
        applyExtension(extName, namespace, gatewayName);
        applyRegistration(regName, namespace, routeName, 'e2e_del');

        await spaNavigate(page, `/kuadrant/mcp/overview/ns/${namespace}`);

        await deleteViaKebab(page, regName);

        await expect(() => {
          expect(resourceExists('mcpserverregistration', regName, namespace)).toBe(false);
        }).toPass({ timeout: 15_000 });

        deleteResource('mcpgatewayextension', extName, namespace);
      },
    );
  });
});
