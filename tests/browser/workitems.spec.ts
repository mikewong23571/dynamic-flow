import { test, expect, type APIRequestContext } from '@playwright/test';
import type {
  Definition,
  Snapshot,
  WorkItemView,
} from '../../src/shared/records';

// Browser acceptance uses real HTTP/runtime/files and built-in identity, without
// an LLM. It proves lifecycle wiring, not the quality of generated CVE judgments.
const lifecycle: Definition = {
  schemaVersion: 1,
  inputs: ['materials'],
  nodes: [
    {
      id: 'read',
      label: '读取证据',
      kind: 'function',
      mode: 'each',
      operation: 'map',
      functionName: 'identity',
    },
    {
      id: 'investigated',
      label: '登记调查阶段',
      kind: 'milestone',
      mode: 'all',
      milestone: {
        stage: '已完成调查',
        summary: '初始证据已登记，等待厂商公告',
      },
    },
    {
      id: 'wait',
      label: '等待公告',
      kind: 'wait',
      mode: 'all',
      wait: { event: 'vendor.announcement', reason: '等待厂商发布修复公告' },
    },
    {
      id: 'reviewed',
      label: '登记复核阶段',
      kind: 'milestone',
      mode: 'all',
      milestone: {
        stage: '待确认处置',
        summary: '公告已到达，请根据证据确认完成条件',
      },
    },
  ],
  edges: [
    { from: ['$input', 'materials'], to: ['read', 'input'] },
    { from: ['read', 'output'], to: ['investigated', 'input'] },
    { from: ['investigated', 'output'], to: ['wait', 'input'] },
    { from: ['wait', 'output'], to: ['reviewed', 'input'] },
  ],
  outputs: { result: ['reviewed', 'output'] },
};
async function readItem(
  request: APIRequestContext,
  id: string,
): Promise<WorkItemView> {
  const res = await request.get(`/api/items/${id}`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}
for (const [width, height] of [
  [1440, 900],
  [1024, 768],
]) {
  test(`工作项登记、等待、事件、依据结项与重开（${width}）`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const suffix = `${width}-${Date.now().toString(36)}`;
    const methodName = `自动验收 生命周期方法 ${suffix}`;
    const created = await request.post('/api/works', {
      data: { goal: methodName, materials: ['方法样例不应成为工作项材料'] },
    });
    expect(created.status()).toBe(201);
    const method = (await created.json()) as Snapshot;
    const saved = await request.post(`/api/works/${method.work.id}/actions`, {
      data: { action: 'saveDraft', definition: lifecycle },
    });
    expect(saved.ok()).toBeTruthy();
    let itemId: string | undefined;
    try {
      await page.goto('/');
      await page.getByRole('button', { name: '工作项', exact: true }).click();
      // 空列表时空态区也有同名按钮；页头入口是稳定目标
      await page
        .getByRole('button', { name: '新建工作项', exact: true })
        .first()
        .click();
      const create = page.getByRole('dialog', { name: '新建工作项' });
      await create
        .getByLabel('业务编号', { exact: true })
        .fill(`CVE-UI-${suffix}`);
      await create
        .getByLabel('标题', { exact: true })
        .fill(`产品 A 调查 ${suffix}`);
      await create
        .getByLabel('目标', { exact: true })
        .fill('确认影响并完成有证据的处置');
      await create
        .getByRole('combobox', { name: '处理方法', exact: true })
        .selectOption(method.work.id);
      await create
        .getByLabel('完成条件（每行一项）', { exact: true })
        .fill('调查结论有依据\n处置建议已验证');
      await create
        .getByLabel('初始证据（每行一条）', { exact: true })
        .fill('产品 A 1.0 的初始调查证据');
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/items') && r.request().method() === 'POST',
      );
      await create
        .getByRole('button', { name: '创建工作项', exact: true })
        .click();
      const item = (await (await response).json()) as WorkItemView;
      itemId = item.id;
      await expect(
        page.getByRole('heading', { name: item.title, exact: true }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: '推进工作项', exact: true })
        .click();
      await expect
        .poll(async () => (await readItem(request, item.id)).effectiveStatus)
        .toBe('waiting');
      await expect(
        page.getByText('等待厂商发布修复公告', { exact: true }),
      ).toBeVisible();
      const waiting = await readItem(request, item.id);
      expect(waiting.status).toBe('open');
      expect(waiting.stage).toBe('已完成调查');
      await page.reload();
      await page.getByRole('button', { name: '工作项', exact: true }).click();
      await page
        .getByRole('button', { name: `打开工作项 ${item.key}`, exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: item.title, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('等待厂商发布修复公告', { exact: true }),
      ).toBeVisible();
      await testInfo.attach(`waiting-${width}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await page.getByRole('button', { name: '发送事件', exact: true }).click();
      const signal = page.getByRole('dialog', { name: '发送事件' });
      await signal
        .getByLabel('事件名称', { exact: true })
        .fill('vendor.announcement');
      await signal
        .getByLabel('事件 ID', { exact: true })
        .fill(`announcement-${suffix}`);
      await signal
        .getByLabel('事件内容（JSON，可选）', { exact: true })
        .fill('{"version":"1.1","source":"厂商修复公告"}');
      await signal
        .getByRole('button', { name: '发送事件', exact: true })
        .click();
      await expect
        .poll(async () => (await readItem(request, item.id)).execution?.status)
        .toBe('completed');
      const finished = await readItem(request, item.id);
      expect(finished.execution?.runId).toBe(waiting.execution?.runId);
      expect(finished.status).toBe('open');
      // Before all conditions have evidence, finishing computation must not make
      // the item complete, regardless of whether the UI disables or rejects close.
      await expect(
        page.getByRole('button', { name: '结项', exact: true }),
      ).toBeDisabled();
      for (const criterion of finished.criteria) {
        await page
          .getByRole('checkbox', { name: criterion.text, exact: true })
          .check();
        await page
          .getByLabel(`依据：${criterion.text}`, { exact: true })
          .fill('M01 初始调查与公告 announcement 的修复版本 1.1');
      }
      await page
        .getByRole('button', { name: '保存完成条件', exact: true })
        .click();
      await expect
        .poll(async () =>
          (await readItem(request, item.id)).criteria.every(
            (c) => c.met && c.evidence.length > 0,
          ),
        )
        .toBe(true);
      await page.getByRole('button', { name: '结项', exact: true }).click();
      await expect
        .poll(async () => (await readItem(request, item.id)).status)
        .toBe('completed');
      await expect(
        page.getByRole('button', { name: '补充证据', exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByText('当时的完成条件与依据', { exact: true }),
      ).toHaveCount(2);
      await page.getByRole('button', { name: '重新打开', exact: true }).click();
      const reopen = page.getByRole('dialog', { name: '重新打开工作项' });
      await reopen
        .getByLabel('重开原因', { exact: true })
        .fill('新证据需要重新调查');
      await reopen
        .getByRole('button', { name: '确认重开', exact: true })
        .click();
      await expect
        .poll(async () => (await readItem(request, item.id)).status)
        .toBe('open');
      const reopened = await readItem(request, item.id);
      expect(reopened.id).toBe(item.id);
      expect(
        reopened.history.filter((h) => h.kind === 'completed'),
      ).toHaveLength(1);
      expect(
        reopened.history.filter((h) => h.kind === 'reopened'),
      ).toHaveLength(1);
      await page
        .getByRole('article', { name: '工作项详情' })
        .getByRole('button', { name: '工作项', exact: true })
        .click();
      await page.getByRole('textbox', { name: '搜索工作项' }).fill(item.key);
      await page.getByRole('button', { name: '搜索', exact: true }).click();
      await page
        .getByRole('combobox', { name: '工作项状态' })
        .selectOption('open');
      await expect(
        page.getByRole('button', {
          name: `打开工作项 ${item.key}`,
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole('combobox', { name: '工作项状态' })
        .selectOption('completed');
      await expect(
        page.getByRole('button', {
          name: `打开工作项 ${item.key}`,
          exact: true,
        }),
      ).toHaveCount(0);
      await page
        .getByRole('combobox', { name: '工作项状态' })
        .selectOption('open');
      await page
        .getByRole('button', { name: `打开工作项 ${item.key}`, exact: true })
        .click();
      const dimensions = await page.evaluate(() => ({
        width: innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      expect(dimensions.width).toBe(width);
      expect(dimensions.document).toBeLessThanOrEqual(width);
      expect(dimensions.body).toBeLessThanOrEqual(width);
      expect(errors).toEqual([]);
      await testInfo.attach(`reopened-${width}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    } finally {
      if (itemId) {
        const current = await readItem(request, itemId);
        if (['running', 'waiting'].includes(current.effectiveStatus))
          await request.post(`/api/items/${itemId}/actions`, {
            data: { action: 'stop' },
          });
      }
      await request.post(`/api/works/${method.work.id}/actions`, {
        data: { action: 'archive', archived: true },
      });
    }
  });
}
