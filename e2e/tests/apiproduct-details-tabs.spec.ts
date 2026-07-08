import { test, expect, Page } from '@playwright/test';
import { TEST_NAMESPACE, dismissConsoleTour, spaNavigate } from './helpers';

// Test custom tabs in APIProduct details page: Definition, Target, Policies

// Navigate to APIProduct detail page (Details tab is default)
async function navigateToAPIProductDetails(
  page: Page,
  namespace: string,
  productName: string,
): Promise<void> {
  await spaNavigate(
    page,
    `/k8s/ns/${namespace}/devportal.kuadrant.io~v1alpha1~APIProduct/${productName}`,
  );
}

// Navigate to a specific tab of the APIProduct detail page
async function navigateToAPIProductTab(
  page: Page,
  namespace: string,
  productName: string,
  tab: string,
): Promise<void> {
  await spaNavigate(
    page,
    `/k8s/ns/${namespace}/devportal.kuadrant.io~v1alpha1~APIProduct/${productName}/${tab}`,
  );
}

test.describe('APIProduct Details Page - Custom Tabs', () => {
  // Use test-list-product-2 which has openAPISpecURL configured
  const API_PRODUCT_NAME = 'test-list-product-2';

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
    await dismissConsoleTour(page);
  });

  test('should display custom plugin tabs on APIProduct detail page', { tag: '@nightly' }, async ({ page }) => {
    // Navigate to APIProduct detail page
    await navigateToAPIProductDetails(page, TEST_NAMESPACE, API_PRODUCT_NAME);

    // Verify custom plugin tabs are visible
    // Custom tabs: Definition, Target, Policies
    const tabs = page.locator('[role="tablist"] button, [role="tablist"] a').first();
    await expect(tabs).toBeVisible({ timeout: 15_000 });

    // Check for each custom tab
    await expect(
      page.locator(
        '[role="tablist"] button:has-text("Definition"), [role="tablist"] a:has-text("Definition")',
      ),
    ).toBeVisible();
    await expect(
      page.locator(
        '[role="tablist"] button:has-text("Target"), [role="tablist"] a:has-text("Target")',
      ),
    ).toBeVisible();
    await expect(
      page.locator(
        '[role="tablist"] button:has-text("Policies"), [role="tablist"] a:has-text("Policies")',
      ),
    ).toBeVisible();
  });

  test('should display Definition tab empty state when no spec available', { tag: '@nightly' }, async ({ page }) => {
    const { execSync } = await import('child_process');
    const testNs = `test-tabs-${Date.now()}`;
    const httpRouteName = 'test-route-no-spec';
    const apiProductName = 'test-product-no-spec';

    try {
      // Create dedicated namespace
      execSync(`kubectl create namespace ${testNs}`, { stdio: 'pipe' });

      // Create HTTPRoute
      const httpRoute = `
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: ${httpRouteName}
  namespace: ${testNs}
spec:
  parentRefs:
    - name: test-gateway
      namespace: ${TEST_NAMESPACE}
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /test
      backendRefs:
        - name: test-backend
          port: 8080
`;
      execSync(`echo '${httpRoute}' | kubectl apply -f -`, { stdio: 'pipe' });

      // Create APIProduct WITHOUT openAPISpecURL (no spec for controller to sync)
      const apiProduct = `
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIProduct
metadata:
  name: ${apiProductName}
  namespace: ${testNs}
spec:
  displayName: Test No Spec
  version: v1.0.0
  publishStatus: Published
  approvalMode: manual
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: ${httpRouteName}
`;
      execSync(`echo '${apiProduct}' | kubectl apply -f -`, { stdio: 'pipe' });

      // Navigate to Definition tab
      await navigateToAPIProductTab(page, testNs, apiProductName, 'definition');

      // Verify empty state is shown
      const emptyStateText = page.getByText('No OpenAPI specification available');
      await expect(emptyStateText).toBeVisible({ timeout: 10_000 });
    } finally {
      // Cleanup: delete namespace (removes all resources)
      try {
        execSync(`kubectl delete namespace ${testNs} --ignore-not-found`, { stdio: 'pipe' });
      } catch (error) {
        console.log('Cleanup error (non-fatal):', error);
      }
    }
  });

  test('should display Definition tab with OpenAPI spec (Swagger UI)', { tag: '@nightly' }, async ({ page }) => {
    // Use toystore-api which has a valid openAPISpecURL that the controller syncs
    const TOYSTORE_API = 'toystore-api';

    // Navigate to Definition tab
    await navigateToAPIProductTab(page, TEST_NAMESPACE, TOYSTORE_API, 'definition');

    // Verify Swagger UI renders (wait for it to load)
    const swaggerContainer = page.locator('.swagger-ui');
    await expect(swaggerContainer).toBeVisible({ timeout: 15_000 });

    // Verify it contains the Petstore API info
    await expect(page.getByText('Pet Store API', { exact: false })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('should display Policies tab empty state when no policies attached', { tag: '@nightly' }, async ({ page }) => {
    const { execSync } = await import('child_process');
    const testNs = `test-tabs-${Date.now()}`;
    const httpRouteName = 'test-route-no-policies';
    const apiProductName = 'test-product-no-policies';

    try {
      // Create dedicated namespace
      execSync(`kubectl create namespace ${testNs}`, { stdio: 'pipe' });

      // Create HTTPRoute
      const httpRoute = `
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: ${httpRouteName}
  namespace: ${testNs}
spec:
  parentRefs:
    - name: test-gateway
      namespace: ${TEST_NAMESPACE}
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /test
      backendRefs:
        - name: test-backend
          port: 8080
`;
      execSync(`echo '${httpRoute}' | kubectl apply -f -`, { stdio: 'pipe' });

      // Create APIProduct
      const apiProduct = `
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIProduct
metadata:
  name: ${apiProductName}
  namespace: ${testNs}
spec:
  displayName: Test No Policies
  version: v1.0.0
  publishStatus: Published
  approvalMode: manual
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: ${httpRouteName}
`;
      execSync(`echo '${apiProduct}' | kubectl apply -f -`, { stdio: 'pipe' });

      // Navigate to Policies tab
      await navigateToAPIProductTab(page, testNs, apiProductName, 'policies');

      // Verify empty state is shown
      const emptyState = page.locator('text=No policies found');
      await expect(emptyState).toBeVisible({ timeout: 10_000 });
    } finally {
      // Cleanup: delete namespace (removes all resources)
      try {
        execSync(`kubectl delete namespace ${testNs} --ignore-not-found`, { stdio: 'pipe' });
      } catch (error) {
        console.log('Cleanup error (non-fatal):', error);
      }
    }
  });

  test('should display Policies tab with actual policies when they exist', { tag: '@nightly' }, async ({ page }) => {
    const { execSync } = await import('child_process');
    const testNs = `test-tabs-${Date.now()}`;
    const httpRouteName = 'test-route-with-policies';
    const apiProductName = 'test-product-with-policies';
    const authPolicyName = 'test-auth';

    try {
      // Create dedicated namespace
      execSync(`kubectl create namespace ${testNs}`, { stdio: 'pipe' });

      // Create HTTPRoute
      const httpRoute = `
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: ${httpRouteName}
  namespace: ${testNs}
spec:
  parentRefs:
    - name: test-gateway
      namespace: ${TEST_NAMESPACE}
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /test
      backendRefs:
        - name: test-backend
          port: 8080
`;
      execSync(`echo '${httpRoute}' | kubectl apply -f -`, { stdio: 'pipe' });

      // Create AuthPolicy targeting the HTTPRoute
      const authPolicy = `
apiVersion: kuadrant.io/v1
kind: AuthPolicy
metadata:
  name: ${authPolicyName}
  namespace: ${testNs}
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: ${httpRouteName}
  rules:
    authentication:
      "api-key":
        apiKey:
          selector:
            matchLabels:
              authorino.kuadrant.io/managed-by: authorino
          allNamespaces: true
        credentials:
          customHeader:
            name: "X-API-Key"
`;
      execSync(`echo '${authPolicy}' | kubectl apply -f -`, { stdio: 'pipe' });

      // Create APIProduct
      const apiProduct = `
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIProduct
metadata:
  name: ${apiProductName}
  namespace: ${testNs}
spec:
  displayName: Test With Policies
  version: v1.0.0
  publishStatus: Published
  approvalMode: manual
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: ${httpRouteName}
`;
      execSync(`echo '${apiProduct}' | kubectl apply -f -`, { stdio: 'pipe' });

      // Navigate to Policies tab
      await navigateToAPIProductTab(page, testNs, apiProductName, 'policies');

      // Verify policy appears
      await expect(page.locator(`text=${authPolicyName}`)).toBeVisible({
        timeout: 10_000,
      });

      // Verify policy type is shown
      await expect(page.getByText('AuthPolicy').first()).toBeVisible({ timeout: 10_000 });
    } finally {
      // Cleanup: delete namespace (removes all resources)
      try {
        execSync(`kubectl delete namespace ${testNs} --ignore-not-found`, { stdio: 'pipe' });
      } catch (error) {
        console.log('Cleanup error (non-fatal):', error);
      }
    }
  });

  test('should display Target tab with HTTPRoute targetRef', { tag: '@nightly' }, async ({ page }) => {
    await navigateToAPIProductTab(page, TEST_NAMESPACE, API_PRODUCT_NAME, 'targetref');

    // Verify HTTPRoute targetRef is displayed
    await expect(page.locator('text=test-httproute').first()).toBeVisible({ timeout: 10_000 });

    // Verify HTTPRoute resource type is mentioned
    const httpRouteText = page.getByText('HTTPRoute').first();
    await expect(httpRouteText).toBeVisible({ timeout: 10_000 });
  });

  test('should navigate between custom tabs successfully', { tag: '@nightly' }, async ({ page }) => {
    await navigateToAPIProductDetails(page, TEST_NAMESPACE, API_PRODUCT_NAME);

    // Click on Definition tab
    const definitionTab = page.locator(
      '[role="tablist"] button:has-text("Definition"), [role="tablist"] a:has-text("Definition")',
    );
    await definitionTab.click();
    await page.waitForURL('**/definition');

    // Verify URL changed to /definition
    expect(page.url()).toContain('/definition');

    // Click on Target tab
    const targetTab = page.locator(
      '[role="tablist"] button:has-text("Target"), [role="tablist"] a:has-text("Target")',
    );
    await targetTab.click();
    await page.waitForURL('**/targetref');

    // Verify URL changed to /targetref
    expect(page.url()).toContain('/targetref');

    // Click on Policies tab
    const policiesTab = page.locator(
      '[role="tablist"] button:has-text("Policies"), [role="tablist"] a:has-text("Policies")',
    );
    await policiesTab.click();
    await page.waitForURL('**/policies');

    // Verify URL changed to /policies
    expect(page.url()).toContain('/policies');

    // Navigate back to Definition tab to verify bidirectional navigation
    await definitionTab.click();
    await page.waitForURL('**/definition');

    // Verify we're back on Definition tab
    expect(page.url()).toContain('/definition');
  });
});
