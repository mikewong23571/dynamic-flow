import type { Definition } from '../src/shared/records';
import type { Expression } from '../src/shared/expressions';
import type { createApplication } from '../src/server/index';

/** Synthetic, deterministic data: no domain judgment or model output. */
export async function primitiveDisplayFixture(
  app: Awaited<ReturnType<typeof createApplication>>,
) {
  const post = async (path: string, fields: unknown) => {
    const response = await app.app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (!response.ok) throw Error(await response.text());
    return response.json() as Promise<any>;
  };
  const method = await app.work.createWork(
    '保留明确给定的记录与共同依据，不增加业务判断',
    [],
  );
  await app.work.rename(method.id, '读取给定记录');
  const fields: Record<string, Expression> = {
    id: { kind: 'variable', name: 'input', path: ['records', 0, 'id'] },
    title: { kind: 'variable', name: 'input', path: ['records', 0, 'title'] },
    review: { kind: 'variable', name: 'input', path: ['records', 0, 'review'] },
    facts: { kind: 'variable', name: 'input', path: ['facts'] },
  };
  const definition: Definition = {
    schemaVersion: 1,
    inputs: ['records', 'facts'],
    nodes: [
      {
        id: 'gather',
        label: '收齐记录和共同依据',
        kind: 'function',
        functionName: 'collect',
        inputNames: ['records', 'facts'],

        operation: 'aggregate',
      },
      {
        id: 'emit',
        label: '匹配已给标记并保留依据',
        kind: 'function',
        functionName: 'expression',

        operation: 'map',
        expression: {
          kind: 'match',
          value: { kind: 'variable', name: 'input', path: ['records', 0] },
          cases: [
            {
              pattern: {
                kind: 'object',
                fields: { review: { kind: 'literal', value: true } },
              },
              then: {
                kind: 'object',
                fields: {
                  ...fields,
                  lane: { kind: 'literal', value: 'review' },
                },
              },
            },
          ],
          otherwise: {
            kind: 'object',
            fields: { ...fields, lane: { kind: 'literal', value: 'ready' } },
          },
        },
      },
    ],
    edges: [
      { from: ['$input', 'records'], to: ['gather', 'records'] },
      { from: ['$input', 'facts'], to: ['gather', 'facts'] },
      { from: ['gather', 'output'], to: ['emit', 'input'] },
    ],
    outputs: { records: ['emit', 'output'] },
  };
  const version = await app.flow.saveDraft(method.id, undefined, definition);
  const item = await post('/api/items', {
    title: '演示·逐项应用与条件分路',
    goal: '仅按合成输入中的标记分路，保留固定方法与来源。',
    materials: ['合成记录 P1/P2/P3，共同依据作为独立输入。'],
    criteria: [],
  });
  const path = `/api/items/${item.id}/workspace`;
  let ws = await post(`${path}/actions`, { action: 'init' });
  const flow: Definition = {
    schemaVersion: 1,
    inputs: ['records', 'facts'],
    nodes: [
      {
        id: 'apply',
        label: '逐项读取来件，共享共同依据',
        kind: 'call',

        operation: 'map',
        call: {
          workId: method.id,
          definitionId: version,
          inputNames: ['records', 'facts'],
          outputNames: ['records'],
          eachPort: 'records',
        },
      },
      {
        id: 'route',
        label: '按已给标记分路',
        kind: 'branch',

        operation: 'aggregate',
        condition: { field: 'lane', operator: 'equals', value: 'review' },
      },
      {
        id: 'collect',
        label: '收集两路处理清单',
        kind: 'function',
        functionName: 'collect',
        inputNames: ['review', 'ready'],

        operation: 'aggregate',
      },
    ],
    edges: [
      { from: ['$input', 'records'], to: ['apply', 'records'] },
      { from: ['$input', 'facts'], to: ['apply', 'facts'] },
      { from: ['apply', 'records'], to: ['route', 'input'] },
      { from: ['route', 'matched'], to: ['collect', 'review'] },
      { from: ['route', 'unmatched'], to: ['collect', 'ready'] },
    ],
    outputs: { ready: ['route', 'unmatched'], lists: ['collect', 'output'] },
  };
  const action = async (fields: Record<string, unknown>) =>
    (ws = await post(`${path}/actions`, {
      ...fields,
      baseRevision: ws.item.revision,
    }));
  await action({ action: 'saveFlow', definition: flow });
  for (let i = 1; i <= 3; i++)
    await action({
      action: 'addInput',
      inputPort: 'records',
      label: `来件 ${i}`,
      value: { id: `P${i}`, title: `合成来件 ${i}`, review: i !== 2 },
      materialIds: [item.materials[0].id],
    });
  await action({
    action: 'addInput',
    inputPort: 'facts',
    label: '共同依据',
    value: { source: 'synthetic-shared-fact' },
    materialIds: [item.materials[0].id],
  });
  await action({
    action: 'saveUiProgram',
    source:
      'root = Workspace("分路交付", [Records("ready", "可直接交付", "id", [Field("id", "编号"), Field("title", "来件")]), Report("lists", "分路汇总")])',
  });
  return {
    item,
    ws,
    method,
    version,
    flow,
    path,
    post,
    action,
    current: () => ws,
  };
}
