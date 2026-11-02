import { test, expect } from './fixtures';
import {
  businessStorageVersion,
  businessStorageVersionKey,
} from '../../src/client/state/business-storage';
import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApplication } from '../../src/server/index';
import type { WorkItemView } from '../../src/shared/records';
import { seedCatalog } from '../catalog-fixture';

let app: Awaited<ReturnType<typeof createApplication>>;
let server: Server;
let dataRoot: string;
let url: string;
let item: WorkItemView;
const evidence = resolve(
  process.env.FLOWCRAFT_EVIDENCE_DIR || 'test-results/navigation-evidence',
);
test.beforeEach(async () => {
  dataRoot = await mkdtemp(join(tmpdir(), 'flowcraft-navigation-'));
  await seedCatalog(dataRoot, {
    baseUrl: 'http://fixture.invalid',
    model: 'navigation-fixture',
    apiKey: 'fixture-only',
  });
  app = await createApplication({ dataRoot });
  server = serve({
    fetch: app.app.fetch,
    hostname: '127.0.0.1',
    port: 0,
  }) as Server;
  if (!server.listening)
    await new Promise<void>((done) => server.once('listening', done));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const response = await app.app.request('/api/items', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: '导航核查：整理已提供材料',
      goal: '核对输入并保留来源',
      materials: ['本项原始材料'],
      criteria: [],
    }),
  });
  expect(response.ok).toBeTruthy();
  item = (await response.json()) as WorkItemView;
  const initialized = await app.app.request(
    `/api/items/${item.id}/workspace/actions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'init' }),
    },
  );
  expect(initialized.ok).toBeTruthy();
  const method = await app.work.createWork('按明确输入整理材料', []);
  await app.work.rename(method.id, '整理材料');
  await mkdir(evidence, { recursive: true });
});
test.afterEach(async () => {
  app.batches.close();
  app.runs.close();
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  await rm(dataRoot, { recursive: true, force: true });
});
test('首次工作区读取失败后自动恢复，详情不额外拉取整份工作项', async ({
  page,
}) => {
  let attempts = 0;
  const itemReads: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === `/api/items/${item.id}`)
      itemReads.push(request.url());
  });
  await page.route(`**/api/items/${item.id}/workspace`, async (route) => {
    if (++attempts <= 2)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: '暂时不可用' }),
      });
    else await route.continue();
  });
  await page.goto(`${url}/items/${item.id}?tab=results`);
  await expect(
    page.getByRole('heading', { name: item.title, exact: true }),
  ).toBeVisible();
  expect(attempts).toBeGreaterThan(2);
  expect(itemReads).toEqual([]);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('工作项不订阅隐藏流水线，未变刷新无正文，实际消息保存仍刷新', async ({
  page,
}) => {
  const method = (await app.work.listWorks()).works[0];
  await page.addInitScript(
    ({ method, version, versionKey }) => {
      localStorage.setItem(versionKey, version);
      localStorage.setItem(
        'dynamic-flow.opened-works',
        JSON.stringify([method]),
      );
      localStorage.setItem('dynamic-flow.work', method.id);
    },
    {
      method,
      version: businessStorageVersion,
      versionKey: businessStorageVersionKey,
    },
  );
  const requests: string[] = [],
    closed: string[] = [];
  page.on('requestfinished', (r) => closed.push(r.url()));
  page.on('requestfailed', (r) => closed.push(r.url()));
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(`${url}/items/${item.id}?tab=results`);
  await expect(
    page.getByRole('heading', { name: item.title, exact: true }),
  ).toBeVisible();
  const unchanged = await page.waitForResponse(
    (r) =>
      r.url().endsWith(`/items/${item.id}/workspace`) && r.status() === 304,
  );
  const conditional = await page.evaluate(
    async ({ url, etag }) => {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { 'If-None-Match': etag! },
      });
      return { status: response.status, text: await response.text() };
    },
    { url: unchanged.url(), etag: unchanged.headers()['etag'] },
  );
  expect(conditional).toEqual({ status: 304, text: '' });
  expect(
    requests.filter((raw) => {
      const u = new URL(raw);
      return (
        u.pathname === `/api/works/${method.id}/events` ||
        (u.pathname === `/api/works/${method.id}` &&
          u.searchParams.get('view') !== 'header')
      );
    }),
  ).toEqual([]);
  const ws = (await (
    await app.app.request(`/api/items/${item.id}/workspace`)
  ).json()) as any;
  await app.files.change(ws.work.work.id, (w) => {
    w.messages.push({
      id: 'perf-message',
      role: 'assistant',
      text: '性能验证：保存仍会刷新',
      activities: [
        {
          id: 'perf-tool',
          toolCallId: 'perf-tool',
          toolName: 'inspect_result',
          status: 'completed',
          args: { large: '完整参数' },
          result: { evidence: '完整结果' },
        },
      ],
    });
  });
  await expect(
    page.getByText('性能验证：保存仍会刷新', { exact: true }),
  ).toBeVisible();
  const activity = page.locator('.assistant-activities').last();
  await expect(activity.locator('pre')).toHaveCount(0);
  await activity.locator(':scope > summary').click();
  await expect(activity.locator('.assistant-activity')).toHaveCount(1);
  await expect(activity.locator('pre')).toHaveCount(0);
  await activity.locator('.assistant-activity > summary').click();
  await expect(activity.locator('pre')).toContainText('完整参数');
  await page
    .getByRole('navigation', { name: '已打开的流水线' })
    .getByRole('link', { name: method.title!, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/methods/${method.id}`));
  await expect
    .poll(() => requests.some((u) => u.includes(`/works/${method.id}/events`)))
    .toBe(true);
  const closedBefore = closed.filter((u) =>
    u.includes(`/works/${method.id}/events`),
  ).length;
  await page
    .getByRole('navigation', { name: '应用导航' })
    .getByRole('link', { name: '首页', exact: true })
    .click();
  await expect(page).toHaveURL(url + '/');
  await expect
    .poll(
      () =>
        closed.filter((u) => u.includes(`/works/${method.id}/events`)).length,
    )
    .toBeGreaterThan(closedBefore);
});
for (const width of [1440, 1024])
  test(`浏览器导航：三入口、后退前进、刷新与来源 ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url);
    await expect(
      page.getByRole('heading', { name: '首页', exact: true }),
    ).toBeVisible();
    const roots = page.getByRole('navigation', { name: '应用导航' });
    await expect(
      roots.getByRole('link', { name: '首页', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('textbox', { name: '工作需求' })).toBeVisible();
    await page.screenshot({
      path: join(evidence, `navigation-home-${width}.png`),
    });
    await roots.getByRole('link', { name: '工作项', exact: true }).click();
    await expect(page).toHaveURL(url + '/items');
    await page
      .getByRole('textbox', { name: '搜索工作项', exact: true })
      .fill('导航核查');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(
      page.getByRole('link', { name: `打开工作项 ${item.key}`, exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: join(evidence, `navigation-items-${width}.png`),
    });
    await page
      .getByRole('link', { name: `打开工作项 ${item.key}`, exact: true })
      .click();
    await expect(page).toHaveURL(url + `/items/${item.id}`);
    await page.getByRole('tab', { name: '输入', exact: true }).click();
    await expect(page).toHaveURL(url + `/items/${item.id}?tab=inputs`);
    await page.getByRole('tab', { name: '记录', exact: true }).click();
    await page.goBack();
    await expect(
      page.getByRole('tab', { name: '输入', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL(url + '/items');
    await expect(
      page.getByRole('textbox', { name: '搜索工作项', exact: true }),
    ).toHaveValue('导航核查');
    await page.goForward();
    await page.goForward();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: item.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('tab', { name: '输入', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await page.goForward();
    await expect(
      page.getByRole('tab', { name: '记录', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await page.goBack();
    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL(url + '/items');
    // A refresh resets component-local filters; restoring list after a normal
    // detail visit must preserve them without pretending a refresh persisted them.
    await page
      .getByRole('textbox', { name: '搜索工作项', exact: true })
      .fill('导航核查');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await page
      .getByRole('link', { name: `打开工作项 ${item.key}`, exact: true })
      .click();
    await page.getByRole('button', { name: '工作项更多操作' }).click();
    await page
      .getByRole('menuitem', { name: '在方法工作区打开', exact: true })
      .click();
    await expect(page).toHaveURL(/\/methods\/.+fromItem=/);
    await page.getByRole('tab', { name: '运行结果', exact: false }).click();
    await expect(page).toHaveURL(/tab=results/);
    await page.reload();
    await expect(
      page.getByRole('tab', { name: '运行结果', exact: false }),
    ).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('link', { name: /^继续工作项 / }).click();
    await expect(
      page.getByRole('heading', { name: item.title, exact: true }),
    ).toBeVisible();
    await roots.getByRole('link', { name: '工作项', exact: true }).click();
    await expect(page).toHaveURL(url + '/items');
    await roots.getByRole('link', { name: '流水线', exact: true }).click();
    await expect(page).toHaveURL(url + '/methods');
    await expect(
      page.getByRole('region', { name: '流水线管理' }),
    ).toBeVisible();
    await page.screenshot({
      path: join(evidence, `navigation-methods-${width}.png`),
    });
    await page.goBack();
    await expect(page).toHaveURL(url + '/items');
    expect((await app.items.get(item.id)).runs).toHaveLength(0);
    expect(errors).toEqual([]);
  });

test('直接打开详情恢复位置，第一次后退正常离开；失效工作项可返回', async ({
  page,
}) => {
  const outside = 'data:text/html,<title>before-flowcraft</title>';
  await page.goto(outside);
  await page.goto(url + `/items/${item.id}?tab=inputs`);
  await expect(
    page.getByRole('tab', { name: '输入', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.goBack();
  await expect(page).toHaveTitle('before-flowcraft');
  await page.goForward();
  await expect(
    page.getByRole('heading', { name: item.title, exact: true }),
  ).toBeVisible();
  await page.goto(url + '/items/does-not-exist?tab=inputs');
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: '工作项列表', exact: true }).click();
  await expect(page).toHaveURL(url + '/items');
  await page.goto(url + '/methods/does-not-exist?tab=results');
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: '流水线列表', exact: true }).click();
  await expect(page).toHaveURL(url + '/methods');
});

test('固定执行地址刷新后仍读取指定旧运行，前进后退不启动新运行', async ({
  page,
}) => {
  const method = await app.work.createWork('读取输入原值', []);
  await app.work.rename(method.id, '执行来源检查');
  const definitionId = await app.flow.saveDraft(method.id, undefined, {
    schemaVersion: 1,
    inputs: ['materials'],
    nodes: [
      {
        id: 'read',
        label: '原样读取',
        kind: 'function',

        operation: 'map',
        functionName: 'identity',
      },
    ],
    edges: [{ from: ['$input', 'materials'], to: ['read', 'input'] }],
    outputs: { records: ['read', 'output'] },
  });
  const ids: string[] = [];
  for (const value of ['历史材料', '后来材料']) {
    const response = await app.app.request(`/api/works/${method.id}/actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'run',
        definitionId,
        scope: 'full',
        inputs: {
          materials: [
            { sampleId: value, value, materialIds: [], sourceResultIds: [] },
          ],
        },
      }),
    });
    expect(response.ok).toBeTruthy();
    const snapshot = (await response.json()) as {
      work: { runs: { id: string }[] };
    };
    ids.push(snapshot.work.runs.at(-1)!.id);
    await expect
      .poll(async () => {
        const saved = await app.app.request(`/api/works/${method.id}`);
        const state = (await saved.json()) as {
          work: { runs: { id: string; status: string }[] };
        };
        return state.work.runs.find((run) => run.id === ids.at(-1))?.status;
      })
      .toBe('completed');
  }
  const href = `${url}/methods/${method.id}?tab=results&run=${ids[0]}`;
  await page.goto(href);
  await expect(
    page.getByRole('combobox', { name: '运行记录', exact: true }),
  ).toHaveValue(ids[0]);
  await page.reload();
  await expect(
    page.getByRole('combobox', { name: '运行记录', exact: true }),
  ).toHaveValue(ids[0]);
  await page
    .getByRole('combobox', { name: '运行记录', exact: true })
    .selectOption(ids[1]);
  await expect(page).toHaveURL(href.replace(ids[0], ids[1]) + '&view=process');
  await page.goBack();
  await expect(
    page.getByRole('combobox', { name: '运行记录', exact: true }),
  ).toHaveValue(ids[0]);
  const snapshot = (await (
    await app.app.request(`/api/works/${method.id}`)
  ).json()) as { work: { runs: unknown[] } };
  expect(snapshot.work.runs).toHaveLength(2);
});
