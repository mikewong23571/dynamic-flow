import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server/index.ts';
import { seedCatalog } from './catalog-fixture.ts';
import type { Definition } from '../src/shared/records.ts';
import type { SessionInput } from '../src/server/assistant/pi.ts';

const definition = (output: string): Definition => ({
  schemaVersion: 1,
  inputs: ['records'],
  nodes: [
    {
      id: 'keep',
      label: '原值',
      kind: 'function',

      operation: 'map',
      functionName: 'identity',
    },
  ],
  edges: [{ from: ['$input', 'records'], to: ['keep', 'input'] }],
  outputs: { [output]: ['keep', 'output'] },
});

test('user references reach the model as exact saved methods, preserve titles and never run implicitly', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'method-references-'));
  await seedCatalog(root, {
    baseUrl: 'https://fixture.invalid',
    model: 'fixture',
    apiKey: 'fixture-only',
  });
  const calls: SessionInput[] = [];
  const app = await createApplication({
    dataRoot: root,
    runSession: async (input) => {
      calls.push(input);
      return '已读取引用合同，未运行。';
    },
  });
  t.after(async () => {
    app.batches.close();
    app.runs.close();
    await rm(root, { recursive: true, force: true });
  });
  const method = await app.work.createWork('参考方法', []);
  await app.work.rename(method.id, '正式整理方法');
  const oldVersion = await app.flow.saveDraft(
    method.id,
    undefined,
    definition('old_rows'),
  );
  const newVersion = await app.flow.saveDraft(
    method.id,
    oldVersion,
    definition('new_rows'),
  );
  await app.flow.adopt(method.id, newVersion);
  const item = await app.items.create({
    title: '引用指导',
    goal: '选择方法后规划',
    materials: [],
  });
  const post = async (body: unknown) =>
    app.app.request(`/api/items/${item.id}/workspace/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const initialized = await post({ action: 'init' });
  const ws = (await initialized.json()) as any;
  const response = await post({
    action: 'assistant',
    text: '以引用的方法检查输入，不执行。',
    methodReferences: [
      { workId: method.id, definitionId: oldVersion, title: '客户端伪造名称' },
      { workId: method.id, definitionId: oldVersion },
    ],
  });
  assert.equal(response.status, 200, await response.clone().text());
  const receipt = (await response.json()) as any;
  let message: any;
  for (let i = 0; i < 100; i++) {
    message = (await app.files.read(ws.work.work.id)).messages.find(
      (m) => m.role === 'assistant' && m.requestId === receipt.requestId,
    );
    if (message?.status === 'completed') break;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(message?.status, 'completed');
  assert.equal(calls.length, 1);
  const prompt = JSON.parse(calls[0].prompt);
  assert.equal(prompt.referencedMethods.length, 1);
  assert.equal(prompt.referencedMethods[0].title, '正式整理方法');
  assert.equal(prompt.referencedMethods[0].definitionId, oldVersion);
  assert.deepEqual(
    Object.keys(prompt.referencedMethods[0].definition.outputs),
    ['old_rows'],
  );
  assert.match(calls[0].systemPrompt, /referencedMethods/);
  assert.ok(calls[0].tools.some((tool) => tool.name === 'check_workspace'));
  const saved = await app.files.read(ws.work.work.id);
  const user = saved.messages.find(
    (m) => m.role === 'user' && m.requestId === receipt.requestId,
  )!;
  assert.deepEqual(user.methodReferences, [
    { workId: method.id, definitionId: oldVersion, title: '正式整理方法' },
  ]);
  assert.equal(saved.runs.length, 0);
  assert.equal((await app.files.read(method.id)).runs.length, 0);
  const before = saved.messages.length;
  const foreignItem = await app.items.create({
    title: '其它业务',
    goal: '独立私有方法',
    materials: [],
  });
  const foreignResponse = await app.app.request(
    `/api/items/${foreignItem.id}/workspace/actions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'init' }),
    },
  );
  const foreignWorkspace = (await foreignResponse.json()) as any;
  const privateId = foreignWorkspace.work.work.id;
  const privateVersion = await app.flow.saveDraft(
    privateId,
    undefined,
    definition('private_rows'),
  );
  for (const methodReferences of [
    [{ workId: method.id, definitionId: 'not-saved' }],
    [{ workId: privateId, definitionId: privateVersion }],
    [{ workId: method.id }],
    Array.from({ length: 9 }, () => ({
      workId: method.id,
      definitionId: oldVersion,
    })),
  ]) {
    const rejected = await post({
      action: 'assistant',
      text: '无效引用',
      methodReferences,
    });
    assert.equal(rejected.status, 400);
    assert.equal(
      (await app.files.read(ws.work.work.id)).messages.length,
      before,
    );
  }
  await app.files.change(method.id, (w) => {
    w.archivedAt = new Date().toISOString();
  });
  assert.equal(
    (
      await post({
        action: 'assistant',
        text: '归档方法不可用',
        methodReferences: [{ workId: method.id, definitionId: oldVersion }],
      })
    ).status,
    400,
  );
  assert.equal(calls.length, 1);
});

test('Assistant method discovery pages beyond the initial catalog preview', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'method-discovery-'));
  await seedCatalog(root, {
    baseUrl: 'https://fixture.invalid',
    model: 'fixture',
    apiKey: 'fixture-only',
  });
  let pages: any[] = [];
  const app = await createApplication({
    dataRoot: root,
    runSession: async (input) => {
      const find = input.tools.find((tool) => tool.name === 'find_methods')!;
      for (const offset of [0, 30]) {
        const result = await find.execute(
          'page-' + offset,
          {
            query: '参考方法',
            offset,
            limit: 30,
          },
          input.signal,
          undefined as never,
          undefined as never,
        );
        pages.push(
          JSON.parse(
            result.content.find((part) => part.type === 'text')!.text!,
          ),
        );
      }
      return '目录可完整读取';
    },
  });
  t.after(async () => {
    app.batches.close();
    app.runs.close();
    await rm(root, { recursive: true, force: true });
  });
  for (let i = 0; i < 32; i++) {
    const method = await app.work.createWork('参考方法 ' + i, []);
    await app.flow.saveDraft(method.id, undefined, definition('rows'));
  }
  const item = await app.items.create({
    title: '完整目录',
    goal: '翻页发现方法',
    materials: [],
  });
  const response = await app.app.request(
    `/api/items/${item.id}/workspace/actions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'assistant', text: '读取全部方法' }),
    },
  );
  assert.equal(response.status, 200);
  for (let i = 0; i < 100 && pages.length < 2; i++)
    await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(
    pages.map((page) => ({
      total: page.total,
      length: page.methods.length,
      hasMore: page.hasMore,
    })),
    [
      { total: 32, length: 30, hasMore: true },
      { total: 32, length: 2, hasMore: false },
    ],
  );
  assert.equal(
    new Set(
      pages.flatMap((p) =>
        p.methods.map((m: any) => m.workId + ':' + m.definitionId),
      ),
    ).size,
    32,
  );
});
