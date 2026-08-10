import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import { dismissConsoleTour } from './helpers';

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function kubectl(args: string[], input?: string): string {
  return execFileSync('kubectl', args, {
    encoding: 'utf-8',
    ...(input !== undefined ? { input } : {}),
  }).trim();
}

function applyResource(manifest: string): void {
  kubectl(['apply', '-f', '-'], manifest);
}

function resourceExists(kind: string, name: string, namespace: string): boolean {
  return kubectl(['get', kind, name, '-n', namespace, '--ignore-not-found', '-o', 'name']) !== '';
}

function deleteNamespace(namespace: string): void {
  if (namespace) {
    try {
      kubectl(['delete', 'namespace', namespace, '--ignore-not-found', '--wait=false']);
    } catch (error) {
      console.error(`Failed to delete namespace ${namespace}:`, error);
    }
  }
}

async function gotoPage(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('domcontentloaded');
  await dismissConsoleTour(page);
}

async function expectEditorContains(page: Page, text: string): Promise<void> {
  await page.waitForSelector('.monaco-editor .view-lines', {
    state: 'visible',
    timeout: 15_000,
  });
  await page.waitForFunction(
    (expected) => {
      // Prefer the editor instance bound to the visible DOM node over getModels()
      // because getModels() may return stale or unrelated models from previous renders
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
      // Fallback: check visible lines (may miss content outside viewport)
      const lines = document.querySelector('.monaco-editor .view-lines');
      return (lines?.textContent || '').includes(expected);
    },
    text,
    { timeout: 15_000 },
  );
}

async function addListenerViaWizard(
  page: Page,
  opts: { name: string; port: string; protocol: string; isEdit?: boolean },
): Promise<void> {
  const { name, port, protocol, isEdit = false } = opts;

  // Step 1: Configuration — fill name, port
  await page.locator('#listener-name').fill(name);
  await page.locator('#listener-port').clear();
  await page.locator('#listener-port').fill(port);

  // Next → Protocol
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 2: Protocol
  await page.locator('#listener-protocol').selectOption(protocol);

  // Next → Allowed Routes
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 3: Allowed Routes — accept defaults, next → Review & Create
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 4: Review & Create — click Add/Update
  const wizardButton = page
    .locator('.pf-v6-c-modal-box')
    .getByRole('button', { name: isEdit ? 'Update' : 'Add' });
  await expect(wizardButton).toBeEnabled({ timeout: 5_000 });
  await wizardButton.click();

  // Wait for wizard modal to be fully removed from DOM so its drawer overlay doesn't block clicks
  await page.waitForSelector('.pf-v6-c-modal-box', { state: 'detached', timeout: 10_000 });
}

test.describe('Gateway CRUD', () => {
  let namespace = '';

  test.beforeEach(async () => {
    namespace = `e2e-gw-${uid()}`;
    kubectl(['create', 'namespace', namespace]);
  });

  test.afterEach(async () => {
    deleteNamespace(namespace);
  });

  test('creates a Gateway via the form', { tag: '@smoke' }, async ({ page }) => {
    const gatewayName = `e2e-gateway-${uid()}`;
    await gotoPage(page, `/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~Gateway/~new`);

    await expect(page.getByRole('heading', { name: 'Create Gateway' })).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.locator('#create-type-radio-form')).toBeChecked();

    await page.locator('#gateway-name').fill(gatewayName);
    await expect(page.locator('#gateway-class')).toHaveValue('istio');

    // Add listener via wizard
    await page.getByRole('button', { name: 'Add listener' }).click();
    await addListenerViaWizard(page, { name: 'http', port: '80', protocol: 'HTTP' });

    // Verify listener appears in the table
    await expect(page.getByRole('gridcell', { name: 'http', exact: true })).toBeVisible();

    const createButton = page.getByRole('button', { name: 'Create', exact: true });
    await expect(createButton).toBeEnabled();
    await createButton.focus();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(
      new RegExp(`/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~Gateway/${gatewayName}`),
      { timeout: 15_000 },
    );

    expect(resourceExists('gateway', gatewayName, namespace)).toBe(true);

    expect(
      kubectl([
        'get',
        'gateway',
        gatewayName,
        '-n',
        namespace,
        '-o',
        'jsonpath={.spec.gatewayClassName}',
      ]),
    ).toBe('istio');
  });

  test('edits an existing Gateway', { tag: '@smoke' }, async ({ page }) => {
    const gatewayName = `e2e-gateway-${uid()}`;
    applyResource(`
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: ${gatewayName}
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
`);

    await gotoPage(
      page,
      `/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~Gateway/${gatewayName}/edit`,
    );

    await expect(page.getByRole('heading', { name: 'Edit Gateway' })).toBeVisible({
      timeout: 15_000,
    });

    // Verify form is populated
    const nameInput = page.locator('#gateway-name');
    await expect(nameInput).toHaveValue(gatewayName, { timeout: 15_000 });
    await expect(nameInput).toBeDisabled();
    await expect(page.locator('#gateway-class')).toHaveValue('istio');

    // Verify listener is shown in the table
    await expect(page.getByRole('gridcell', { name: 'http', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('gridcell', { name: '80', exact: true })).toBeVisible();

    // Edit the listener via wizard
    await page.getByRole('button', { name: 'Edit listener' }).click();

    // Change port in the wizard
    await expect(page.locator('#listener-name')).toHaveValue('http', { timeout: 15_000 });
    await page.locator('#listener-port').clear();
    await page.locator('#listener-port').fill('8080');

    // Navigate through wizard to save
    await page.getByRole('button', { name: 'Next' }).click(); // Protocol
    await page.getByRole('button', { name: 'Next' }).click(); // Allowed Routes
    await page.getByRole('button', { name: 'Next' }).click(); // Review & Create

    const wizardUpdateButton = page
      .locator('.pf-v6-c-modal-box')
      .getByRole('button', { name: 'Update' });
    await expect(wizardUpdateButton).toBeEnabled({ timeout: 5_000 });
    await wizardUpdateButton.click();
    await page.waitForSelector('.pf-v6-c-modal-box', { state: 'detached', timeout: 10_000 });

    // Wait for listener table to reflect the updated port before saving
    await expect(page.getByRole('gridcell', { name: '8080', exact: true })).toBeVisible({
      timeout: 5_000,
    });

    // Brief pause to allow React to finish committing all pending state updates
    await page.waitForTimeout(150);

    // Save the form — use React-compatible event to bypass drawer interception
    const saveButton = page.getByRole('button', { name: 'Save', exact: true });
    await expect(saveButton).toBeEnabled();
    await saveButton.evaluate((btn) =>
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
    );

    await expect(page).toHaveURL(
      new RegExp(`/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~Gateway/${gatewayName}`),
      { timeout: 15_000 },
    );

    expect(
      kubectl([
        'get',
        'gateway',
        gatewayName,
        '-n',
        namespace,
        '-o',
        'jsonpath={.spec.listeners[0].port}',
      ]),
    ).toBe('8080');
  });

  test('form↔YAML sync preserves data', { tag: '@smoke' }, async ({ page }) => {
    const gatewayName = `e2e-gateway-${uid()}`;
    await gotoPage(page, `/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~Gateway/~new`);

    await expect(page.getByRole('heading', { name: 'Create Gateway' })).toBeVisible({
      timeout: 15_000,
    });

    await page.locator('#gateway-name').fill(gatewayName);
    await expect(page.locator('#gateway-class')).toHaveValue('istio');

    // Add listener via wizard
    await page.getByRole('button', { name: 'Add listener' }).click();
    await addListenerViaWizard(page, { name: 'https', port: '443', protocol: 'HTTPS' });

    // Wait for listener to appear in table — confirms React state has the listener
    await expect(page.getByRole('gridcell', { name: 'https', exact: true })).toBeVisible({
      timeout: 5_000,
    });

    // Switch to YAML and verify the listener is reflected in the editor before proceeding.
    // This acts as a deterministic sync point: the editor only contains 'https' once
    // the yamlContent useEffect has re-run with the updated gatewayObject.
    await page.locator('#create-type-radio-yaml').click();
    await expectEditorContains(page, 'https');

    // Switch back to form, then to YAML for the full assertion pass
    await page.locator('#create-type-radio-form').click();

    // Switch to YAML
    await page.locator('#create-type-radio-yaml').click();

    await expectEditorContains(page, gatewayName);
    await expectEditorContains(page, 'istio');
    await expectEditorContains(page, 'https');
    await expectEditorContains(page, '443');
    await expectEditorContains(page, 'HTTPS');

    // Switch back to form
    await page.locator('#create-type-radio-form').click();

    await expect(page.locator('#gateway-name')).toHaveValue(gatewayName);
    await expect(page.locator('#gateway-class')).toHaveValue('istio');
    // Listener data is shown in the table, not as inputs
    await expect(page.getByRole('gridcell', { name: 'https', exact: true })).toBeVisible();
    await expect(page.getByRole('gridcell', { name: '443', exact: true })).toBeVisible();
  });
});
