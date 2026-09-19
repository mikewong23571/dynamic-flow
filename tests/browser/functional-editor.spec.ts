import { test, expect } from '@playwright/test';
import type { Definition, Snapshot } from '../../src/shared/records';
for (const [width, height] of [
  [1440, 900],
  [1024, 768],
]) {
  test(`结构化归约编辑、运行与重开 ${width}`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    const created = await request.post('/api/works', {
      data: {
        goal: `自动验收 函数式编辑 ${width} ${Date.now()}`,
        materials: ['one', 'two', 'three'],
      },
    });
    const initial: Snapshot = await created.json();
    const id = initial.work.id;
    const definition: Definition = {
      schemaVersion: 1,
      inputs: ['materials'],
      nodes: [
        {
          id: 'transform',
          label: '材料计数',
          kind: 'function',
          mode: 'each',
          functionName: 'identity',
        },
      ],
      edges: [{ from: ['$input', 'materials'], to: ['transform', 'input'] }],
      outputs: { total: ['transform', 'output'] },
    };
    try {
      expect(
        (
          await request.post(`/api/works/${id}/actions`, {
            data: { action: 'saveDraft', definition },
          })
        ).ok(),
      ).toBeTruthy();
      await page.goto('/');
      await page
        .locator('.work-list')
        .getByRole('button', {
          name: initial.work.title || initial.work.goal,
          exact: true,
        })
        .click();
      await page.locator('.react-flow__node[data-id="transform"]').click();
      await page
        .getByRole('combobox', { name: '处理函数', exact: true })
        .selectOption('expression');
      await expect(page.getByLabel('变量名', { exact: true })).toHaveValue(
        'input',
      );
      await page
        .getByRole('combobox', { name: '处理方式', exact: true })
        .selectOption('aggregate');
      const editor = page.locator('.inspector > .expression-block');
      await editor
        .getByRole('combobox', { name: '表达式类型', exact: true })
        .first()
        .selectOption('reduce');
      await editor.locator('summary').filter({ hasText: '归约初值' }).click();
      await editor
        .getByRole('textbox', { name: '常量值', exact: true })
        .fill('10');
      await editor
        .locator('summary')
        .filter({ hasText: '返回值' })
        .first()
        .click();
      await expect(
        editor.getByRole('combobox', { name: '运算', exact: true }),
      ).toHaveValue('add');
      await page.getByRole('button', { name: '保存修改', exact: true }).click();
      await expect(
        page.getByRole('button', { name: '保存修改', exact: true }),
      ).toHaveCount(0);
      const saved: Snapshot = await (
        await request.get(`/api/works/${id}`)
      ).json();
      const node = saved.definitions[saved.work.draftId!].nodes[0];
      expect(node.operation).toBe('aggregate');
      expect(node.expression).toMatchObject({
        kind: 'reduce',
        initial: { kind: 'literal', value: 10 },
      });
      expect(saved.issues).toEqual([]);
      await expect(
        page.locator('.react-flow__node[data-id="transform"]'),
      ).toContainText('顺序归约');
      await page.getByRole('button', { name: '运行流程', exact: true }).click();
      await expect
        .poll(async () => {
          const state: Snapshot = await (
            await request.get(`/api/works/${id}`)
          ).json();
          return state.work.runs.at(-1)?.status;
        })
        .toBe('completed');
      const completed: Snapshot = await (
        await request.get(`/api/works/${id}`)
      ).json();
      expect(
        completed.work.runs.at(-1)?.results[0].outputs.output[0].value,
      ).toBe(13);
      await page.reload();
      await page.locator('.react-flow__node[data-id="transform"]').click();
      await expect(
        page.getByRole('combobox', { name: '处理函数', exact: true }),
      ).toHaveValue('expression');
      await editor.locator('summary').filter({ hasText: '归约初值' }).click();
      await expect(
        editor.getByRole('textbox', { name: '常量值', exact: true }),
      ).toHaveValue('10');
      const dimensions = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        width: window.innerWidth,
      }));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
      await testInfo.attach(`functional-editor-${width}`, {
        body: await page.screenshot(),
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
