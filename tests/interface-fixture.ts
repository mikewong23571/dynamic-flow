import type { Definition } from '../src/shared/records.ts';
import type { createApplication } from '../src/server/index.ts';
export async function interfaceFixture(
  app: Awaited<ReturnType<typeof createApplication>>,
) {
  const post = async (path: string, body: unknown) => {
    const response = await app.app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw Error(await response.text());
    return (await response.json()) as any;
  };
  const rowSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      team: { type: 'string' },
      summary: { type: 'string' },
      note: { type: 'string' },
    },
    required: ['id', 'team', 'summary', 'note'],
  };
  const follow = await app.work.createWork('按实际补充保存所选来件依据', []);
  await app.work.rename(follow.id, '登记补充依据');
  const followVersion = await app.flow.saveDraft(follow.id, undefined, {
    schemaVersion: 1,
    inputs: ['records'],
    inputContracts: {
      records: {
        item: {
          type: 'object',
          properties: {
            record: rowSchema,
            note: { type: 'string', minLength: 1, title: '补充依据' },
          },
          required: ['record', 'note'],
        },
      },
    },
    nodes: [
      {
        id: 'save',
        label: '保存选中来件的补充',
        kind: 'function',
        functionName: 'expression',
        operation: 'map',
        expression: {
          kind: 'object',
          fields: {
            id: { kind: 'variable', name: 'input', path: ['record', 'id'] },
            team: { kind: 'variable', name: 'input', path: ['record', 'team'] },
            summary: {
              kind: 'variable',
              name: 'input',
              path: ['record', 'summary'],
            },
            note: { kind: 'variable', name: 'input', path: ['note'] },
          },
        },
      },
    ],
    edges: [{ from: ['$input', 'records'], to: ['save', 'input'] }],
    outputs: { notes: ['save', 'output'] },
  });
  await app.files.change(follow.id, (work) => {
    work.uiProgramTemplate = {
      id: 'follow-template',
      definitionId: followVersion,
      source:
        'root = Workspace("本轮补充", [Records("notes", "本轮补充", "id", [Field("summary", "来件"), Field("note", "补充依据")])])',
    };
  });
  const method = await app.work.createWork('按原值整理来件，保留来源', []);
  await app.work.rename(method.id, '整理来件');
  const definition: Definition = {
    schemaVersion: 1,
    inputs: ['records'],
    inputContracts: { records: { item: rowSchema } },
    nodes: [
      {
        id: 'read',
        label: '保留原来件',
        kind: 'function',
        functionName: 'identity',
        operation: 'map',
      },
      {
        id: 'check',
        label: '说明当前缺口',
        kind: 'function',
        functionName: 'expression',
        operation: 'aggregate',
        expression: {
          kind: 'object',
          fields: {
            ready: { kind: 'literal', value: false },
            scope: { kind: 'literal', value: '尚有待补充的来件' },
          },
        },
      },
    ],
    edges: [
      { from: ['$input', 'records'], to: ['read', 'input'] },
      { from: ['read', 'output'], to: ['check', 'input'] },
    ],
    outputs: { records: ['read', 'output'], progress: ['check', 'output'] },
  };
  const version = await app.flow.saveDraft(method.id, undefined, definition);
  const source = `root = Workspace("来件处理", [records, form, Report("progress", "当前交付检查")])
$selected = []
$draft = {}
records = Records("records", "按团队核对", "id", [Field("summary", "来件"), Field("note", "已有依据")], $selected, [], [Field("team", "团队"), Field("summary", "来件"), Field("note", "已有依据")], "team")
form = InputForm("records", "补充依据", $draft, next, "${follow.id}", "${followVersion}", ["note"], "records")
next = ActionButton("补充并登记依据", @Run(continueStep))
continueStep = Mutation("continue_records", {output: "records", recordIds: $selected, inputPort: "records", methodId: "${follow.id}", methodDefinitionId: "${followVersion}", draft: $draft, recordField: "record"})`;
  const item = await post('/api/items', {
    title: '通过界面补充来件依据',
    goal: '登记所选来件的补充，保留其它来件及原始来源',
    materials: ['明确提供的原来件'],
    criteria: ['已核对原来件及本轮实际补充，未改写未选范围'],
  });
  let ws = await post(`/api/items/${item.id}/workspace/actions`, {
    action: 'init',
  });
  ws = await post(`/api/items/${item.id}/workspace/actions`, {
    action: 'saveFlow',
    baseRevision: ws.item.revision,
    definition: {
      schemaVersion: 1,
      inputs: ['records'],
      inputContracts: definition.inputContracts,
      nodes: [
        {
          id: 'process',
          label: '整理来件',
          kind: 'call',
          operation: 'aggregate',
          call: {
            workId: method.id,
            definitionId: version,
            inputNames: ['records'],
            outputNames: ['records', 'progress'],
          },
        },
      ],
      edges: [{ from: ['$input', 'records'], to: ['process', 'records'] }],
      outputs: {
        records: ['process', 'records'],
        progress: ['process', 'progress'],
      },
    },
  });
  for (const value of [
    { id: 'R1', team: '平台', summary: '首条原来件', note: '已有依据' },
    { id: 'R2', team: '业务', summary: '待补充的来件', note: '' },
  ])
    ws = await post(`/api/items/${item.id}/workspace/actions`, {
      action: 'addInput',
      baseRevision: ws.item.revision,
      inputPort: 'records',
      label: value.id,
      value,
      materialIds: [item.materials[0].id],
    });
  ws = await post(`/api/items/${item.id}/workspace/actions`, {
    action: 'saveUiProgram',
    baseRevision: ws.item.revision,
    source,
  });
  return { item, ws, source, followId: follow.id, followVersion, post };
}
