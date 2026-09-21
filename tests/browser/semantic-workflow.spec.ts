import { test, expect } from '@playwright/test';
import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApplication } from '../../src/server/index.ts';
import type { Definition, Json, Snapshot } from '../../src/shared/records.ts';
// Build first. Real private HTTP/files/runtime, deterministic model boundary only.
let application: Awaited<ReturnType<typeof createApplication>>,
  server: Server,
  root: string,
  url: string;
const contract = {
  responsibility: '整理当前材料',
  done: '产出可检查的材料',
  rationale: '输入已经是有限同类材料',
  semanticRole: '调查材料',
};
const child: Definition = {
  schemaVersion: 1,
  inputs: ['input'],
  nodes: [
    {
      id: 'review',
      kind: 'function',
      mode: 'each',
      operation: 'map',
      functionName: 'identity',
      label: '核对实际材料',
      contract,
    },
  ],
  edges: [{ from: ['$input', 'input'], to: ['review', 'input'] }],
  outputs: { output: ['review', 'output'] },
};
test.beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'semantic-browser-'));
  application = await createApplication({
    dataRoot: root,
    executeNode: async (c) => {
      if (c.node.kind === 'dynamic') return child as unknown as Json;
      throw Error('没有预设 Agent 结果');
    },
  });
  server = serve({
    fetch: application.app.fetch,
    port: 0,
    hostname: '127.0.0.1',
  }) as Server;
  if (!server.listening)
    await new Promise<void>((r) => server.once('listening', r));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(async () => {
  application.runs.close();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  await rm(root, { recursive: true, force: true });
});
for (const width of [1440, 1024])
  test(`问题、合同、迭代、动态展开与候选重开 ${width}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const initial = (await (
      await request.post(`${url}/api/works`, {
        data: {
          goal: '依据材料决定局部调查步骤',
          materials: ['公告说明仍需复核依赖路径'],
        },
      })
    ).json()) as Snapshot;
    const id = initial.work.id;
    const definition: Definition = {
      schemaVersion: 1,
      inputs: ['materials'],
      nodes: [
        {
          id: 'investigate',
          label: '决定局部调查',
          kind: 'dynamic',
          mode: 'all',
          operation: 'aggregate',
          task: '确定调查方法',
          contract,
          dynamic: { boundary: '只核对当前材料', maxNodes: 3 },
        },
      ],
      edges: [{ from: ['$input', 'materials'], to: ['investigate', 'input'] }],
      outputs: { report: ['investigate', 'output'] },
    };
    expect(
      (
        await request.post(`${url}/api/works/${id}/actions`, {
          data: { action: 'saveDraft', definition },
        })
      ).ok(),
    ).toBeTruthy();
    await page.addInitScript(
      (id) => localStorage.setItem('dynamic-flow.work', id),
      id,
    );
    await page.goto(url);
    await page.getByRole('button', { name: '问题与依据', exact: true }).click();
    await page.getByLabel('当前问题', { exact: true }).fill('依赖影响尚待确认');
    await page.getByLabel('已知事实', { exact: true }).fill('收到一份公告');
    await page.getByLabel('仍待确认', { exact: true }).fill('路径是否可达');
    await page.getByLabel('约束', { exact: true }).fill('仅处理当前证据');
    await page.getByLabel('依据与来源', { exact: true }).fill('M01 公告');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '保存修改', exact: true }),
    ).toHaveCount(0);
    await page.locator('.react-flow__node[data-id="investigate"]').click();
    await expect(
      page.getByRole('textbox', { name: '展开边界', exact: true }),
    ).toHaveValue('只核对当前材料');
    await page
      .getByRole('textbox', { name: '完成条件', exact: true })
      .fill('核对材料并说明依据');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '保存修改', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: '问题与依据', exact: true }),
    ).toBeVisible();
    const evidence = resolve(
      'conductor/tracks/semantic-workflow_20260921/artifacts',
    );
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: join(evidence, `contract-${width}.png`) });
    await page.getByRole('button', { name: '运行流程', exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            (await (
              await request.get(`${url}/api/works/${id}`)
            ).json()) as Snapshot
          ).work.runs.at(-1)?.status,
      )
      .toBe('completed');
    await expect(
      page.getByText('实际展开 · 决定局部调查', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '把展开写为候选', exact: true }),
    ).toBeEnabled();
    await page.screenshot({ path: join(evidence, `expanded-${width}.png`) });
    await page
      .getByRole('button', { name: '把展开写为候选', exact: true })
      .click();
    await expect
      .poll(async () => {
        const s = (await (
          await request.get(`${url}/api/works/${id}`)
        ).json()) as Snapshot;
        return s.definitions[s.work.draftId!].nodes.some(
          (n) => n.kind === 'dynamic',
        );
      })
      .toBe(false);
    await page.reload();
    await page.getByRole('tab', { name: '流程', exact: true }).click();
    await expect(
      page.locator('.react-flow__node[data-id="investigate/review"]'),
    ).toBeVisible();
    await page
      .locator('.react-flow__node[data-id="investigate/review"]')
      .click();
    await page.getByText('有限迭代', { exact: true }).click();
    await page.getByLabel('重复改善此步骤', { exact: true }).check();
    await page.getByLabel('最多轮次', { exact: true }).fill('2');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await page.getByRole('button', { name: '运行流程', exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            (await (
              await request.get(`${url}/api/works/${id}`)
            ).json()) as Snapshot
          ).work.runs.at(-1)?.status,
      )
      .toBe('completed');
    await expect(page.getByText('第 2 轮', { exact: true })).toBeVisible();
    await page.screenshot({ path: join(evidence, `repeat-${width}.png`) });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    expect(errors).toEqual([]);
    const saved = (await (
      await request.get(`${url}/api/works/${id}`)
    ).json()) as Snapshot;
    expect(saved.definitions[saved.work.draftId!].problem?.framing).toBe(
      '依赖影响尚待确认',
    );
    expect(saved.work.runs[0].expansions).toHaveLength(1);
  });
