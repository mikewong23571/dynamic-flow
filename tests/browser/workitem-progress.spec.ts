import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApplication } from '../../src/server/index.ts';
import type {
  Definition,
  Json,
  NodeExecution,
  Snapshot,
  WorkItemPage,
  WorkItemView,
} from '../../src/shared/records.ts';

// Build first. Every case uses a private HTTP server and temporary files. Only
// Agent generation is substituted; report actions and runtime state are real.
// Cases: exact ten-item distribution/filtering, live parallel activity and reports,
// waiting/failure facts, explicit confirmation/complete/reopen, stable polling,
// pagination, and empty/loading/read-error boundaries. No default data is written.
let application: Awaited<ReturnType<typeof createApplication>>;
let server: Server;
let root: string;
let url: string;
const held = new Map<
  string,
  { context: NodeExecution; finish: (value: Json) => void }[]
>();
const artifacts = resolve(
  'conductor/tracks/workitem-progress_20261021/artifacts',
);
const agent: Definition['nodes'][number] = {
  id: 'review',
  label: '核对产品版本',
  kind: 'agent',
  mode: 'all',
  operation: 'aggregate',
  task: '依据工作项材料核对版本范围',
  expectedOutput: { type: 'string' },
  contract: {
    responsibility: '核对产品版本范围',
    done: '提交可检查的结论',
    rationale: '版本范围是调查依据',
    semanticRole: '版本调查',
  },
};
const running: Definition = {
  schemaVersion: 1,
  inputs: ['materials'],
  nodes: [agent, { ...agent, id: 'notice', label: '核对厂商公告' }],
  edges: ['review', 'notice'].map((id) => ({
    from: ['$input', 'materials'],
    to: [id, 'input'],
  })),
  outputs: { versions: ['review', 'output'], notices: ['notice', 'output'] },
};
const identity: Definition = {
  schemaVersion: 1,
  inputs: ['materials'],
  nodes: [
    {
      id: 'read',
      label: '核对材料',
      kind: 'function',
      mode: 'each',
      operation: 'map',
      functionName: 'identity',
    },
  ],
  edges: [{ from: ['$input', 'materials'], to: ['read', 'input'] }],
  outputs: { result: ['read', 'output'] },
};
const waiting: Definition = {
  schemaVersion: 1,
  inputs: ['materials'],
  nodes: [
    {
      id: 'wait',
      label: '等待版本清单',
      kind: 'wait',
      mode: 'all',
      wait: { event: 'versions.ready', reason: '等待产品负责人补充版本清单' },
    },
  ],
  edges: [{ from: ['$input', 'materials'], to: ['wait', 'input'] }],
  outputs: { result: ['wait', 'output'] },
};
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'progress-browser-'));
  held.clear();
  application = await createApplication({
    dataRoot: root,
    executeNode: async (context) => {
      if (context.node.id === 'fail') throw Error('版本来源服务不可用');
      return new Promise<Json>((finish, reject) => {
        context.signal.addEventListener(
          'abort',
          () => reject(Error('测试执行已停止')),
          { once: true },
        );
        const key = context.workItem!.key;
        held.set(key, [...(held.get(key) || []), { context, finish }]);
      });
    },
  });
  server = serve({
    fetch: application.app.fetch,
    hostname: '127.0.0.1',
    port: 0,
  }) as Server;
  if (!server.listening)
    await new Promise<void>((r) => server.once('listening', r));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await mkdir(artifacts, { recursive: true });
});
test.afterEach(async () => {
  await application.runs.close();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  await rm(root, { recursive: true, force: true });
});
async function api<T>(
  request: APIRequestContext,
  path: string,
  body?: unknown,
): Promise<T> {
  const response =
    body === undefined
      ? await request.get(`${url}${path}`)
      : await request.post(`${url}${path}`, { data: body });
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return response.json();
}
const read = (request: APIRequestContext, id: string) =>
  api<WorkItemView>(request, `/api/items/${id}`);
const act = (request: APIRequestContext, id: string, body: unknown) =>
  api<WorkItemView>(request, `/api/items/${id}/actions`, body);
async function method(request: APIRequestContext, definition: Definition) {
  const snapshot = await api<Snapshot>(request, '/api/works', {
    goal: '工作项进度验收方法',
    materials: ['方法样例不进入工作项'],
  });
  await api(request, `/api/works/${snapshot.work.id}/actions`, {
    action: 'saveDraft',
    definition,
  });
  return snapshot.work.id;
}
async function item(
  request: APIRequestContext,
  workflowId: string,
  key: string,
) {
  return api<WorkItemView>(request, '/api/items', {
    workflowId,
    key,
    title: `${key} 产品影响调查`,
    goal: '确认影响范围并提交有证据的结论',
    materials: [`${key} 产品公告原始证据`],
    criteria: ['影响判断有依据'],
  });
}
async function seed(request: APIRequestContext) {
  const plain = await method(request, identity);
  const live = await method(request, running);
  const wait = await method(request, waiting);
  const failed = await method(request, {
    ...identity,
    nodes: [{ ...agent, id: 'fail', label: '读取版本来源' }],
    edges: [{ from: ['$input', 'materials'], to: ['fail', 'input'] }],
    outputs: { result: ['fail', 'output'] },
  });
  const items: Record<string, WorkItemView> = {};
  for (const [key, workflow] of [
    ['OPEN-1', plain],
    ['OPEN-2', plain],
    ['RUN-1', live],
    ['RUN-2', live],
    ['RUN-3', live],
    ['WAIT-1', wait],
    ['FAIL-1', failed],
    ['BLOCK-1', plain],
    ['DONE-1', plain],
    ['DONE-2', plain],
  ]) {
    items[key] = await item(request, workflow, key);
    if (/^(RUN|WAIT|FAIL)-/.test(key))
      await act(request, items[key].id, { action: 'run' });
    if (key.startsWith('DONE')) {
      await act(request, items[key].id, {
        action: 'criteria',
        criteria: items[key].criteria.map((c) => ({
          ...c,
          met: true,
          evidence: 'M01 公告核对记录',
        })),
      });
      await act(request, items[key].id, { action: 'complete' });
    }
  }
  const blocked = items['BLOCK-1'];
  await act(request, blocked.id, {
    action: 'reportProgress',
    id: 'external-blocker',
    expectedRevision: blocked.revision,
    stage: '影响调查',
    summary: '已核对现有公告，尚缺产品版本范围。',
    nextAction: '补充版本清单后复核。',
    blocker: '缺少版本清单',
    materialIds: [blocked.materials[0].id],
  });
  await expect
    .poll(async () => (await api<WorkItemPage>(request, '/api/items')).summary)
    .toEqual({
      total: 10,
      pending: 8,
      open: 2,
      running: 3,
      waiting: 1,
      attention: 2,
      completed: 2,
    });
  return { items, plain };
}
async function overview(page: Page) {
  await page.goto(url);
  await page.getByRole('button', { name: '工作项', exact: true }).click();
}
async function back(page: Page) {
  await page
    .getByRole('article', { name: '工作项详情' })
    .getByRole('button', { name: '工作项', exact: true })
    .click();
}
async function open(page: Page, key: string) {
  await page
    .getByRole('button', { name: `打开工作项 ${key}`, exact: true })
    .click();
}
const rows = (page: Page) => page.locator('tr[data-item-id]');
const rowIds = (page: Page) =>
  rows(page).evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-item-id')),
  );
async function screenshot(page: Page, name: string, width: number) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: join(artifacts, `${name}-${width}.png`) });
}

for (const width of [1440, 1024])
  test(`整体数量、单项推进与显式结项重开 ${width}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const { items, plain } = await seed(request);
    await overview(page);
    const summary = page.getByRole('group', {
      name: '全部工作项',
      exact: true,
    });
    for (const name of [
      '全部 10',
      '未完成 8',
      '已结项 2',
      '待推进 2',
      '推进中 3',
      '等待中 1',
      '需处理 2',
    ])
      await expect(
        summary.getByRole('button', { name, exact: true }),
      ).toBeVisible();
    await screenshot(page, 'overview', width);
    for (const [label, count] of [
      ['未完成 8', 8],
      ['待推进 2', 2],
      ['推进中 3', 3],
      ['等待中 1', 1],
      ['需处理 2', 2],
      ['已结项 2', 2],
    ] as const) {
      const button = summary.getByRole('button', { name: label, exact: true });
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(rows(page)).toHaveCount(count);
      await expect(
        summary.getByRole('button', { name: '全部 10', exact: true }),
      ).toBeVisible();
    }
    await page
      .getByRole('textbox', { name: '搜索工作项' })
      .fill('NO-SUCH-ITEM');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(
      page.getByText('没有符合条件的工作项', { exact: true }),
    ).toBeVisible();
    await summary
      .getByRole('button', { name: '未完成 8', exact: true })
      .click();
    await expect(rows(page)).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: '搜索工作项' })).toHaveValue(
      'NO-SUCH-ITEM',
    );
    await screenshot(page, 'zero-matches', width);
    await page.getByRole('textbox', { name: '搜索工作项' }).fill('');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await summary.getByRole('button', { name: '全部 10', exact: true }).click();
    await expect(rows(page)).toHaveCount(10);
    const before = await rowIds(page);
    const idle = await read(request, items['OPEN-1'].id);
    await act(request, idle.id, {
      action: 'reportProgress',
      id: 'polling-update',
      expectedRevision: idle.revision,
      stage: '资料已整理',
      summary: '轮询应原位更新这条记录',
      nextAction: '启动复核',
    });
    await expect(rows(page).filter({ hasText: 'OPEN-1' })).toContainText(
      '轮询应原位更新这条记录',
    );
    expect(await rowIds(page)).toEqual(before);
    await open(page, 'OPEN-2');
    const detail = page.getByRole('article', { name: '工作项详情' });
    await expect(detail).toContainText('尚未执行');
    await expect(detail).toContainText('尚未记录下一步');
    await back(page);
    await open(page, 'BLOCK-1');
    await expect(detail).toContainText('外部报告');
    await expect(detail).toContainText('缺少版本清单');
    await expect(detail).toContainText('补充版本清单后复核。');
    await screenshot(page, 'blocker', width);
    await back(page);
    await open(page, 'WAIT-1');
    await expect(detail).toContainText('等待产品负责人补充版本清单');
    await expect(detail).toContainText('versions.ready');
    await screenshot(page, 'waiting', width);
    await back(page);
    await open(page, 'FAIL-1');
    await expect(detail).toContainText('版本来源服务不可用');
    await screenshot(page, 'failure', width);
    await back(page);
    await open(page, 'RUN-1');
    const activity = detail.getByRole('list', { name: '当前活动步骤' });
    await expect(activity).toContainText('核对产品版本');
    await expect(activity).toContainText('核对厂商公告');
    const contexts = held.get('RUN-1')!;
    expect(contexts).toHaveLength(2);
    const c = contexts[0].context;
    const report = {
      action: 'reportProgress',
      id: `report-${width}`,
      stage: '影响调查',
      summary: '已整理产品公告与依赖信息。'.repeat(18),
      nextAction: '取得版本范围后复核影响结论。',
      blocker: '版本范围尚待负责人确认',
      materialIds: [items['RUN-1'].materials[0].id],
      source: {
        workId: c.workId,
        runId: c.runId,
        definitionId: c.definitionId,
        nodeId: c.node.id,
        instanceId: c.instanceId,
      },
    };
    await act(request, items['RUN-1'].id, report);
    await expect(detail).toContainText(report.nextAction);
    await expect(detail).toContainText('Agent 报告');
    // A report must not hide live execution, create a Wait, or confirm criteria.
    expect((await read(request, items['RUN-1'].id)).effectiveStatus).toBe(
      'running',
    );
    await expect(activity).toContainText('核对厂商公告');
    await screenshot(page, 'live-report', width);
    for (const pending of contexts) pending.finish('已形成待确认的调查结论');
    await expect
      .poll(
        async () => (await read(request, items['RUN-1'].id)).execution?.status,
      )
      .toBe('completed');
    await expect(detail).toContainText('本轮执行已结束，工作项尚未结项');
    await expect(
      detail.getByRole('button', { name: '结项', exact: true }),
    ).toBeDisabled();
    await detail
      .getByRole('checkbox', { name: '影响判断有依据', exact: true })
      .check();
    await detail
      .getByLabel('依据：影响判断有依据', { exact: true })
      .fill('M01 公告已核对且范围得到负责人确认');
    // Even another client's criteria update must preserve this unsaved form.
    const beforeExternal = await read(request, items['RUN-1'].id);
    const external = await act(request, beforeExternal.id, {
      action: 'criteria',
      criteria: beforeExternal.criteria.map((criterion) => ({
        ...criterion,
        met: false,
        evidence: '另一会话补充了不同依据',
      })),
    });
    const revision = external.revision;
    await act(request, items['RUN-1'].id, {
      action: 'reportProgress',
      id: 'idle-update',
      expectedRevision: revision,
      stage: '待确认处置',
      summary: '证据已经补齐',
      nextAction: '请人工确认结项',
    });
    await expect(detail).toContainText('证据已经补齐');
    await expect(
      detail.getByLabel('依据：影响判断有依据', { exact: true }),
    ).toHaveValue('M01 公告已核对且范围得到负责人确认');
    await expect(
      detail.getByRole('checkbox', { name: '影响判断有依据', exact: true }),
    ).toBeChecked();
    await detail
      .getByRole('button', { name: '保存完成条件', exact: true })
      .click();
    await expect(detail).toContainText('待结项确认');
    await detail.getByRole('button', { name: '结项', exact: true }).click();
    await expect(
      detail.getByRole('button', { name: '重新打开', exact: true }),
    ).toBeVisible();
    await expect(detail.locator('.item-current-progress')).toContainText(
      '用户结项确认',
    );
    expect((await read(request, items['RUN-1'].id)).status).toBe('completed');
    await back(page);
    await expect(
      summary.getByRole('button', { name: '已结项 3', exact: true }),
    ).toBeVisible();
    await open(page, 'RUN-1');
    await detail.getByRole('button', { name: '重新打开', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '重新打开工作项' });
    await dialog.getByLabel('重开原因').fill('新公告需要重新调查');
    await dialog.getByRole('button', { name: '确认重开', exact: true }).click();
    await expect(
      detail.getByRole('button', { name: '推进工作项', exact: true }),
    ).toBeVisible();
    await expect(detail.locator('.item-current-progress')).toContainText(
      '用户重开',
    );
    await expect(detail.locator('.item-current-progress')).toContainText(
      '重开后尚未再次推进',
    );
    await expect(detail.locator('.item-current-progress')).toContainText(
      '请根据重开原因重新评估，确认材料后再次推进。',
    );
    const reopened = await read(request, items['RUN-1'].id);
    expect(reopened.id).toBe(items['RUN-1'].id);
    expect(reopened.nextAction).toBeUndefined();
    expect(reopened.blocker).toBeUndefined();
    expect(reopened.history.filter((h) => h.kind === 'progress')).toHaveLength(
      2,
    );
    await screenshot(page, 'reopened', width);
    await back(page);
    await expect(
      summary.getByRole('button', { name: '已结项 2', exact: true }),
    ).toBeVisible();
    await expect(
      summary.getByRole('button', { name: '未完成 8', exact: true }),
    ).toBeVisible();
    await item(request, plain, 'EXTRA-11');
    await expect(
      summary.getByRole('button', { name: '全部 11', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '下一页', exact: true }).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByText('第 2 / 2 页', { exact: true })).toBeVisible();
    await summary
      .getByRole('button', { name: '未完成 9', exact: true })
      .click();
    await expect(page.getByText('第 1 / 1 页', { exact: true })).toBeVisible();
    await expect(rows(page)).toHaveCount(9);
    expect(errors).toEqual([]);
  });

for (const width of [1440, 1024])
  test(`加载不伪装零、空项与刷新失败保留真实数据 ${width}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/items?**', async (route) => {
      await gate;
      await route.continue();
    });
    await overview(page);
    await expect(
      page.getByRole('status', { name: '正在载入', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '全部 0', exact: true }),
    ).toHaveCount(0);
    await screenshot(page, 'loading', width);
    const loaded = page.waitForResponse(
      (response) =>
        response.url().includes('/api/items?') && response.status() === 200,
    );
    release();
    await loaded;
    await page.unroute('**/api/items?**');
    await expect(page.getByText('还没有工作项', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: '全部 0', exact: true }),
    ).toBeVisible();
    await screenshot(page, 'empty', width);
    const workflow = await method(request, identity);
    await item(request, workflow, 'VISIBLE-1');
    await expect(
      page.getByRole('button', { name: '打开工作项 VISIBLE-1', exact: true }),
    ).toBeVisible();
    // Only transport failure is substituted; the retained row came from real HTTP.
    await page.route('**/api/items?**', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: '进度刷新暂时不可用' }),
      }),
    );
    await expect(page.getByRole('alert')).toContainText('进度刷新暂时不可用');
    await expect(
      page.getByRole('button', { name: '打开工作项 VISIBLE-1', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '全部 1', exact: true }),
    ).toBeVisible();
    await screenshot(page, 'read-error', width);
    await page.getByRole('button', { name: '未完成 1', exact: true }).click();
    await expect(
      page.getByText('上次读取 1 项 · 当前筛选尚未读取成功', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '打开工作项 VISIBLE-1', exact: true }),
    ).toBeVisible();
    await screenshot(page, 'filter-read-error', width);
    await page.unroute('**/api/items?**');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

for (const width of [1440, 1024])
  test(`已打开流水线的侧栏样式、切换与关闭 ${width}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    const titles = [
      '影响调查：核对多份产品公告与完整版本范围的长期处理方法',
      '厂商公告复核',
      '独立证据整理',
    ];
    const methods: Snapshot['work'][] = [];
    for (const title of titles) {
      const id = await method(request, identity);
      const renamed = await api<Snapshot>(request, `/api/works/${id}/actions`, {
        action: 'rename',
        title,
      });
      methods.push(renamed.work);
    }
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url);
    const opened = page.getByRole('navigation', { name: '已打开的流水线' });
    const entries = opened.locator('.work-item');
    for (const title of titles) {
      await page
        .getByRole('button', { name: '全部流水线', exact: true })
        .click();
      await page
        .getByRole('region', { name: '流水线管理' })
        .getByRole('button', { name: title, exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: title, exact: true }),
      ).toBeVisible();
    }
    await expect(entries).toHaveText(titles);
    await expect(page.locator('.sidebar')).toHaveCSS(
      'width',
      width === 1440 ? '216px' : '192px',
    );
    // Global layer registration must precede feature CSS. Otherwise base button
    // defaults win here and add 1px borders, 13px white text to every opened row.
    for (const entry of await entries.all()) {
      await expect(entry).toHaveCSS('font-size', '12px');
      await expect(entry).toHaveCSS('font-weight', '500');
      await expect(entry).toHaveCSS('border-top-width', '0px');
      await expect(entry).toHaveCSS('border-right-width', '0px');
      await expect(entry).toHaveCSS('border-bottom-width', '0px');
      await expect(entry).toHaveCSS('border-left-width', '0px');
    }
    await expect(entries.nth(0)).toHaveCSS('color', 'rgb(161, 161, 161)');
    await expect(entries.nth(1)).toHaveCSS('color', 'rgb(161, 161, 161)');
    await expect(entries.nth(2)).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(entries.nth(2)).toHaveAttribute('aria-current', 'page');
    const close = opened.getByRole('button', {
      name: `关闭流水线 ${titles[0]}`,
      exact: true,
    });
    await expect(close).toHaveCSS('color', 'rgb(161, 161, 161)');
    const longTitle = entries.nth(0).locator('span').last();
    expect(
      await longTitle.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
    ).toBeTruthy();
    await entries.nth(0).click();
    await expect(entries.nth(0)).toHaveAttribute('aria-current', 'page');
    await expect(entries.nth(0)).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(entries.nth(2)).toHaveCSS('color', 'rgb(161, 161, 161)');
    await screenshot(page, 'sidebar-opened', width);
    await opened
      .getByRole('button', { name: `关闭流水线 ${titles[1]}`, exact: true })
      .click();
    await expect(entries).toHaveText([titles[0], titles[2]]);
    await expect(entries.nth(0)).toHaveAttribute('aria-current', 'page');
    await close.click();
    await expect(entries).toHaveText([titles[2]]);
    await expect(entries.nth(0)).toHaveAttribute('aria-current', 'page');
    await page.reload();
    await expect(entries).toHaveText([titles[2]]);
    await expect(entries.nth(0)).toHaveAttribute('aria-current', 'page');
    for (const work of methods) {
      const saved = await api<Snapshot>(request, `/api/works/${work.id}`);
      expect(saved.work.archivedAt).toBeUndefined();
      expect(saved.work.materials).toEqual(work.materials);
      expect(saved.work.draftId).toBe(work.draftId);
    }
    expect(errors).toEqual([]);
  });
