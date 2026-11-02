import { selectCanvasNode } from './canvas-actions';
import { test, expect } from './fixtures';
import type { Definition, FlowNode, Snapshot } from '../../src/shared/records';
const definition: Definition = {
  schemaVersion: 1,
  inputs: ['materials'],
  nodes: [
    ...['调查', '修复', '验证'].map((id, index): FlowNode => ({
      id,
      label: id,
      kind: 'function',

      operation: 'map',
      functionName: 'expression',
      expression: {
        kind: 'literal',
        value: { id: index < 2 ? 'A' : 'B', source: id },
      },
    })),
    ...['merge', 'collect'].map((functionName): FlowNode => ({
      id: functionName,
      label: functionName === 'merge' ? '多路汇合' : '具名收集',
      kind: 'function',

      operation: 'aggregate',
      functionName: functionName as 'merge' | 'collect',
      inputNames: ['调查', '修复', '验证'],
    })),
    {
      id: 'join',
      label: '按键关联',
      kind: 'function',

      operation: 'aggregate',
      functionName: 'join',
      join: {
        type: 'full',
        leftKey: ['id'],
        rightKey: ['id'],
        duplicates: 'all',
      },
    },
  ],
  edges: [
    ...['调查', '修复', '验证'].map((id) => ({
      from: ['$input', 'materials'] as [string, string],
      to: [id, 'input'] as [string, string],
    })),
    ...['merge', 'collect'].flatMap((id) =>
      ['调查', '修复', '验证'].map((port) => ({
        from: [port, 'output'] as [string, string],
        to: [id, port] as [string, string],
      })),
    ),
    { from: ['调查', 'output'], to: ['join', 'left'] },
    { from: ['修复', 'output'], to: ['join', 'right'] },
  ],
  outputs: {
    merged: ['merge', 'output'],
    collected: ['collect', 'output'],
    joined: ['join', 'output'],
  },
};
for (const [width, height] of [
  [1440, 900],
  [1024, 768],
]) {
  test(`ELK真实端口布局、关系聚焦、拖动和重开 ${width}`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const initial: Snapshot = await (
      await request.post('/api/works', {
        data: {
          goal: `自动验收 画布布局 ${width} ${Date.now()}`,
          materials: ['触发'],
        },
      })
    ).json();
    const id = initial.work.id;
    const snapshot = async (): Promise<Snapshot> =>
      (await request.get(`/api/works/${id}`)).json();
    try {
      await request.post(`/api/works/${id}/actions`, {
        data: { action: 'saveDraft', definition },
      });
      const before = await snapshot();
      // 侧栏只列显式打开的流水线（opened-pipelines 语义）；预置本浏览器的打开入口。
      await page.goto(`/methods/${id}`, { waitUntil: 'domcontentloaded' });
      await page
        .locator('.work-list')
        .getByRole('link', { name: initial.work.title, exact: true })
        .click();
      await expect(page.locator('[data-routing="elk"]')).toHaveCount(
        definition.edges.length,
      );
      await expect
        .poll(async () => Boolean((await snapshot()).work.view.routing))
        .toBe(true);
      const arranged = await snapshot(),
        positions = arranged.work.view.positions;
      expect(arranged.work.draftId).toBe(before.work.draftId);
      expect(arranged.definitions).toEqual(before.definitions);
      expect(positions['调查'].x).toBe(positions['修复'].x);
      expect(positions['调查'].x).toBe(positions['验证'].x);
      expect(positions.merge.x).toBeGreaterThan(positions['调查'].x);
      const nodes = page.locator('.react-flow__node');
      const overlaps = await nodes.evaluateAll((elements) => {
        const boxes = elements.map((e) => e.getBoundingClientRect());
        return boxes.some((a, i) =>
          boxes.some(
            (b, j) =>
              j > i &&
              a.left < b.right &&
              a.right > b.left &&
              a.top < b.bottom &&
              a.bottom > b.top,
          ),
        );
      });
      expect(overlaps).toBe(false);
      await selectCanvasNode(page, 'collect');
      await expect(
        page.locator('.react-flow__edge.connection-focus'),
      ).toHaveCount(3);
      await expect(
        page.locator('.react-flow__edge.connection-dim'),
      ).toHaveCount(8);
      const exactPort = page.locator(
        '.react-flow__node[data-id="collect"] .react-flow__handle[data-handleid="调查"]',
      );
      await exactPort.focus();
      await expect(
        page.locator('.react-flow__edge.connection-focus'),
      ).toHaveCount(1);
      await expect(page.locator('.canvas-connection-info')).toContainText(
        '调查 · 输出 → 具名收集 · 调查',
      );
      await page.getByRole('button', { name: '显示端口', exact: true }).focus();
      await page
        .getByRole('button', { name: '显示端口', exact: true })
        .press('Enter');
      await expect(
        page.getByRole('button', { name: '显示端口', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect
        .poll(async () => (await snapshot()).work.view.showPorts)
        .toBe(true);
      await page.mouse.move(5, 5);
      await page.screenshot({
        path: testInfo.outputPath(`layout-focus-${width}.png`),
      });
      expect((await snapshot()).work.view.positions).toEqual(positions);
      await page.getByRole('button', { name: '运行流程', exact: true }).click();
      await expect
        .poll(async () => (await snapshot()).work.runs.at(-1)?.status)
        .toBe('completed');
      const ran = await snapshot();
      expect(ran.work.view.positions).toEqual(positions);
      expect(ran.work.draftId).toBe(before.work.draftId);
      const run = ran.work.runs.at(-1)!;
      expect(
        run.results.find((r) => r.nodeId === 'merge')!.outputs.output,
      ).toHaveLength(3);
      expect(
        run.results.find((r) => r.nodeId === 'collect')!.outputs.output,
      ).toHaveLength(1);
      await page.getByRole('tab', { name: '流程', exact: true }).click();
      await expect(page.locator('[data-routing="elk"]')).toHaveCount(
        definition.edges.length,
      );
      await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
      await page.locator('.react-flow__controls-fitview').click();
      const node = page.locator(
        '.react-flow__node[data-id="collect"] .node-heading',
      );
      const box = (await node.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2 - 25,
        box.y + box.height / 2 + 25,
        { steps: 8 },
      );
      await page.mouse.up();
      await expect
        .poll(async () =>
          JSON.stringify((await snapshot()).work.view.positions),
        )
        .not.toBe(JSON.stringify(positions));
      const manual = (await snapshot()).work.view.positions;
      await expect(page.locator('[data-routing="elk"]')).toHaveCount(0);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(
        page.getByRole('button', { name: '整理布局', exact: true }),
      ).toBeEnabled();
      expect((await snapshot()).work.view.positions).toEqual(manual);
      await expect(
        page.getByRole('button', { name: '显示端口', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: '整理布局', exact: true }).focus();
      await page
        .getByRole('button', { name: '整理布局', exact: true })
        .press('Enter');
      await expect(page.locator('[data-routing="elk"]')).toHaveCount(
        definition.edges.length,
      );
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-routing="elk"]')).toHaveCount(
        definition.edges.length,
      );
      await page.screenshot({
        path: testInfo.outputPath(`layout-reopen-${width}.png`),
      });
      expect(errors).toEqual([]);
    } finally {
      await request.post(`/api/works/${id}/actions`, {
        data: { action: 'archive', archived: true },
      });
    }
  });
}

test('迟到布局不覆盖整理期间的手动拖动', async ({ page, request }) => {
  const initial: Snapshot = await (
    await request.post('/api/works', {
      data: { goal: `自动验收 布局竞态 ${Date.now()}`, materials: ['触发'] },
    })
  ).json();
  const id = initial.work.id;
  const snapshot = async (): Promise<Snapshot> =>
    (await request.get(`/api/works/${id}`)).json();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  // Delay the actual lazy chunk used by the packaged application.
  await page.route('**/assets/canvas-layout-*.js', async (route) => {
    requested = true;
    await gate;
    await route.continue();
  });
  try {
    await request.post(`/api/works/${id}/actions`, {
      data: { action: 'saveDraft', definition },
    });
    const positions = Object.fromEntries(
      ['$input', ...definition.nodes.map((n) => n.id)].map((id, i) => [
        id,
        { x: 30 + (i % 3) * 300, y: 40 + Math.floor(i / 3) * 220 },
      ]),
    );
    await request.post(`/api/works/${id}/actions`, {
      data: {
        action: 'saveLayout',
        view: { positions, viewport: { x: 0, y: 0, zoom: 0.65 } },
      },
    });
    // 侧栏只列显式打开的流水线（opened-pipelines 语义）；预置本浏览器的打开入口。
    await page.goto(`/methods/${id}`, { waitUntil: 'domcontentloaded' });
    await page
      .locator('.work-list')
      .getByRole('link', { name: initial.work.title, exact: true })
      .click();
    const arrange = page.getByRole('button', { name: '整理布局', exact: true });
    if (await arrange.isEnabled()) await arrange.click();
    await expect.poll(() => requested).toBe(true);
    const node = page.locator(
      '.react-flow__node[data-id="调查"] .node-heading',
    );
    const box = (await node.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 40,
      box.y + box.height / 2 + 30,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect
      .poll(async () => JSON.stringify((await snapshot()).work.view.positions))
      .not.toBe(JSON.stringify(positions));
    const manual = (await snapshot()).work.view.positions;
    release();
    // The delayed request must settle without adopting positions after manual movement.
    await expect(
      page.getByRole('button', { name: '整理布局', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: '显示端口', exact: true }).click();
    await expect
      .poll(async () => (await snapshot()).work.view.showPorts)
      .toBe(true);
    expect((await snapshot()).work.view.positions).toEqual(manual);
    expect((await snapshot()).work.view.routing).toBeUndefined();
    await expect(
      page.getByRole('button', { name: '整理布局', exact: true }),
    ).toBeEnabled();
  } finally {
    release();
    await request.post(`/api/works/${id}/actions`, {
      data: { action: 'archive', archived: true },
    });
  }
});
