import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFiles } from '../src/server/files/index.ts';
import {
  createFlow,
  checkDefinition,
  validateForRun,
} from '../src/server/flow/index.ts';
import { validateExpansion } from '../src/server/flow/expansion.ts';
import { validateValue } from '../src/server/flow/schema.ts';
import { createWorkService } from '../src/server/work/index.ts';
import { createAssistant } from '../src/server/assistant/index.ts';
import { parseCandidates } from '../src/shared/workitem-candidates.ts';
import type { Definition, Json } from '../src/shared/records.ts';
import { seedCatalog } from './catalog-fixture.ts';
const definition: Definition = {
  schemaVersion: 1,
  inputs: ['input'],
  nodes: [
    {
      id: 'create',
      kind: 'create-items',

      operation: 'aggregate',
      label: '建立子项',
      contract: {
        responsibility: '建立独立问题',
        done: '有建立回执',
        rationale: '各问题需要分别推进',
      },
    },
  ],
  edges: [{ from: ['$input', 'input'], to: ['create', 'input'] }],
  outputs: { output: ['create', 'output'] },
};
test('画布与作者共享建项合同；动态提案和非整批配置拒绝', async (t) => {
  validateForRun(definition);
  assert.ok(
    checkDefinition({
      ...definition,
      nodes: [{ ...definition.nodes[0], operation: 'map' }],
    }).some((i) => i.field === 'operation'),
  );
  assert.throws(
    () =>
      validateExpansion(definition, {
        id: 'dynamic',
        label: '规划',
        kind: 'dynamic',

        dynamic: { boundary: '调查', maxNodes: 10 },
      }),
    /不能增加建立子项/,
  );
  const root = await mkdtemp(join(tmpdir(), 'create-author-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = createFiles(root),
    flow = createFlow(files),
    work = await createWorkService(files).createWork('拆开反馈', ['文本']);
  const config = await seedCatalog(root, {
    baseUrl: 'http://test.invalid',
    model: 'fixture',
    apiKey: 'fixture',
  });
  let edited = false;
  const assistant = createAssistant(files, flow, {
    ...config,
    runSession: async (input) => {
      assert.match(input.systemPrompt, /kind:create-items/);
      const tool = input.tools.find((t) => t.name === 'update_flow')!;
      const args = { definition };
      validateValue(
        tool.parameters as unknown as Json,
        args as unknown as Json,
        '作者工具',
      );
      await tool.execute('create', args, input.signal, undefined, {} as never);
      edited = true;
      return '已保存';
    },
  });
  const request = await assistant.requestEdit(work.id, { text: '建立子项' });
  for (let i = 0; i < 200; i++) {
    const message = (await files.read(work.id)).messages.find(
      (m) => m.requestId === request && m.role === 'assistant',
    );
    if (message && message.status !== 'running') {
      assert.equal(message.status, 'completed');
      break;
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.equal(edited, true);
  const current = await files.read(work.id);
  assert.ok(current.draftId);
  assert.equal(
    (await files.readDefinition(work.id, current.draftId!)).nodes[0].kind,
    'create-items',
  );
});
test('候选容器保持候选身份与可编辑缺口，拒绝普通文本和重复ID', () => {
  assert.deepEqual(parseCandidates({ candidates: [{ id: 'a' }] }), [
    { id: 'a' },
  ]);
  assert.throws(() => parseCandidates('说明文字'), /候选清单/);
  assert.throws(() => parseCandidates([{ id: 'a' }, { id: 'a' }]), /重复/);
});
