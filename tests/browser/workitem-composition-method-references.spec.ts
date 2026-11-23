import { test, expect } from './fixtures';
import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApplication } from '../../src/server/index';
import { seedCatalog } from '../catalog-fixture';
import type { Definition } from '../../src/shared/records';

let app: Awaited<ReturnType<typeof createApplication>>,
  server: Server,
  root: string,
  url: string,
  itemId: string;
let methodId: string, version: string, otherVersion: string;
const prompts: any[] = [];
const definition = (port: string): Definition => ({
  schemaVersion: 1,
  inputs: ['records'],
  nodes: [
    {
      id: 'keep',
      label: '原值整理',
      kind: 'function',

      operation: 'map',
      functionName: 'identity',
    },
  ],
  edges: [{ from: ['$input', 'records'], to: ['keep', 'input'] }],
  outputs: { [port]: ['keep', 'output'] },
});
test.beforeEach(async () => {
  prompts.length = 0;
  root = await mkdtemp(join(tmpdir(), 'method-reference-browser-'));
  await seedCatalog(root, {
    baseUrl: 'https://fixture.invalid',
    model: 'fixture',
    apiKey: 'fixture-only',
  });
  app = await createApplication({
    dataRoot: root,
    runSession: async (input) => {
      prompts.push(JSON.parse(input.prompt));
      return '已按引用核对合同；尚未执行。';
    },
  });
  const method = await app.work.createWork('整理记录', []);
  methodId = method.id;
  version = await app.flow.saveDraft(method.id, undefined, definition('rows'));
  await app.flow.adopt(method.id, version);
  await app.flow.saveDraft(method.id, version, definition('later_rows'));
  const other = await app.work.createWork('核对记录', []);
  otherVersion = await app.flow.saveDraft(
    other.id,
    undefined,
    definition('checks'),
  );
  await app.flow.adopt(other.id, otherVersion);
  const item = await app.items.create({
    title: '聊天引用验证',
    goal: '人工指导选择方法',
    materials: [],
  });
  itemId = item.id;
  const initialized = await app.app.request(
    `/api/items/${item.id}/workspace/actions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'init' }),
    },
  );
  expect(initialized.ok).toBeTruthy();
  const initialWorkspace = (await initialized.json()) as any;
  await app.files.change(initialWorkspace.work.work.id, (work) => {
    work.messages.push({ id: 'prior-message', role: 'user', text: '原始会话' });
  });
  server = serve({
    fetch: app.app.fetch,
    hostname: '127.0.0.1',
    port: 0,
  }) as Server;
  if (!server.listening)
    await new Promise<void>((r) => server.once('listening', r));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterEach(async () => {
  app.batches.close();
  app.runs.close();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  await rm(root, { recursive: true, force: true });
});

for (const width of [1440, 1024])
  test(`slash补全、固定版本引用、预览、会话草稿和发送 ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    const dir = resolve(
      process.env.FLOWCRAFT_EVIDENCE_DIR ||
        'test-results/method-reference-evidence',
    );
    await mkdir(dir, { recursive: true });
    await page.goto(`${url}/items/${itemId}?tab=results`);
    const composer = page.locator('.composer'),
      input = page.getByRole('textbox', { name: '对话修改' });
    await expect(input).toBeVisible();
    await input.fill('/');
    const commands = page.getByRole('combobox', { name: '搜索聊天命令' });
    await expect(commands).toBeVisible();
    await commands.fill('pipeline');
    await commands.press('Enter');
    const search = page.getByRole('combobox', { name: '搜索可引用的流水线' });
    await expect(search).toBeFocused();
    await search.fill('整理记录');
    await page.screenshot({
      path: join(dir, `command-completion-${width}.png`),
    });
    await page.getByRole('option', { name: /整理记录.*采用版/ }).click();
    await expect(input).toHaveValue('');
    const reference = composer.locator(`button[title="固定版本 ${version}"]`);
    await expect(reference).toBeVisible();
    await reference.click();
    const preview = page.getByRole('dialog', { name: '整理记录', exact: true });
    await expect(preview).toBeVisible();
    await expect(
      preview.getByText(version.slice(0, 8), { exact: true }),
    ).toBeVisible();
    await preview.getByRole('button', { name: '关闭', exact: true }).click();
    await input.fill('按引用的方法检查输入，不运行。');
    await page.reload();
    await expect(input).toHaveValue('按引用的方法检查输入，不运行。');
    await expect(reference).toBeVisible();
    await page.getByRole('button', { name: '新建会话', exact: true }).click();
    await expect(input).toHaveValue('');
    await expect(composer.getByLabel('引用的流水线')).toHaveCount(0);
    await input.fill('/pipeline 核对');
    await expect(search).toBeVisible();
    await page.getByRole('option', { name: /核对记录.*采用版/ }).click();
    await input.fill('第二个会话的草稿');
    await page.getByRole('button', { name: '切换会话', exact: true }).click();
    await page.getByRole('menuitemradio', { name: /原始会话/ }).click();
    await expect(input).toHaveValue('按引用的方法检查输入，不运行。');
    await expect(reference).toBeVisible();
    await expect(
      composer.locator(`button[title="固定版本 ${otherVersion}"]`),
    ).toHaveCount(0);
    // Reject before recording a turn: draft text and its references must survive.
    await page.route(
      `**/api/items/${itemId}/workspace/actions`,
      async (route) => {
        if (route.request().postDataJSON()?.action === 'assistant')
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ error: '引用校验暂时失败' }),
          });
        else await route.continue();
      },
    );
    await page.getByRole('button', { name: '发送修改', exact: true }).click();
    await expect(
      page.getByText('引用校验暂时失败', { exact: true }).first(),
    ).toBeVisible();
    await expect(input).toHaveValue('按引用的方法检查输入，不运行。');
    await expect(reference).toBeVisible();
    await page.unroute(`**/api/items/${itemId}/workspace/actions`);
    await page.getByRole('button', { name: '发送修改', exact: true }).click();
    await expect.poll(() => prompts.length).toBe(1);
    expect(
      prompts[0].referencedMethods.map((m: any) => [m.workId, m.definitionId]),
    ).toEqual([[methodId, version]]);
    await expect(
      page.getByText('已按引用核对合同；尚未执行。', { exact: true }),
    ).toBeVisible();
    await expect(composer.getByLabel('引用的流水线')).toHaveCount(0);
    await expect(
      page
        .locator('.user-message')
        .locator(`button[title="固定版本 ${version}"]`),
    ).toBeVisible();
    await page.screenshot({ path: join(dir, `references-${width}.png`) });
  });
