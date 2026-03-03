import { test, expect } from '@playwright/test';
import {
  impersonateUser,
  stopImpersonation,
  navigateToPolicies,
  navigateToOverview,
  navigateToTopology,
  waitForPermissionsLoaded,
} from './helpers';

// test-dev: httproutes CRUD + gateways read in kuadrant-test namespace only.
// no policy access at all.
test.describe('RBAC - test-dev persona', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await impersonateUser(page, 'test-dev');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('policies page shows no-permission view', async ({ page }) => {
    await navigateToPolicies(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view Policies'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('create policy button is hidden', async ({ page }) => {
    await navigateToPolicies(page);
    await waitForPermissionsLoaded(page);

    const createButton = page.locator('button:has-text("Create Policy")');
    await expect(createButton).toBeHidden();
  });

  // overview checks RBAC against 'default' namespace (resolves #ALL_NS# to default).
  // namespace-scoped users only have permissions in kuadrant-test, so all overview
  // cards show Access Denied. this is a known limitation - the overview has no
  // namespace picker.
  test('overview shows Access Denied for all cards (namespace-scoped user)', async ({ page }) => {
    await navigateToOverview(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view Policies'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('text=You do not have permission to view Gateways'),
    ).toBeVisible();
    await expect(
      page.locator('text=You do not have permission to view HTTPRoutes'),
    ).toBeVisible();
  });

  test('topology page shows no-permission view', async ({ page }) => {
    await navigateToTopology(page);
    await expect(
      page.locator('text=You do not have permission to view Policy Topology'),
    ).toBeVisible({ timeout: 15_000 });
  });
});

// test-dev: no policy access, so kebab doesn't apply.
// test-viewer has read-only, so kebab edit/delete should be disabled.
// test-devops has CRUD, so kebab edit/delete should be enabled.
// test-admin has CRUD, so kebab edit/delete should be enabled.
// these tests use a test-auth-policy fixture created by setup.sh.
test.describe('RBAC - kebab menu (edit/delete)', () => {
  const openKebabForTestPolicy = async (page) => {
    await navigateToPolicies(page);
    await waitForPermissionsLoaded(page);

    // go to Auth tab where our test fixture lives
    await page.locator('[data-test-id="horizontal-link-Auth"]').click();
    await page.waitForLoadState('networkidle');

    // wait for the test policy row to appear
    const row = page.locator('tr:has-text("test-auth-policy")');
    await expect(row).toBeVisible({ timeout: 15_000 });

    // click the kebab toggle
    const kebab = row.locator('[aria-label="kebab dropdown toggle"]');
    await kebab.click();
  };

  test('read-only user sees disabled edit and delete', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await impersonateUser(page, 'test-viewer');

    await openKebabForTestPolicy(page);

    const editItem = page.locator('[role="menuitem"]:has-text("Edit")');
    await expect(editItem).toBeVisible();
    expect(await editItem.getAttribute('aria-disabled')).not.toBeNull();

    const deleteItem = page.locator('[role="menuitem"]:has-text("Delete")');
    await expect(deleteItem).toBeVisible();
    expect(await deleteItem.getAttribute('aria-disabled')).not.toBeNull();

    await stopImpersonation(page);
  });

  test('CRUD user sees enabled edit and delete', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await impersonateUser(page, 'test-devops');

    await openKebabForTestPolicy(page);

    const editItem = page.locator('[role="menuitem"]:has-text("Edit")');
    await expect(editItem).toBeVisible();
    expect(await editItem.getAttribute('aria-disabled')).toBeNull();

    const deleteItem = page.locator('[role="menuitem"]:has-text("Delete")');
    await expect(deleteItem).toBeVisible();
    expect(await deleteItem.getAttribute('aria-disabled')).toBeNull();

    await stopImpersonation(page);
  });

  test('admin user sees enabled edit and delete', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await impersonateUser(page, 'test-admin');

    await openKebabForTestPolicy(page);

    const editItem = page.locator('[role="menuitem"]:has-text("Edit")');
    await expect(editItem).toBeVisible();
    expect(await editItem.getAttribute('aria-disabled')).toBeNull();

    const deleteItem = page.locator('[role="menuitem"]:has-text("Delete")');
    await expect(deleteItem).toBeVisible();
    expect(await deleteItem.getAttribute('aria-disabled')).toBeNull();

    await stopImpersonation(page);
  });
});

// test-viewer: read-only on auth + ratelimit policies, gateways, httproutes
// in kuadrant-test namespace. can list but not create/update/delete.
test.describe('RBAC - test-viewer persona', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await impersonateUser(page, 'test-viewer');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('policies page shows Auth and RateLimit tabs', async ({ page }) => {
    await navigateToPolicies(page);
    await waitForPermissionsLoaded(page);

    await expect(page.locator('text=All Policies')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-test-id="horizontal-link-Auth"]')).toBeVisible();
    await expect(page.locator('[data-test-id="horizontal-link-RateLimit"]')).toBeVisible();
  });

  // DNS/TLS tabs are visible in admin perspective regardless of RBAC.
  // only the tab content is gated (shows no-permission message).
  // the "All Policies" view correctly filters by RBAC, but individual tabs don't.
  test('DNS and TLS tabs are visible but content is permission-gated', async ({ page }) => {
    await navigateToPolicies(page);
    await waitForPermissionsLoaded(page);

    await expect(page.locator('[data-test-id="horizontal-link-DNS"]')).toBeVisible();
    await page.locator('[data-test-id="horizontal-link-DNS"]').click();
    await expect(
      page.locator('text=You do not have permission to view this resource'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('create policy button is disabled (read-only)', async ({ page }) => {
    await navigateToPolicies(page);
    await waitForPermissionsLoaded(page);

    const createButton = page.locator('button:has-text("Create Policy")');
    await expect(createButton).toBeVisible();
    await expect(createButton).toBeDisabled();
  });

  test('overview shows Access Denied for all cards (namespace-scoped user)', async ({ page }) => {
    await navigateToOverview(page);
    await waitForPermissionsLoaded(page);

    await expect(
      page.locator('text=You do not have permission to view Policies'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('text=You do not have permission to view Gateways'),
    ).toBeVisible();
    await expect(
      page.locator('text=You do not have permission to view HTTPRoutes'),
    ).toBeVisible();
  });
});

// test-devops: CRUD on authpolicies + ratelimitpolicies, read on httproutes + gateways.
// all in kuadrant-test namespace only.
test.describe('RBAC - test-devops persona', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await impersonateUser(page, 'test-devops');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('policies page shows AuthPolicy and RateLimitPolicy tabs', async ({ page }) => {
    await navigateToPolicies(page);
    await waitForPermissionsLoaded(page);

    await expect(page.locator('text=All Policies')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-test-id="horizontal-link-Auth"]')).toBeVisible();
    await expect(page.locator('[data-test-id="horizontal-link-RateLimit"]')).toBeVisible();
  });

  test('DNS and TLS tabs are visible but content is permission-gated', async ({ page }) => {
    await navigateToPolicies(page);
    await waitForPermissionsLoaded(page);

    await expect(page.locator('[data-test-id="horizontal-link-DNS"]')).toBeVisible();
    await page.locator('[data-test-id="horizontal-link-DNS"]').click();
    await expect(
      page.locator('text=You do not have permission to view this resource'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('create policy dropdown shows AuthPolicy enabled, DNSPolicy disabled', async ({ page }) => {
    await navigateToPolicies(page);
    await waitForPermissionsLoaded(page);

    const createButton = page.locator('button:has-text("Create Policy")');
    await expect(createButton).toBeVisible();
    await expect(createButton).toBeEnabled();
    await createButton.click();

    // has create on authpolicies
    const authItem = page.getByRole('menuitem', { name: 'AuthPolicy', exact: true });
    await expect(authItem).toBeVisible();
    expect(await authItem.getAttribute('aria-disabled')).toBeNull();

    // no create on dnspolicies - item should be disabled or absent
    const dnsItem = page.getByRole('menuitem', { name: 'DNSPolicy', exact: true });
    const dnsVisible = await dnsItem.isVisible();
    if (dnsVisible) {
      expect(await dnsItem.getAttribute('aria-disabled')).not.toBeNull();
    } else {
      await expect(dnsItem).toBeHidden();
    }
  });

  test('overview shows Access Denied for all cards (namespace-scoped user)', async ({ page }) => {
    await navigateToOverview(page);
    await waitForPermissionsLoaded(page);

    // even though test-devops has policy list in kuadrant-test, the overview
    // checks against 'default' namespace
    await expect(
      page.locator('text=You do not have permission to view Gateways'),
    ).toBeVisible({ timeout: 15_000 });
  });
});

// test-admin: full CRUD on all kuadrant + gateway API resources + configmap read.
// uses a ClusterRole so works across all namespaces including default.
test.describe('RBAC - test-admin persona', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await impersonateUser(page, 'test-admin');
  });

  test.afterEach(async ({ page }) => {
    await stopImpersonation(page);
  });

  test('policies page shows all policy tabs', async ({ page }) => {
    await navigateToPolicies(page);
    await waitForPermissionsLoaded(page);

    await expect(page.locator('text=All Policies')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-test-id="horizontal-link-Auth"]')).toBeVisible();
    await expect(page.locator('[data-test-id="horizontal-link-RateLimit"]')).toBeVisible();
    await expect(page.locator('[data-test-id="horizontal-link-DNS"]')).toBeVisible();
    await expect(page.locator('[data-test-id="horizontal-link-TLS"]')).toBeVisible();
  });

  test('create policy dropdown has all policies enabled', async ({ page }) => {
    await navigateToPolicies(page);
    await waitForPermissionsLoaded(page);

    const createButton = page.locator('button:has-text("Create Policy")');
    await expect(createButton).toBeVisible();
    await expect(createButton).toBeEnabled();
    await createButton.click();

    for (const policy of ['AuthPolicy', 'RateLimitPolicy', 'DNSPolicy', 'TLSPolicy']) {
      const item = page.getByRole('menuitem', { name: policy, exact: true });
      await expect(item).toBeVisible();
      expect(await item.getAttribute('aria-disabled')).toBeNull();
    }
  });

  test('overview shows all cards with create buttons enabled', async ({ page }) => {
    await navigateToOverview(page);
    await waitForPermissionsLoaded(page);

    // gateway card with enabled create
    await expect(page.locator('text=Gateways - Traffic Analysis')).toBeVisible({ timeout: 15_000 });
    const createGateway = page.locator('button:has-text("Create Gateway")');
    await expect(createGateway).toBeVisible();
    expect(await createGateway.getAttribute('aria-disabled')).toBeNull();

    // httproute card with enabled create
    const createRoute = page.locator('button:has-text("Create HTTPRoute")');
    await expect(createRoute).toBeVisible();
    expect(await createRoute.getAttribute('aria-disabled')).toBeNull();

    // policies card visible (not access denied)
    await expect(
      page.locator('text=You do not have permission to view Policies'),
    ).not.toBeVisible();
  });

  test('overview create policy dropdown items are all enabled', async ({ page }) => {
    await navigateToOverview(page);
    await waitForPermissionsLoaded(page);

    const createButton = page.locator('button:has-text("Create Policy")');
    await expect(createButton).toBeVisible();
    await createButton.click();

    for (const policy of ['AuthPolicy', 'RateLimitPolicy', 'DNSPolicy', 'TLSPolicy']) {
      const item = page.getByRole('menuitem', { name: policy, exact: true });
      await expect(item).toBeVisible();
      expect(await item.getAttribute('aria-disabled')).toBeNull();
    }
  });

  test('topology page is accessible', async ({ page }) => {
    await navigateToTopology(page);
    await expect(
      page.locator('text=You do not have permission to view Policy Topology'),
    ).not.toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=Topology View')).toBeVisible({ timeout: 15_000 });
  });
});
