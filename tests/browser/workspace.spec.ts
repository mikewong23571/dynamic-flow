import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import type { Definition, Snapshot } from '../../src/shared/records';

const materials = [
  '界面顺手，但导出经常失败。',
  '希望支持批量导出。',
  '搜索变快，团队很满意。',
];
const functionFlow = (): Definition => ({
  schemaVersion: 1,
  inputs: ['materials'],
  nodes: [
    {
      id: 'prepare',
      label: '原样整理材料',
      kind: 'function',
      mode: 'each',
      functionName: 'identity',
    },
    {
      id: 'branch',
      label: '按内容分流',
      kind: 'branch',
      mode: 'all',
      condition: { field: '', operator: 'contains', value: '最初条件' },
    },
    {
      id: 'matched',
      label: '处理匹配材料',
      kind: 'function',
      mode: 'each',
      functionName: 'identity',
    },
    {
      id: 'merge',
      label: '汇合全部材料',
      kind: 'function',
      mode: 'all',
      functionName: 'merge',
    },
  ],
  edges: [
    { from: ['$input', 'materials'], to: ['prepare', 'input'] },
    { from: ['prepare', 'output'], to: ['branch', 'input'] },
    { from: ['branch', 'matched'], to: ['matched', 'input'] },
    { from: ['matched', 'output'], to: ['merge', 'left'] },
    { from: ['branch', 'unmatched'], to: ['merge', 'right'] },
  ],
  outputs: { result: ['merge', 'output'] },
});

async function snapshot(
  request: APIRequestContext,
  id: string,
): Promise<Snapshot> {
  const response = await request.get(`/api/works/${id}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function createWork(request: APIRequestContext, width: number) {
  const response = await request.post('/api/works', {
    data: {
      goal: `自动验收 编辑与重开 ${width} ${Date.now().toString(36)}`,
      materials,
    },
  });
  expect(response.status()).toBe(201);
  const initial = (await response.json()) as Snapshot;
  const id = initial.work.id;
  const saved = await request.post(`/api/works/${id}/actions`, {
    data: { action: 'saveDraft', definition: functionFlow() },
  });
  expect(saved.ok()).toBeTruthy();
  const layout = await request.post(`/api/works/${id}/actions`, {
    data: {
      action: 'saveLayout',
      view: {
        positions: {
          $input: { x: 0, y: 30 },
          prepare: { x: 300, y: 30 },
          branch: { x: 600, y: 30 },
          matched: { x: 300, y: 300 },
          merge: { x: 600, y: 300 },
        },
        viewport: { x: 20, y: 30, zoom: 0.38 },
      },
    },
  });
  expect(layout.ok()).toBeTruthy();
  return initial.work;
}
async function saveInBrowser(page: Page, id: string): Promise<Snapshot> {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/works/${id}/actions`) &&
      r.request().postDataJSON()?.action === 'saveDraft',
  );
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  const saved = await response;
  expect(saved.ok()).toBeTruthy();
  await expect(
    page.getByRole('button', { name: '保存修改', exact: true }),
  ).toHaveCount(0);
  return saved.json();
}
async function expectNoHorizontalOverflow(page: Page, width: number) {
  const measurements = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(measurements.viewport).toBe(width);
  expect(measurements.document).toBeLessThanOrEqual(width);
  expect(measurements.body).toBeLessThanOrEqual(width);
  for (const locator of [
    page.locator('.workspace-header'),
    page.locator('.context-panel'),
    page.getByRole('button', { name: '运行流程', exact: true }),
  ]) {
    const bounds = await locator.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
  }
}

for (const [width, height] of [
  [1440, 900],
  [1024, 768],
]) {
  test(`函数流程实际编辑、连线修错、执行与重开（${width}×${height}）`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const work = await createWork(request, width);
    await page.goto('/');
    await page
      .locator('.work-list')
      .getByRole('button', { name: work.goal, exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: work.goal, exact: true }),
    ).toBeVisible();
    await expect(page.locator('.material-row')).toHaveCount(3);
    await page.locator('.react-flow__node[data-id="prepare"]').click();
    await page
      .getByLabel('步骤名称', { exact: true })
      .fill('保留原始反馈与编号');
    const renamed = await saveInBrowser(page, work.id);
    expect(
      renamed.definitions[renamed.work.draftId!].nodes.find(
        (n) => n.id === 'prepare',
      )?.label,
    ).toBe('保留原始反馈与编号');
    await expect(
      page.locator('.react-flow__node[data-id="prepare"]'),
    ).toContainText('保留原始反馈与编号');

    await page.locator('.react-flow__node[data-id="branch"]').click();
    await page.getByLabel('值', { exact: true }).fill('失败');
    const configured = await saveInBrowser(page, work.id);
    expect(
      configured.definitions[configured.work.draftId!].nodes.find(
        (n) => n.id === 'branch',
      )?.condition?.value,
    ).toBe('失败');
    await expectNoHorizontalOverflow(page, width);

    // Create a real invalid duplicate input through the same connection controls users operate.
    await page.getByText('添加连接', { exact: true }).click();
    await page
      .getByRole('combobox', { name: '来自', exact: true })
      .selectOption('$input::materials');
    await page
      .getByRole('button', { name: '连接到此步骤', exact: true })
      .click();
    const invalid = await saveInBrowser(page, work.id);
    expect(
      invalid.issues.some(
        (issue) =>
          issue.nodeId === 'branch' && issue.message.includes('多个来源'),
      ),
    ).toBeTruthy();
    await expect(page.locator('.issues-strip')).toContainText('多个来源');
    await page.getByRole('button', { name: '运行流程', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('多个来源');
    expect((await snapshot(request, work.id)).work.runs).toHaveLength(0);
    await page.getByRole('alert').getByRole('button', { name: '关闭' }).click();
    await page
      .getByRole('button', {
        name: '删除连接 工作材料 到 按内容分流',
        exact: true,
      })
      .click();
    const repaired = await saveInBrowser(page, work.id);
    expect(repaired.issues).toEqual([]);
    await expect(page.locator('.issues-strip')).toHaveCount(0);

    await page.getByRole('button', { name: '运行流程', exact: true }).click();
    await expect
      .poll(
        async () => (await snapshot(request, work.id)).work.runs.at(-1)?.status,
      )
      .toBe('completed');
    await page.getByRole('tab', { name: /运行结果/ }).click();
    await expect(page.locator('.results-toolbar')).toContainText('已完成');
    await expect(page.locator('.final-result')).toContainText(materials[0]);
    await expect(page.locator('.final-result')).toContainText(materials[1]);
    await expect(page.locator('.final-result')).toContainText(materials[2]);
    await page
      .locator('.final-result')
      .getByRole('button', { name: '输入与来源', exact: true })
      .click();
    await expect(page.locator('.final-result .result-detail')).toContainText(
      'M01',
    );
    await expect(page.locator('.final-result .result-detail')).toContainText(
      '来源结果',
    );
    const completed = await snapshot(request, work.id);
    const run = completed.work.runs[0];
    expect(completed.work.runs).toHaveLength(1);
    expect(run.definitionId).toBe(repaired.work.draftId);
    expect(run.results.filter((r) => r.nodeId === 'matched')).toHaveLength(1);
    expect(
      run.results
        .find((r) => r.nodeId === 'branch')
        ?.outputs.matched.map((i) => i.materialIds),
    ).toEqual([['M01']]);
    expect(
      run.results.find((r) => r.nodeId === 'branch')?.outputs.unmatched,
    ).toHaveLength(2);
    expect(
      run.results
        .find((r) => r.nodeId === 'merge')
        ?.outputs.output.map((i) => i.value),
    ).toEqual(materials);
    await expectNoHorizontalOverflow(page, width);
    await testInfo.attach(`results-${width}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    await page.reload();
    await expect(
      page.getByRole('heading', { name: work.goal, exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('.react-flow__node[data-id="prepare"]'),
    ).toContainText('保留原始反馈与编号');
    await page.locator('.react-flow__node[data-id="branch"]').click();
    await expect(page.getByLabel('值', { exact: true })).toHaveValue('失败');
    await expectNoHorizontalOverflow(page, width);
    await page.getByRole('tab', { name: /运行结果/ }).click();
    await expect(page.locator('.final-result')).toContainText(materials[2]);
    expect(
      (await snapshot(request, work.id)).work.runs.map((r) => r.id),
    ).toEqual([run.id]);
    expect(errors).toEqual([]);
    await testInfo.attach(`reopened-${width}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}
