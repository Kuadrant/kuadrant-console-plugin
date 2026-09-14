import { test, expect, Page, Locator } from '@playwright/test';
import { dismissConsoleTour } from './helpers';

// Exercise the real Console layout with deterministic discovery and MCP replies.
// These checks do not depend on the demo servers or execute live tools.
async function mockInspector(page: Page) {
  const extension = {
    apiVersion: 'mcp.kuadrant.io/v1',
    kind: 'MCPGatewayExtension',
    metadata: { name: 'inspector-ui', namespace: 'default', uid: 'inspector-ui' },
    spec: { targetRef: { name: 'gateway', sectionName: 'mcp' }, publicHost: 'mcp.example.test' },
    status: { conditions: [{ type: 'Ready', status: 'True' }] },
  };
  await page.route('**/api/kubernetes/apis/mcp.kuadrant.io/v1/**', (route) =>
    route.fulfill({
      json: {
        apiVersion: 'mcp.kuadrant.io/v1',
        kind: 'List',
        metadata: { resourceVersion: '1' },
        items: route.request().url().includes('mcpgatewayextensions') ? [extension] : [],
      },
    }),
  );
  await page.routeWebSocket('**/api/kubernetes/apis/mcp.kuadrant.io/v1/**', () => {
    // Keep the fixture stable rather than forwarding real watch updates.
  });
  await page.route('**/api/proxy/plugin/kuadrant-console-plugin/backend/api/mcp/**', (route) => {
    const request = route.request().postDataJSON();
    const results = {
      initialize: {
        protocolVersion: '2025-11-25',
        capabilities: { tools: {}, prompts: {} },
        serverInfo: { name: 'ui-fixture', version: '1' },
      },
      'tools/list': {
        tools: ['greet', 'calculate'].map((name) => ({
          name,
          description: `Example ${name} tool`,
          inputSchema: { type: 'object', properties: {} },
        })),
      },
      'prompts/list': {
        prompts: ['greet', 'summarise'].map((name) => ({
          name,
          description: `Example ${name} prompt`,
        })),
      },
      'tools/call': { content: [{ type: 'text', text: 'Hello, Ada!' }] },
      'prompts/get': {
        messages: [{ role: 'user', content: { type: 'text', text: 'Say hi to Ada' } }],
      },
    };
    return request.id === undefined
      ? route.fulfill({ status: 202 })
      : route.fulfill({
          json: { jsonrpc: '2.0', id: request.id, result: results[request.method] },
        });
  });
  await page.goto('/mcp-inspector');
  await dismissConsoleTour(page);
  await expect(page.getByRole('heading', { name: 'MCP Inspector', exact: true })).toBeVisible();
  await page.getByLabel('MCP protocol', { exact: true }).selectOption('2025-11-25');
  await page.getByLabel('Select an MCP gateway extension').selectOption('default/inspector-ui');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
}

async function contentGap(output: Locator, content: Locator) {
  const tabs = await output.getByRole('tablist').boundingBox();
  const body = await content.filter({ visible: true }).boundingBox();
  expect(tabs).not.toBeNull();
  expect(body).not.toBeNull();
  return body!.y - (tabs!.y + tabs!.height);
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 768, 390]) {
    test.describe(`${theme}, ${width}px`, () => {
      test.use({ viewport: { width, height: 1000 }, colorScheme: theme });
      test.beforeEach(async ({ page }) => {
        await page.addInitScript((selectedTheme) => {
          localStorage.setItem('bridge/theme', selectedTheme);
        }, theme);
        await mockInspector(page);
      });

      test(
        'connection controls and searchable selectors',
        { tag: '@nightly' },
        async ({ page }, testInfo) => {
          const gateway = await page.getByLabel('Select an MCP gateway extension').boundingBox();
          const protocol = await page.getByLabel('MCP protocol', { exact: true }).boundingBox();
          const endpoint = await page
            .locator('.kuadrant-mcp-inspector-page__endpoint')
            .boundingBox();
          const protocolHint = await page
            .getByText('Changing protocol reconnects and may show different tools.', {
              exact: true,
            })
            .boundingBox();
          for (const [control, helper] of [
            [gateway, endpoint],
            [protocol, protocolHint],
          ]) {
            expect(control).not.toBeNull();
            expect(helper).not.toBeNull();
            expect.soft(Math.abs(helper!.x - control!.x)).toBeLessThanOrEqual(1);
            const gap = helper!.y - (control!.y + control!.height);
            expect.soft(gap).toBeGreaterThanOrEqual(0);
            expect.soft(gap).toBeLessThanOrEqual(8);
            expect.soft(helper!.width).toBeLessThanOrEqual(control!.width + 1);
          }
          if (width === 1440) {
            expect.soft(Math.abs(gateway!.y - protocol!.y)).toBeLessThanOrEqual(1);
            expect.soft(protocol!.x).toBeGreaterThan(gateway!.x + gateway!.width);
          }
          for (const kind of ['Tool', 'Prompt']) {
            await page.getByRole('tab', { name: `${kind}s`, exact: true }).click();
            const selector = page.getByRole('button', { name: `${kind} selector`, exact: true });
            // Click the main label area, not the chevron.
            await selector.click({ position: { x: 20, y: 16 } });
            const search = page.getByLabel(`Search ${kind.toLowerCase()}s`, { exact: true });
            await expect(search).toBeFocused();
            await expect(page.getByRole('option', { name: 'greet', exact: true })).toBeVisible();
            await search.fill('no-match');
            await expect(
              page.getByText(`No ${kind.toLowerCase()}s found`, { exact: true }),
            ).toBeVisible();
            await search.fill('greet');
            await search.press('ArrowDown');
            await search.press('Enter');
            await expect(page.getByRole('heading', { name: 'greet', exact: true })).toBeVisible();
            await expect(selector).toBeFocused();
            await expect(selector).toContainText('greet');
            await selector.click();
            await expect(
              page.locator(`#mcp-inspector-${kind.toLowerCase()}-options`).getByRole('option'),
            ).toHaveCount(2);
            await search.press('Escape');
            await expect(selector).toBeFocused();
            await selector.press('Space');
            await expect(search).toBeFocused();
            await expect(selector).toHaveAttribute('aria-expanded', 'true');
            await expect(page.getByRole('option', { name: 'greet', exact: true })).toBeVisible();
            await testInfo.attach(`${kind.toLowerCase()}-menu`, {
              body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
              contentType: 'image/png',
            });
            await page.getByRole('heading', { name: 'MCP Inspector', exact: true }).click();
            await expect(search).not.toBeVisible();
            await page
              .getByRole('button', { name: `Clear ${kind.toLowerCase()} selection` })
              .click();
            await expect(page.getByRole('heading', { name: 'greet', exact: true })).toHaveCount(0);
          }
        },
      );

      test(
        'output spacing stays consistent across tabs and results',
        { tag: '@nightly' },
        async ({ page }, testInfo) => {
          const output = page.locator('.kuadrant-mcp-inspector-page__output');
          const gaps: number[] = [];
          gaps.push(await contentGap(output, output.getByText('No results', { exact: true })));
          await page.getByRole('button', { name: 'Tool selector', exact: true }).click();
          await page.getByRole('option', { name: 'greet', exact: true }).click();
          await page.getByRole('button', { name: 'Run tool', exact: true }).click();
          const request = output.getByRole('heading', { name: 'JSON-RPC request' });
          await expect(request).toBeVisible();
          gaps.push(await contentGap(output, request));
          await output.getByRole('tab', { name: 'Server result', exact: true }).click();
          gaps.push(await contentGap(output, output.locator('pre:visible')));
          await page.getByRole('tab', { name: 'Prompts', exact: true }).click();
          gaps.push(await contentGap(output, output.getByText('No results', { exact: true })));
          await page.getByRole('button', { name: 'Prompt selector', exact: true }).click();
          await page.getByRole('option', { name: 'greet', exact: true }).click();
          await page.getByRole('button', { name: 'Generate prompt', exact: true }).click();
          await expect(output.getByText('Say hi to Ada', { exact: true })).toBeVisible();
          await output.getByRole('tab', { name: 'Console', exact: true }).click();
          gaps.push(await contentGap(output, request));
          for (const gap of gaps) expect.soft(gap).toBeGreaterThanOrEqual(16);
          expect.soft(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
          await expect(page.locator('.kuadrant-mcp-inspector-page')).toBeVisible();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          ).toBe(true);
          await testInfo.attach('inspector-output', {
            body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
            contentType: 'image/png',
          });
        },
      );
    });
  }
}
