import { test, expect } from './fixtures';
import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApplication } from '../../src/server/index';
import { seedCatalog } from '../catalog-fixture';
import { interfaceFixture } from '../interface-fixture';

let app: Awaited<ReturnType<typeof createApplication>>,
  server: Server,
  root: string,
  url: string;
let scenario: Awaited<ReturnType<typeof interfaceFixture>>;
const sessions: { dir?: string; instruction: string; views: number }[] = [];
const evidence = resolve(
  process.env.FLOWCRAFT_EVIDENCE_DIR || 'test-results/conversation-closure',
);
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'conversation-closure-'));
  sessions.length = 0;
  await seedCatalog(root, {
    baseUrl: 'https://fixture.invalid',
    model: 'fixture',
    apiKey: 'fixture-not-real',
  });
  app = await createApplication({
    dataRoot: root,
    runSession: async (input) => {
      const prompt = JSON.parse(input.prompt);
      const call = async (name: string, args: unknown) => {
        const tool = input.tools.find((tool) => tool.name === name)!;
        const r = (await tool.execute(
          'closure-fixture',
          args as never,
          input.signal,
          undefined as never,
          undefined as never,
        )) as any;
        return JSON.parse(r.content[0].text);
      };
      const ws = await call('inspect_work_item', {});
      sessions.push({
        dir: input.sessionDir,
        instruction: prompt.instruction,
        views: ws.uiProgram ? 1 : 0,
      });
      if (prompt.instruction.includes('完善并保存可操作业务界面')) {
        await call('save_ui_program', {
          baseRevision: ws.item.revision,
          source: scenario.source,
        });
        return '已按当前处理方法保存业务界面，未运行。';
      }
      return `已读取同一工作项的${ws.uiProgram ? 1 : 0}个界面，保留材料与成果：${prompt.instruction}`;
    },
  });
  scenario = await interfaceFixture(app);
  server = serve({
    fetch: app.app.fetch,
    hostname: '127.0.0.1',
    port: 0,
  }) as Server;
  if (!server.listening)
    await new Promise<void>((resolve) => server.once('listening', resolve));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await mkdir(evidence, { recursive: true });
});
test.afterEach(async () => {
  app.runs.close();
  app.batches.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
});

for (const width of [1440, 1024])
  test(`多会话保留草稿与业务状态，页面跨会话推进到验收 ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    await page.goto(`${url}/items/${scenario.item.id}?tab=results`);
    const composer = page.locator('.composer textarea');
    await composer.fill('主会话核对状态');
    await composer.press('Control+Enter');
    await expect(page.locator('.thread')).toContainText(
      '保留材料与成果：主会话核对状态',
    );
    await composer.fill('主会话未发送草稿');
    await page.getByRole('button', { name: '新建会话', exact: true }).click();
    await expect(composer).toHaveValue('');
    await expect(page.locator('.thread')).not.toContainText(
      '保留材料与成果：主会话核对状态',
    );
    await composer.fill('第二会话未发送草稿');
    await page.reload();
    await expect(composer).toHaveValue('第二会话未发送草稿');
    await page.getByRole('button', { name: '切换会话', exact: true }).click();
    await page.screenshot({
      path: join(evidence, `conversation-history-${width}.png`),
    });
    await page.getByRole('menuitemradio', { name: /主会话核对状态/ }).click();
    await expect(composer).toHaveValue('主会话未发送草稿');
    await expect(page.locator('.thread')).toContainText(
      '保留材料与成果：主会话核对状态',
    );
    await page.getByRole('button', { name: '切换会话', exact: true }).click();
    await page.getByRole('menuitemradio', { name: /新会话 2/ }).click();
    await expect(composer).toHaveValue('第二会话未发送草稿');
    await composer.fill('第二会话核对当前界面');
    await composer.press('Control+Enter');
    await expect(page.locator('.thread')).toContainText(
      '保留材料与成果：第二会话核对当前界面',
    );
    expect(sessions[0].dir).not.toBe(sessions[1].dir);
    expect(sessions[1].views).toBe(1);
    expect(sessions[0].dir).not.toBe(sessions[1].dir);
    await page.screenshot({
      path: join(evidence, `conversations-${width}.png`),
    });
  });

test('旧会话发送回执迟到，不清空新会话草稿或撤回会话清单', async ({ page }) => {
  let release!: () => void, captured!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const intercepted = new Promise<void>((resolve) => {
    captured = resolve;
  });
  await page.route('**/workspace/actions', async (route) => {
    if (route.request().postDataJSON().action !== 'assistant')
      return route.continue();
    const response = await route.fetch();
    captured();
    await held;
    await route.fulfill({ response });
  });
  try {
    await page.goto(`${url}/items/${scenario.item.id}?tab=results`);
    const composer = page.locator('.composer textarea');
    await composer.fill('回执暂时未到的主会话');
    await composer.press('Control+Enter');
    await intercepted;
    await page.getByRole('button', { name: '新建会话', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '切换会话', exact: true }),
    ).toContainText('新会话 2');
    await expect(composer).toBeEnabled();
    await composer.fill('新会话独立草稿不能被清除');
    release();
    await expect
      .poll(() =>
        page.evaluate(
          (id) =>
            JSON.parse(
              sessionStorage.getItem(`flowcraft.item-conversations.${id}`) ||
                '{}',
            ).drafts?.main,
          scenario.item.id,
        ),
      )
      .toBe('');
    await expect(composer).toHaveValue('新会话独立草稿不能被清除');
    await page.getByRole('button', { name: '切换会话', exact: true }).click();
    await expect(page.getByRole('menuitemradio')).toHaveCount(2);
  } finally {
    release();
  }
});
