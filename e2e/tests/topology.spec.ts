import { test, expect, Page, Locator } from '@playwright/test';
import { dismissConsoleTour, navigateToTopology } from './helpers';

// topology nodes rendered by patternfly react-topology; groups have
// data-type="group" so [data-type="node"] selects only resource nodes
const NODE_SELECTOR = 'g[data-kind="node"][data-type="node"]';

// fixture resources from e2e/manifests/test-resources.yaml, present in the
// operator-generated topology ConfigMap. read-only: filters are client-side.
const GATEWAY_NODE_LABEL = 'kuadrant-test/test-gateway';
const SECOND_GATEWAY_NODE_LABEL = 'kuadrant-test-2/test-gateway-2';
const ROUTE_NODE_LABEL = 'kuadrant-test/test-route';

function nodeByLabel(page: Page, label: string): Locator {
  return page.locator(NODE_SELECTOR).filter({ hasText: label });
}

async function openResourceFilter(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Resource(\s+\d+)?$/ }).click();
}

async function closeFilterMenu(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
}

test.describe('Policy Topology', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissConsoleTour(page);
    await navigateToTopology(page);

    // wait for the graph to render nodes from the topology ConfigMap
    await expect(page.locator('text=Topology View')).toBeVisible({ timeout: 15_000 });
    await expect(nodeByLabel(page, GATEWAY_NODE_LABEL)).toBeVisible({ timeout: 20_000 });
  });

  test('renders the topology graph with fixture resources', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Policy Topology' })).toBeVisible();

    // filter toolbar and control bar are present
    await expect(page.getByRole('button', { name: /^Resource(\s+\d+)?$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom In' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom Out' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fit to Screen' })).toBeVisible();

    // fixture gateway and route nodes are rendered by default
    await expect(nodeByLabel(page, ROUTE_NODE_LABEL)).toBeVisible({ timeout: 20_000 });
    expect(await page.locator(NODE_SELECTOR).count()).toBeGreaterThan(1);
  });

  test('filters nodes by resource type', async ({ page }) => {
    await expect(nodeByLabel(page, ROUTE_NODE_LABEL)).toBeVisible({ timeout: 20_000 });

    // deselect Gateway (selected by default)
    await openResourceFilter(page);
    await page.getByRole('menuitem', { name: 'Gateway', exact: true }).click();
    await closeFilterMenu(page);

    await expect(nodeByLabel(page, GATEWAY_NODE_LABEL)).toBeHidden({ timeout: 15_000 });
    // other resource types remain visible
    await expect(nodeByLabel(page, ROUTE_NODE_LABEL)).toBeVisible();

    // reselect Gateway restores the nodes
    await openResourceFilter(page);
    await page.getByRole('menuitem', { name: 'Gateway', exact: true }).click();
    await closeFilterMenu(page);

    await expect(nodeByLabel(page, GATEWAY_NODE_LABEL)).toBeVisible({ timeout: 15_000 });
  });

  test('clearing all resource filters empties the graph', async ({ page }) => {
    // remove the whole Resource filter group via its close button
    await page
      .getByRole('button', { name: /close label group/i })
      .first()
      .click();

    await expect(page.locator(NODE_SELECTOR)).toHaveCount(0, { timeout: 15_000 });

    // selecting a resource type again restores nodes
    await openResourceFilter(page);
    await page.getByRole('menuitem', { name: 'Gateway', exact: true }).click();
    await closeFilterMenu(page);

    await expect(nodeByLabel(page, GATEWAY_NODE_LABEL)).toBeVisible({ timeout: 15_000 });
  });

  test('filters nodes by namespace', async ({ page }) => {
    // both fixture gateways visible before filtering
    await expect(nodeByLabel(page, SECOND_GATEWAY_NODE_LABEL)).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /^Namespace(\s+\d+)?$/ }).click();
    await page.getByRole('menuitem', { name: 'kuadrant-test', exact: true }).click();

    // only kuadrant-test resources and their connected infrastructure remain
    await expect(nodeByLabel(page, SECOND_GATEWAY_NODE_LABEL)).toBeHidden({ timeout: 15_000 });
    await expect(nodeByLabel(page, GATEWAY_NODE_LABEL)).toBeVisible();
    await expect(nodeByLabel(page, ROUTE_NODE_LABEL)).toBeVisible();
  });

  test('node context menu navigates to the resource details page', async ({ page }) => {
    const gatewayNode = nodeByLabel(page, GATEWAY_NODE_LABEL);
    await gatewayNode.click({ button: 'right' });

    const goToResource = page.getByRole('menuitem', { name: 'Go to Resource' });
    await expect(goToResource).toBeVisible({ timeout: 10_000 });
    await goToResource.click();

    await expect(page).toHaveURL(
      /\/k8s\/ns\/kuadrant-test\/gateway\.networking\.k8s\.io~v1~Gateway\/test-gateway/,
      { timeout: 15_000 },
    );
  });
});
