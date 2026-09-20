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
import type { Definition, FlowNode } from '../src/shared/records.ts';

for (const functionName of ['merge', 'collect', 'join'] as const) {
  test(`作者工具保存 ${functionName} 集合合同；拒绝坏配置并可修正重开`, async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'multi-input-author-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const files = createFiles(root),
      flow = createFlow(files);
    const work = await createWorkService(files).createWork('组合多路结果', [
      '样例',
    ]);
    const ports = functionName === 'join' ? ['left', 'right'] : ['a', 'b', 'c'];
    const node: FlowNode = {
      id: 'combine',
      label: '组合结果',
      kind: 'function',
      functionName,
      mode: 'all',
      operation: 'aggregate',
      ...(functionName === 'join'
        ? {
            join: {
              type: 'full',
              leftKey: ['id'],
              rightKey: ['id'],
              duplicates: 'all',
            } as const,
          }
        : { inputNames: ports }),
      inputSchema: {
        type: 'object',
        properties: Object.fromEntries(
          ports.map((p) => [p, { type: 'array', items: { type: 'object' } }]),
        ),
        required: ports,
      },
      expectedOutput:
        functionName === 'collect'
          ? { type: 'object' }
          : { type: 'array', items: { type: 'object' } },
    };
    const definition: Definition = {
      schemaVersion: 1,
      inputs: ports,
      nodes: [node],
      edges: ports.map((port) => ({
        from: ['$input', port],
        to: ['combine', port],
      })),
      outputs: { combined: ['combine', 'output'] },
    };
    const paths = await seedCatalog(root, {
      baseUrl: 'http://test.invalid',
      model: 'fixture',
      apiKey: 'test-only',
    });
    const assistant = createAssistant(files, flow, {
      ...paths,
      runSession: async (input) => {
        assert.match(input.systemPrompt, /inputNames/);
        assert.match(input.systemPrompt, /每路均是数组/);
        assert.match(input.systemPrompt, /duplicates/);
        const tool = input.tools.find((tool) => tool.name === 'update_flow')!;
        const validate = new Ajv({ strict: false }).compile(tool.parameters);
        assert.equal(
          validate({ definition }),
          true,
          JSON.stringify(validate.errors),
        );
        const malformed = structuredClone(definition);
        if (functionName === 'join')
          malformed.nodes[0].join!.leftKey = [null as never];
        else malformed.nodes[0].inputNames = ['a', 'a'];
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
        return '已保存集合节点';
      },
    });
    const requestId = await assistant.requestEdit(work.id, {
      text: '组合多路结果',
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
}
