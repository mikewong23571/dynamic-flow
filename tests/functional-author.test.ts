import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ajv } from 'ajv';
import { createFiles } from '../src/server/files/index.ts';
import { createFlow } from '../src/server/flow/index.ts';
import { createWorkService } from '../src/server/work/index.ts';
import { createAssistant } from '../src/server/assistant/index.ts';
import { seedCatalog } from './catalog-fixture.ts';
import type { Definition } from '../src/shared/records.ts';

test('作者工具承载纯表达式；无效局部绑定被拒绝，修正后实际保存并可重开', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'functional-author-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = createFiles(root),
    flow = createFlow(files);
  const work = await createWorkService(files).createWork('汇总风险得分', [
    '样例',
  ]);
  const definition: Definition = {
    schemaVersion: 1,
    inputs: ['scores'],
    nodes: [
      {
        id: 'sum',
        label: '汇总得分',
        kind: 'function',
        functionName: 'expression',
        mode: 'all',
        operation: 'aggregate',
        inputSchema: { type: 'array', items: { type: 'number' } },
        expectedOutput: { type: 'number' },
        expression: {
          kind: 'reduce',
          input: { kind: 'variable', name: 'input' },
          initial: { kind: 'literal', value: 0 },
          accumulator: 'sum',
          binding: { kind: 'bind', name: 'score' },
          body: {
            kind: 'call',
            function: 'add',
            args: [
              { kind: 'variable', name: 'sum' },
              { kind: 'variable', name: 'score' },
            ],
          },
        },
      },
    ],
    edges: [{ from: ['$input', 'scores'], to: ['sum', 'input'] }],
    outputs: { total: ['sum', 'output'] },
  };
  const paths = await seedCatalog(root, {
    baseUrl: 'http://test.invalid',
    model: 'fixture',
    apiKey: 'test-only',
  });
  const assistant = createAssistant(files, flow, {
    ...paths,
    runSession: async (input) => {
      assert.match(input.systemPrompt, /reduce.*initial/);
      assert.match(input.systemPrompt, /otherwise/);
      const tool = input.tools.find((tool) => tool.name === 'update_flow')!;
      const validate = new Ajv({ strict: false }).compile(tool.parameters);
      assert.equal(
        validate({ definition }),
        true,
        JSON.stringify(validate.errors),
      );
      const malformed = structuredClone(definition);
      malformed.nodes[0].expression = { kind: 'variable', name: 'unknown' };
      await assert.rejects(
        tool.execute(
          'bad',
          { definition: malformed },
          input.signal,
          undefined,
          {} as never,
        ),
      );
      assert.equal((await files.read(work.id)).draftId, undefined);
      await tool.execute(
        'good',
        { definition },
        input.signal,
        undefined,
        {} as never,
      );
      const saved = await files.read(work.id);
      assert.ok(saved.draftId);
      assert.deepEqual(
        await files.readDefinition(work.id, saved.draftId),
        definition,
      );
      return '已经保存汇总得分。';
    },
  });
  const requestId = await assistant.requestEdit(work.id, {
    text: '用有初值的顺序归约汇总得分',
  });
  let completed = false;
  for (let n = 0; n < 300; n++) {
    const message = (await files.read(work.id)).messages.find(
      (m) => m.role === 'assistant' && m.requestId === requestId,
    )!;
    if (message.status === 'failed') assert.fail(message.error);
    if (message.status === 'completed') {
      completed = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(completed, '作者请求必须完成');
  const reopened = createFiles(root),
    saved = await reopened.read(work.id);
  assert.deepEqual(
    await reopened.readDefinition(work.id, saved.draftId!),
    definition,
  );
});
