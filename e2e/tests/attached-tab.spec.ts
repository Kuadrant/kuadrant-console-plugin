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
  await page.waitForLoadState('networkidle');
  await dismissConsoleTour(page);
}

test.describe('Attached tab', () => {
  let namespace = '';
  let gateway = '';
  let httproute = '';
  let authpolicy = '';

  test.beforeEach(async () => {
    namespace = `e2e-attached-${uid()}`;
    gateway = `e2e-gw-${uid()}`;
    httproute = `e2e-route-${uid()}`;
    authpolicy = `e2e-auth-${uid()}`;

    kubectl(['create', 'namespace', namespace]);

    applyResource(`
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: ${gateway}
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

    applyResource(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: ${httproute}
  namespace: ${namespace}
spec:
  parentRefs:
  - name: ${gateway}
    sectionName: http
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /api
    backendRefs:
    - name: example-svc
      port: 8080
`);

    applyResource(`
apiVersion: kuadrant.io/v1
kind: AuthPolicy
metadata:
  name: ${authpolicy}
  namespace: ${namespace}
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: Gateway
    name: ${gateway}
  rules:
    authentication:
      apiKey:
        allNamespaces: true
`);
  });

  test.afterEach(async () => {
    deleteNamespace(namespace);
  });

  test(
    'Gateway Attached tab shows HTTPRoute and AuthPolicy',
    { tag: '@nightly' },
    async ({ page }) => {
      await gotoPage(page, `/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~Gateway/${gateway}`);

      const attachedTab = page.getByRole('tab', { name: 'Attached' });
      await expect(attachedTab).toBeVisible({ timeout: 15_000 });
      await attachedTab.click();

      await expect(page.getByRole('heading', { name: 'Attached Resources' })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole('heading', { name: 'Attached Policies' })).toBeVisible();

      await expect(page.locator(`a[data-test="${httproute}"]`).first()).toBeVisible({
        timeout: 15_000,
      });

      await expect(page.locator(`a[data-test="${authpolicy}"]`).first()).toBeVisible({
        timeout: 15_000,
      });

      const httprouteRow = page.locator(`tr:has(a[data-test="${httproute}"])`);
      await expect(httprouteRow.locator('text=HTTPRoute')).toBeVisible();

      const authpolicyRow = page.locator(`tr:has(a[data-test="${authpolicy}"])`);
      await expect(authpolicyRow.locator('text=AuthPolicy')).toBeVisible();
    },
  );

  test('HTTPRoute Attached tab shows Gateway', { tag: '@nightly' }, async ({ page }) => {
    await gotoPage(
      page,
      `/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~HTTPRoute/${httproute}`,
    );

    const attachedTab = page.getByRole('tab', { name: 'Attached' });
    await expect(attachedTab).toBeVisible({ timeout: 15_000 });
    await attachedTab.click();

    await expect(page.getByRole('heading', { name: 'Attached Resources' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('heading', { name: 'Attached Policies' })).toBeVisible();

    await expect(page.locator(`a[data-test="${gateway}"]`).first()).toBeVisible({
      timeout: 15_000,
    });

    const gatewayRow = page.locator(`tr:has(a[data-test="${gateway}"])`);
    await expect(gatewayRow.locator('text=Gateway')).toBeVisible();
  });

  test(
    'navigates from Attached tab to HTTPRoute details',
    { tag: '@nightly' },
    async ({ page }) => {
      await gotoPage(page, `/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~Gateway/${gateway}`);

      const attachedTab = page.getByRole('tab', { name: 'Attached' });
      await expect(attachedTab).toBeVisible({ timeout: 15_000 });
      await attachedTab.click();

      const httprouteLink = page.locator(`a[data-test="${httproute}"]`).first();
      await expect(httprouteLink).toBeVisible({ timeout: 15_000 });
      await httprouteLink.click();

      await expect(page).toHaveURL(
        new RegExp(`/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~HTTPRoute/${httproute}`),
        { timeout: 15_000 },
      );
    },
  );

  test(
    'navigates from Attached tab to AuthPolicy details',
    { tag: '@nightly' },
    async ({ page }) => {
      await gotoPage(page, `/k8s/ns/${namespace}/gateway.networking.k8s.io~v1~Gateway/${gateway}`);

      const attachedTab = page.getByRole('tab', { name: 'Attached' });
      await expect(attachedTab).toBeVisible({ timeout: 15_000 });
      await attachedTab.click();

      const authpolicyLink = page.locator(`a[data-test="${authpolicy}"]`).first();
      await expect(authpolicyLink).toBeVisible({ timeout: 15_000 });
      await authpolicyLink.click();

      await expect(page).toHaveURL(
        new RegExp(`/k8s/ns/${namespace}/kuadrant.io~v1~AuthPolicy/${authpolicy}`),
        { timeout: 15_000 },
      );
    },
  );
});
