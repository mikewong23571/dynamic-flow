import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFiles } from '../src/server/files/index.ts';
import { createFlow } from '../src/server/flow/index.ts';
import { createWorkService } from '../src/server/work/index.ts';
import { createAssistant } from '../src/server/assistant/index.ts';
import { seedCatalog } from './catalog-fixture.ts';
import type { Definition } from '../src/shared/records.ts';
test('作者局部工具只提交目标步骤，保留问题认知与其它结构；节点会话接收合同', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'semantic-author-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = createFiles(root),
    flow = createFlow(files),
    work = await createWorkService(files).createWork('调查输入', ['事实']);
  const contract = {
    responsibility: '调查',
    done: '结论有依据',
    rationale: '当前未知',
    semanticRole: '调查对象',
  };
  const definition: Definition = {
    schemaVersion: 1,
    problem: {
      framing: '现象待解释',
      known: '收到事实',
      unknown: '原因',
      constraints: '只用证据',
      evidence: 'M01',
    },
    inputs: ['input'],
    nodes: [
      {
        id: 'step',
        kind: 'agent',
        mode: 'each',
        task: '调查',
        label: '调查',
        contract,
      },
    ],
    edges: [{ from: ['$input', 'input'], to: ['step', 'input'] }],
    outputs: { output: ['step', 'output'] },
  };
  const id = await flow.saveDraft(work.id, undefined, definition);
  let mode = 'author';
  const paths = await seedCatalog(root, {
    baseUrl: 'http://test.invalid',
    model: 'fixture',
    apiKey: 'test-only',
  });
  const assistant = createAssistant(files, flow, {
    ...paths,
    runSession: async (input) => {
      if (mode === 'author') {
        assert.match(input.systemPrompt, /最小有用/);
        const tool = input.tools.find((x) => x.name === 'update_step')!;
        assert.ok(tool);
        await tool.execute(
          'edit',
          { node: { ...definition.nodes[0], task: '调查并附证据' } },
          input.signal,
          undefined,
          {} as never,
        );
        return '已修改';
      }
      const prompt = JSON.parse(input.prompt);
      assert.deepEqual(prompt.contract, contract);
      assert.deepEqual(prompt.problem, definition.problem);
      if (mode === 'dynamic') {
        assert.match(input.systemPrompt, /禁止 dynamic/);
        assert.deepEqual(input.builtinTools, []);
        const submit = input.tools.find((t) => t.name === 'submit_workflow')!;
        await assert.rejects(
          submit.execute(
            'bad',
            {
              definition: {
                ...definition,
                nodes: [{ ...definition.nodes[0], kind: 'dynamic' }],
              },
            },
            input.signal,
            undefined,
            {} as never,
          ),
        );
        await submit.execute(
          'good',
          { definition },
          input.signal,
          undefined,
          {} as never,
        );
        return '已提交计划，不把最终聊天文本当成定义。';
      }
      return '依据事实的结果';
    },
  });
  const request = await assistant.requestEdit(work.id, {
    text: '只修改调查任务',
    expectedDraftId: id,
    nodeId: 'step',
  });
  for (let n = 0; n < 200; n++) {
    const msg = (await files.read(work.id)).messages.find(
      (m) => m.requestId === request && m.role === 'assistant',
    )!;
    if (msg.status === 'failed') assert.fail(msg.error);
    if (msg.status === 'completed') break;
    await new Promise((r) => setTimeout(r, 5));
  }
  const current = await files.read(work.id);
  assert.equal(current.messages.at(-1)?.status, 'completed');
  const saved = await files.readDefinition(work.id, current.draftId!);
  assert.equal(saved.nodes[0].task, '调查并附证据');
  assert.deepEqual(saved.problem, definition.problem);
  assert.deepEqual(saved.edges, definition.edges);
  mode = 'step';
  const context = {
    workId: work.id,
    runId: 'r',
    definitionId: id,
    instanceId: 'i',
    node: definition.nodes[0],
    problem: definition.problem,
    inputs: { input: [] },
    materials: [],
    signal: new AbortController().signal,
    onActivity: async () => {},
  };
  await assistant.executeNode(context);
  mode = 'dynamic';
  await assistant.executeNode({
    ...context,
    node: {
      ...context.node,
      kind: 'dynamic',
      mode: 'all',
      dynamic: { boundary: '局部', maxNodes: 3 },
    },
  });
});
