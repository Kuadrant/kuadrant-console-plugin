import { test, expect } from '@playwright/test';
import { dismissConsoleTour, spaNavigate, TEST_NAMESPACE } from './helpers';

const integrationExtension = process.env.MCP_INSPECTOR_E2E_EXTENSION;
const integrationTool = process.env.MCP_INSPECTOR_E2E_TOOL || 'toystore_greet';
const integrationArgumentLabel = process.env.MCP_INSPECTOR_E2E_ARGUMENT_LABEL || 'Name';
const integrationArgumentValue = process.env.MCP_INSPECTOR_E2E_ARGUMENT_VALUE || 'Ada';
const integrationPrompt = process.env.MCP_INSPECTOR_E2E_PROMPT || 'toystore_greet';
const integrationPromptArgumentLabel = process.env.MCP_INSPECTOR_E2E_PROMPT_ARGUMENT_LABEL || '';
const integrationPromptArgumentValue = process.env.MCP_INSPECTOR_E2E_PROMPT_ARGUMENT_VALUE || 'Ada';
const integrationPromptOutput = process.env.MCP_INSPECTOR_E2E_PROMPT_OUTPUT || 'Say hi to';

async function openInspector(page, namespace: string): Promise<void> {
  await page.goto(`/k8s/ns/${namespace}`);
  await page.waitForLoadState('networkidle');
  await dismissConsoleTour(page);
  await spaNavigate(page, '/mcp-inspector');
}

test.describe('MCP Inspector', () => {
  test('opens from the console and prompts for a gateway', { tag: '@smoke' }, async ({ page }) => {
    await openInspector(page, TEST_NAMESPACE);

    await expect(page.getByRole('heading', { name: 'MCP Inspector' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel('Select an MCP gateway extension')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No connection' })).toBeVisible();
  });

  test('connects to a live gateway and runs a tool', { tag: '@nightly' }, async ({ page }) => {
    test.skip(
      !integrationExtension,
      'Set MCP_INSPECTOR_E2E_EXTENSION=namespace/name to run the live integration journey.',
    );
    const [namespace, extensionName] = integrationExtension!.split('/');
    expect(namespace).toBeTruthy();
    expect(extensionName).toBeTruthy();

    const cspViolations: string[] = [];
    page.on('console', (message) => {
      if (message.text().includes('Content Security Policy violation')) {
        cspViolations.push(message.text());
      }
    });

    await openInspector(page, namespace);
    await page
      .getByLabel('Select an MCP gateway extension')
      .selectOption(`${namespace}/${extensionName}`);

    await expect(page.getByText('Connected', { exact: true })).toBeVisible({ timeout: 20_000 });
    const refreshToolsButton = page.getByRole('button', { name: 'Refresh tools' });
    await refreshToolsButton.click();
    await expect(refreshToolsButton).toBeEnabled();
    await page.getByLabel('Search tools').fill(integrationTool);
    await page.getByRole('option', { name: integrationTool }).click();
    await page.getByLabel(integrationArgumentLabel).fill(integrationArgumentValue);
    await page.getByRole('button', { name: 'Run tool' }).click();

    await expect(page.getByText('Success', { exact: true })).toBeVisible({ timeout: 20_000 });
    const summaryTextCenters = await page
      .locator('.kuadrant-mcp-inspector-page__request-summary > *')
      .evaluateAll((items) =>
        items.map((item) => {
          const range = document.createRange();
          range.selectNodeContents(item);
          const rect = range.getBoundingClientRect();
          return rect.top + rect.height / 2;
        }),
      );
    expect(Math.max(...summaryTextCenters) - Math.min(...summaryTextCenters)).toBeLessThanOrEqual(
      1,
    );
    await expect(page.getByRole('heading', { name: 'JSON-RPC response' })).toBeVisible();

    await page.getByRole('tab', { name: 'Prompts' }).click();
    await page.getByLabel('Search prompts').fill(integrationPrompt);
    await page.getByRole('option', { name: integrationPrompt }).click();
    if (integrationPromptArgumentLabel) {
      await page.getByLabel(integrationPromptArgumentLabel).fill(integrationPromptArgumentValue);
    }
    await page.getByRole('button', { name: 'Generate prompt' }).click();
    await expect(page.getByText(integrationPromptOutput)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^Token count: ~\d+$/)).toBeVisible();
    expect(cspViolations).toEqual([]);
  });
});
