import { test, expect, type APIRequestContext, type Page } from './fixtures';
import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../../src/server/index.ts';
import type { Definition, Snapshot, Json } from '../../src/shared/records.ts';

// Real runtime/HTTP/files and built frontend; only the Agent response is a
// deterministic fixture. Ordinary methods use the current URL navigation.
let application: Awaited<ReturnType<typeof createApplication>>;
let server: Server;
let root: string;
let url: string;
const pendingOutputs = new Map<string, () => void>();
const report: Definition = {
  schemaVersion: 1,
  inputs: ['materials'],
  nodes: [
    {
      id: 'report',
      label: '生成周报',
      kind: 'agent',

      operation: 'aggregate',
      task: '汇总',
      expectedOutput: { type: 'string' },
    },
  ],
  edges: [{ from: ['$input', 'materials'], to: ['report', 'input'] }],
  outputs: { report: ['report', 'output'] },
};
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'item-workspace-'));
  pendingOutputs.clear();
  application = await createApplication({
    dataRoot: root,
    executeNode: async (context): Promise<Json> => {
      if (context.node.id === 'reading-late') {
        const key = String(context.inputs.input[0].value);
        await new Promise<void>((resolve) => pendingOutputs.set(key, resolve));
        return { account: key };
      }
      if (context.node.id === 'retryable') {
        if (context.node.task === 'fail') throw Error('fixture：材料校验失败');
        return { checked: context.inputs.input[0].value };
      }
      throw Error(`Unexpected fixture node ${context.node.id}`);
    },
  });
  server = serve({
    fetch: application.app.fetch,
    hostname: '127.0.0.1',
    port: 0,
  }) as Server;
  if (!server.listening)
    await new Promise<void>((resolve) => server.once('listening', resolve));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterEach(async () => {
  await application.runs.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
});
async function api<T>(
  request: APIRequestContext,
  path: string,
  data?: unknown,
): Promise<T> {
  const response =
    data === undefined
      ? await request.get(`${url}${path}`)
      : await request.post(`${url}${path}`, { data });
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return response.json();
}
async function method(
  request: APIRequestContext,
  title: string,
  definition: Definition,
) {
  const saved = await api<Snapshot>(request, '/api/works', {
    goal: title,
    materials: [],
  });
  await api(request, `/api/works/${saved.work.id}/actions`, {
    action: 'rename',
    title,
  });
  await api(request, `/api/works/${saved.work.id}/actions`, {
    action: 'saveDraft',
    definition,
  });
  return saved.work.id;
}
test('普通无工作项运行共享检查：失败重试、保留多选续做与从结果改进', async ({
  page,
  request,
}) => {
  const definition: Definition = {
    schemaVersion: 1,
    inputs: ['materials'],
    nodes: [
      {
        id: 'retryable',
        label: '校验普通样本',
        kind: 'agent',
        operation: 'map',
        task: 'fail',
      },
    ],
    edges: [{ from: ['$input', 'materials'], to: ['retryable', 'input'] }],
    outputs: { checked: ['retryable', 'output'] },
  };
  const workId = await method(request, '普通失败与重试', definition);
  let snapshot = await api<Snapshot>(request, `/api/works/${workId}`);
  const firstDefinition = snapshot.work.draftId!;
  const input = (id: string, value: string) => ({
    sampleId: id,
    materialIds: [id],
    sourceResultIds: [],
    value,
  });
  await api(request, `/api/works/${workId}/actions`, {
    action: 'run',
    definitionId: firstDefinition,
    scope: 'full',
    inputs: { materials: [input('M01', '原始试验样本')] },
  });
  await expect
    .poll(
      async () =>
        (await api<Snapshot>(request, `/api/works/${workId}`)).work.runs.at(-1)
          ?.status,
    )
    .toBe('failed');
  snapshot = await api<Snapshot>(request, `/api/works/${workId}`);
  const failedRun = snapshot.work.runs.at(-1)!;
  expect(failedRun.workItem).toBeUndefined();
  await page.goto(`${url}/methods/${workId}`);
  await page.getByRole('tab', { name: /运行结果/ }).click();
  await page.getByRole('tab', { name: '执行过程', exact: true }).click();
  const results = page.locator('.results-view');
  await expect(results).toContainText('fixture：材料校验失败');
  await api(request, `/api/works/${workId}/actions`, {
    action: 'saveDraft',
    expectedDraftId: firstDefinition,
    definition: {
      ...definition,
      nodes: [{ ...definition.nodes[0], task: 'ok' }],
    },
  });
  await expect(
    page.getByRole('heading', { name: '普通失败与重试', exact: true }),
  ).toBeVisible();
  await results
    .getByRole('button', { name: '用所选做法重试此输入', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await api<Snapshot>(request, `/api/works/${workId}`)).work.runs.at(-1)
          ?.status,
    )
    .toBe('completed');
  snapshot = await api<Snapshot>(request, `/api/works/${workId}`);
  const retry = snapshot.work.runs.at(-1)!;
  expect(retry.results[0].input.input[0].value).toBe('原始试验样本');
  expect(retry.workItem).toBeUndefined();
  await page
    .getByRole('combobox', { name: '运行记录', exact: true })
    .selectOption(retry.id);
  await expect(
    results.locator('.item-retained-artifact:not([hidden])'),
  ).toContainText('原始试验样本');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await results.getByRole('button', { name: '复制', exact: true }).click();
  const copiedResult = Object.values(retry.results[0].outputs).flat()[0].value;
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(JSON.stringify(copiedResult, null, 2));
  await results
    .getByRole('button', { name: '保留此结果', exact: true })
    .click();
  await expect(
    results.getByRole('button', { name: '已保留', exact: true }),
  ).toBeVisible();
  await results
    .getByRole('checkbox', { name: '选择此结果', exact: true })
    .check();
  await api(request, `/api/works/${workId}/actions`, {
    action: 'run',
    definitionId: snapshot.work.draftId,
    scope: 'full',
    inputs: { materials: [input('M02', '另一份试验样本')] },
  });
  await expect
    .poll(
      async () =>
        (await api<Snapshot>(request, `/api/works/${workId}`)).work.runs.at(-1)
          ?.status,
    )
    .toBe('completed');
  snapshot = await api<Snapshot>(request, `/api/works/${workId}`);
  const second = snapshot.work.runs.at(-1)!;
  await page
    .getByRole('combobox', { name: '运行记录', exact: true })
    .selectOption(second.id);
  await results
    .getByRole('checkbox', { name: '选择此结果', exact: true })
    .check();
  await expect(page.locator('.selection-bar')).toContainText(
    '跨运行已选 2 条结果',
  );
  await page.getByRole('button', { name: '保留所选结果', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await api<Snapshot>(request, `/api/works/${workId}`)).work
          .keptResultIds.length,
    )
    .toBe(2);
  await page
    .getByRole('button', { name: '用所选结果续做', exact: true })
    .click();
  const resume = page.getByRole('dialog', {
    name: '用指定结果继续工作',
    exact: true,
  });
  await expect(resume).toContainText('原始试验样本');
  await expect(resume).toContainText('另一份试验样本');
  await resume
    .getByRole('button', { name: '确认这些输入并继续', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await api<Snapshot>(request, `/api/works/${workId}`)).work.runs.at(-1)
          ?.status,
    )
    .toBe('completed');
  snapshot = await api<Snapshot>(request, `/api/works/${workId}`);
  const continued = snapshot.work.runs.at(-1)!;
  expect(continued.scope).toEqual({ nodeId: 'retryable' });
  expect(
    continued.inputs.input.flatMap((entry) => entry.sourceResultIds).sort(),
  ).toEqual([retry.results[0].id, second.results[0].id].sort());
  await page
    .getByRole('tab', { name: '执行过程', exact: true })
    .first()
    .click();
  await page
    .getByRole('combobox', { name: '运行记录', exact: true })
    .selectOption(continued.id);
  await results.getByRole('tab', { name: '输入与依据', exact: true }).click();
  const inspectedId = await results
    .locator('.item-retained-artifact:not([hidden])')
    .getAttribute('data-result-id');
  const inspected = continued.results.find(
    (result) => result.id === inspectedId,
  )!;
  const upstreamId = Object.values(inspected.input)
    .flat()
    .flatMap((entry) => entry.sourceResultIds)[0];
  const upstreamRun = snapshot.work.runs.find((run) =>
    run.results.some((result) => result.id === upstreamId),
  )!;
  await results
    .getByRole('button', { name: '上游 · 校验普通样本', exact: true })
    .first()
    .click();
  await expect(results.locator('.run-inspector')).toHaveAttribute(
    'data-run-id',
    upstreamRun.id,
  );
  await expect(
    results.locator('.item-retained-artifact:not([hidden])'),
  ).toHaveAttribute('data-result-id', upstreamId);
  await page.goBack();
  await expect(results.locator('.run-inspector')).toHaveAttribute(
    'data-run-id',
    continued.id,
  );
  await results.getByRole('tab', { name: /^产物/ }).click();
  await results
    .getByRole('button', { name: '从此结果改进', exact: true })
    .click();
  const candidate = page.getByRole('dialog', {
    name: '选择改进的起点',
    exact: true,
  });
  await candidate
    .getByRole('button', { name: '创建候选', exact: true })
    .click();
  await expect(
    page.getByRole('tab', { name: '流程', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  const after = await api<Snapshot>(request, `/api/works/${workId}`);
  expect(after.work.runs.find((run) => run.id === failedRun.id)).toEqual(
    failedRun,
  );
});

test('无成果运行可进入统一空态并继续检查过程', async ({ page, request }) => {
  const definition: Definition = {
    ...report,
    nodes: [{ ...report.nodes[0], id: 'retryable', task: 'fail' }],
    edges: [{ from: ['$input', 'materials'], to: ['retryable', 'input'] }],
    outputs: { report: ['retryable', 'output'] },
  };
  const workflowId = await method(request, '记录核对', definition);
  const snapshot = await api<Snapshot>(request, `/api/works/${workflowId}`);
  await api(request, `/api/works/${workflowId}/actions`, {
    action: 'run',
    definitionId: snapshot.work.draftId,
    scope: 'full',
    inputs: {
      materials: [
        {
          value: '材料',
          sampleId: 'M01',
          materialIds: [],
          sourceResultIds: [],
        },
      ],
    },
  });
  await expect
    .poll(
      async () =>
        (await api<Snapshot>(request, `/api/works/${workflowId}`)).work.runs[0]
          ?.status,
    )
    .toBe('failed');
  await page.goto(`${url}/methods/${workflowId}`);
  await page.getByRole('tab', { name: /运行结果/ }).click();
  const overview = page.getByRole('region', { name: '流水线运行结果总览' });
  await expect(overview).toContainText('0 份成果');
  await overview.getByRole('button', { name: '查看成果', exact: true }).click();
  const resultPage = page.getByRole('region', {
    name: '运行成果',
    exact: true,
  });
  await expect(resultPage).toContainText('此运行尚无可查看的成果');
  await resultPage
    .getByRole('button', { name: '查看过程', exact: true })
    .click();
  await expect(page.locator('.results-view')).toContainText(
    'fixture：材料校验失败',
  );
});

test('首次可用成果与迟到实例保持选择，单节点多端口不混值', async ({
  page,
  request,
}) => {
  const definition: Definition = {
    schemaVersion: 1,
    inputs: ['materials'],
    nodes: [
      {
        id: 'reading-late',
        label: '记录处理',
        kind: 'agent',

        operation: 'map',
        concurrency: 2,
        task: '处理',
      },
    ],
    edges: [{ from: ['$input', 'materials'], to: ['reading-late', 'input'] }],
    outputs: { records: ['reading-late', 'output'] },
  };
  const workflowId = await method(request, '记录处理', definition);
  const snapshot = await api<Snapshot>(request, `/api/works/${workflowId}`);
  await api(request, `/api/works/${workflowId}/actions`, {
    action: 'run',
    definitionId: snapshot.work.draftId,
    scope: 'full',
    inputs: {
      materials: ['第一项', '第二项'].map((value) => ({
        value,
        sampleId: value,
        materialIds: [],
        sourceResultIds: [],
      })),
    },
  });
  await expect.poll(() => pendingOutputs.size).toBe(2);
  try {
    await page.goto(`${url}/methods/${workflowId}`);
    await page.getByRole('tab', { name: /运行结果/ }).click();
    await page.getByRole('button', { name: '查看成果', exact: true }).click();
    await expect(page.getByRole('region', { name: '运行成果' })).toContainText(
      '尚无可查看',
    );
    pendingOutputs.get('第二项')!();
    const reader = page.getByRole('region', { name: '成果详情' });
    await expect(reader).toContainText('第二项');
    const selectedId = await reader.getAttribute('data-artifact-id');
    pendingOutputs.get('第一项')!();
    await expect
      .poll(
        async () =>
          (await api<Snapshot>(request, `/api/works/${workflowId}`)).work
            .runs[0].status,
      )
      .toBe('completed');
    await expect(
      page.getByRole('button', { name: '执行实例', exact: true }),
    ).toContainText('2 项');
    await expect(reader).toHaveAttribute('data-artifact-id', selectedId!);
    await expect(reader).toContainText('第二项');
  } finally {
    for (const resolve of pendingOutputs.values()) resolve();
  }

  const split: Definition = {
    schemaVersion: 1,
    inputs: ['materials'],
    nodes: [
      {
        id: 'split',
        label: '分开记录',
        kind: 'branch',

        operation: 'aggregate',
        condition: { field: 'accepted', operator: 'equals', value: true },
      },
    ],
    edges: [{ from: ['$input', 'materials'], to: ['split', 'input'] }],
    outputs: {
      符合记录: ['split', 'matched'],
      其他记录: ['split', 'unmatched'],
    },
  };
  const second = await method(request, '分开记录', split);
  const secondSnapshot = await api<Snapshot>(request, `/api/works/${second}`);
  const values = [
    { account: '甲', accepted: true },
    { account: '乙', accepted: false },
  ];
  await api(request, `/api/works/${second}/actions`, {
    action: 'run',
    definitionId: secondSnapshot.work.draftId,
    scope: 'full',
    inputs: {
      materials: values.map((value, index) => ({
        value,
        sampleId: String(index),
        materialIds: [],
        sourceResultIds: [],
      })),
    },
  });
  await expect
    .poll(
      async () =>
        (await api<Snapshot>(request, `/api/works/${second}`)).work.runs[0]
          .status,
    )
    .toBe('completed');
  await page.getByRole('link', { name: '流水线', exact: true }).click();
  await page
    .locator('.management-title-button')
    .filter({ hasText: '分开记录' })
    .click();
  await expect(
    page.getByRole('heading', { name: '分开记录', exact: true }),
  ).toHaveText('分开记录');
  await page.getByRole('tab', { name: /运行结果/ }).click();
  await page.getByRole('button', { name: '查看成果', exact: true }).click();
  const resultPage = page.getByRole('region', { name: '运行成果' });
  const reader = page.getByRole('region', { name: '成果详情' });
  await resultPage
    .getByRole('navigation', { name: '成果分组' })
    .getByRole('button', { name: /^其他记录/ })
    .click();
  await expect(reader).toContainText('乙');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await reader.getByRole('button', { name: '复制', exact: true }).click();
  expect(
    JSON.parse(await page.evaluate(() => navigator.clipboard.readText())),
  ).toEqual(values[1]);
  await reader.getByRole('button', { name: '查看过程', exact: true }).click();
  await page.goBack();
  await expect(reader).toContainText('乙');
  await expect(reader).toHaveAttribute('data-artifact-id', /:unmatched:0$/);
});
