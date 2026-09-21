import { test, expect } from '@playwright/test';
import type {
  Definition,
  FlowNode,
  Snapshot,
  Json,
} from '../../src/shared/records';
for (const [width, height] of [
  [1440, 900],
  [1024, 768],
]) {
  test(`多路收集与关联编辑、运行、重开 ${width}`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    const initial: Snapshot = await (
      await request.post('/api/works', {
        data: {
          goal: `自动验收 多输入编辑 ${width} ${Date.now()}`,
          materials: ['start'],
        },
      })
    ).json();
    const id = initial.work.id;
    const source = (id: string, value: Json): FlowNode => ({
      id,
      label: id,
      kind: 'function',
      mode: 'each',
      operation: 'map',
      functionName: 'expression',
      expression: { kind: 'literal', value },
    });
    const definition: Definition = {
      schemaVersion: 1,
      inputs: ['materials'],
      nodes: [
        {
          id: 'gather',
          label: '综合结果',
          kind: 'function',
          functionName: 'merge',
          mode: 'all',
          inputSchema: {
            type: 'object',
            properties: { left: { type: 'array' }, right: { type: 'array' } },
            required: ['left', 'right'],
          },
        },
        source('调查', { id: 1, finding: 'confirmed' }),
        source('修复', { id: 1, fix: 'patched' }),
        source('验证', { id: 2, verified: true }),
      ],
      edges: [
        ...['调查', '修复', '验证'].map((n) => ({
          from: ['$input', 'materials'] as [string, string],
          to: [n, 'input'] as [string, string],
        })),
        { from: ['调查', 'output'], to: ['gather', 'left'] },
        { from: ['修复', 'output'], to: ['gather', 'right'] },
      ],
      outputs: { result: ['gather', 'output'] },
    };
    const snapshot = async (): Promise<Snapshot> =>
      (await request.get(`/api/works/${id}`)).json();
    const save = async () => {
      await page.getByRole('button', { name: '保存修改', exact: true }).click();
      await expect(
        page.getByRole('button', { name: '保存修改', exact: true }),
      ).toHaveCount(0);
    };
    const run = async () => {
      await page.getByRole('button', { name: '运行流程', exact: true }).click();
      await expect
        .poll(async () => (await snapshot()).work.runs.at(-1)?.status)
        .toBe('completed');
    };
    try {
      expect(
        (
          await request.post(`/api/works/${id}/actions`, {
            data: { action: 'saveDraft', definition },
          })
        ).ok(),
      ).toBeTruthy();
      await request.post(`/api/works/${id}/actions`, {
        data: {
          action: 'saveLayout',
          view: {
            positions: {
              $input: { x: 0, y: 250 },
              调查: { x: 320, y: 0 },
              修复: { x: 320, y: 260 },
              验证: { x: 320, y: 520 },
              gather: { x: 660, y: 220 },
            },
            viewport: { x: 15, y: 35, zoom: width === 1024 ? 0.54 : 0.72 },
          },
        },
      });
      // 侧栏只列显式打开的流水线（opened-pipelines 语义）；预置本浏览器的打开入口。
      await page.addInitScript((workId) => {
        localStorage.setItem(
          'dynamic-flow.opened-works',
          JSON.stringify([{ id: workId, goal: '', updatedAt: '' }]),
        );
        localStorage.setItem('dynamic-flow.work', workId);
      }, id);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page
        .locator('.work-list')
        .getByRole('button', {
          name: initial.work.title || initial.work.goal,
          exact: true,
        })
        .click();
      await page.getByRole('button', { name: '整理布局', exact: true }).click();
      await expect(page.locator('[data-routing="elk"]')).toHaveCount(5);
      await page.locator('.react-flow__node[data-id="gather"]').click();
      await page
        .getByRole('combobox', { name: '处理函数', exact: true })
        .selectOption('collect');
      await expect(
        page.getByRole('combobox', { name: '处理方式', exact: true }),
      ).toHaveCount(0);
      await page.getByRole('button', { name: '添加端口', exact: true }).click();
      const name = page.getByRole('textbox', {
        name: '输入端口 1 名称',
        exact: true,
      });
      await name.fill('investigation');
      await name.press('Enter');
      await page
        .getByRole('textbox', { name: '输入端口 2 名称', exact: true })
        .fill('remediation');
      await page
        .getByRole('textbox', { name: '输入端口 2 名称', exact: true })
        .press('Enter');
      await page
        .getByRole('textbox', { name: '输入端口 3 名称', exact: true })
        .fill('verification');
      await page
        .getByRole('textbox', { name: '输入端口 3 名称', exact: true })
        .press('Enter');
      await page
        .locator('.inspector summary')
        .filter({ hasText: '添加连接' })
        .click();
      await page
        .getByRole('combobox', { name: '来自', exact: true })
        .selectOption('验证::output');
      await page
        .getByRole('combobox', { name: '输入端口', exact: true })
        .selectOption('verification');
      await page
        .getByRole('button', { name: '连接到此步骤', exact: true })
        .click();
      await save();
      await expect(page.locator('[data-routing="elk"]')).toHaveCount(0);
      await page.getByRole('button', { name: '整理布局', exact: true }).click();
      await expect(page.locator('[data-routing="elk"]')).toHaveCount(6);
      let state = await snapshot();
      expect(state.issues).toEqual([]);
      expect(
        state.definitions[state.work.draftId!].edges
          .filter((e) => e.to[0] === 'gather')
          .map((e) => e.to[1]),
      ).toEqual(['investigation', 'remediation', 'verification']);
      await run();
      state = await snapshot();
      expect(
        state.work.runs.at(-1)?.results.find((r) => r.nodeId === 'gather')
          ?.outputs.output[0].value,
      ).toEqual({
        investigation: [{ id: 1, finding: 'confirmed' }],
        remediation: [{ id: 1, fix: 'patched' }],
        verification: [{ id: 2, verified: true }],
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('.react-flow__node[data-id="gather"]').click();
      await expect(
        page.getByRole('textbox', { name: '输入端口 3 名称', exact: true }),
      ).toHaveValue('verification');
      await testInfo.attach(`collect-${width}`, {
        body: await page.screenshot({
          path: testInfo.outputPath(`collect-${width}.png`),
        }),
        contentType: 'image/png',
      });
      // Delete one connected port without losing the other two, then change to named join inputs.
      await page
        .getByRole('button', { name: '删除端口 verification', exact: true })
        .click();
      await save();
      await expect(page.locator('[data-routing="elk"]')).toHaveCount(0);
      await page.getByRole('button', { name: '整理布局', exact: true }).click();
      await expect(page.locator('[data-routing="elk"]')).toHaveCount(5);
      state = await snapshot();
      expect(
        state.definitions[state.work.draftId!].edges
          .filter((e) => e.to[0] === 'gather')
          .map((e) => e.to[1]),
      ).toEqual(['investigation', 'remediation']);
      await page
        .getByRole('textbox', { name: '输入端口 1 名称', exact: true })
        .fill('left');
      await page
        .getByRole('textbox', { name: '输入端口 1 名称', exact: true })
        .press('Enter');
      await page
        .getByRole('textbox', { name: '输入端口 2 名称', exact: true })
        .fill('right');
      await page
        .getByRole('textbox', { name: '输入端口 2 名称', exact: true })
        .press('Enter');
      await page
        .getByRole('combobox', { name: '处理函数', exact: true })
        .selectOption('join');
      await page
        .getByRole('combobox', { name: '关联方式', exact: true })
        .selectOption('full');
      await page
        .getByRole('combobox', { name: '重复键', exact: true })
        .selectOption('error');
      await expect(
        page.getByRole('textbox', { name: '左路关联字段', exact: true }),
      ).toHaveValue('id');
      await save();
      await run();
      state = await snapshot();
      expect(
        state.work.runs
          .at(-1)
          ?.results.find((r) => r.nodeId === 'gather')
          ?.outputs.output.map((i) => i.value),
      ).toEqual([
        {
          left: { id: 1, finding: 'confirmed' },
          right: { id: 1, fix: 'patched' },
        },
      ]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('.react-flow__node[data-id="gather"]').click();
      await expect(
        page.getByRole('combobox', { name: '关联方式', exact: true }),
      ).toHaveValue('full');
      await expect(
        page.getByRole('combobox', { name: '重复键', exact: true }),
      ).toHaveValue('error');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBeTruthy();
      await testInfo.attach(`join-${width}`, {
        body: await page.screenshot({
          path: testInfo.outputPath(`join-${width}.png`),
        }),
        contentType: 'image/png',
      });
    } finally {
      await request
        .post(`/api/works/${id}/actions`, {
          data: { action: 'archive', archived: true },
        })
        .catch(() => undefined);
    }
  });
}
