import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server/index.ts';
import { seedCatalog } from './catalog-fixture.ts';
import { interfaceFixture } from './interface-fixture.ts';
import type { SessionInput } from '../src/server/assistant/pi.ts';
import { itemConversationMessages } from '../src/shared/workitem-conversations.ts';

test('item conversations preserve business state, isolate sessions, resume history and reject foreign IDs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'item-conversations-'));
  const calls: SessionInput[] = [];
  const runner = async (input: SessionInput) => {
    calls.push(input);
    const prompt = JSON.parse(input.prompt);
    assert.equal(prompt.workspace.work.messages, undefined);
    if (prompt.instruction === '真实失败替身')
      throw Error('explicit fixture model failure');
    return `fixture reply: ${prompt.instruction}`;
  };
  await seedCatalog(root, {
    baseUrl: 'https://fixture.invalid',
    model: 'fixture',
    apiKey: 'fixture-not-real',
  });
  let app = await createApplication({ dataRoot: root, runSession: runner });
  const post = async (path: string, body: unknown) =>
    app.app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const current = async (id: string) =>
    (
      await app.app.request(`/api/items/${id}/workspace`)
    ).json() as Promise<any>;
  const finish = async (id: string, requestId: string) => {
    let value: any;
    for (let i = 0; i < 100; i++) {
      value = await current(id);
      const message = value.work.work.messages.find(
        (m: any) => m.role === 'assistant' && m.requestId === requestId,
      );
      if (['completed', 'failed', 'cancelled'].includes(message?.status))
        return value;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw Error('fixture did not finish');
  };
  try {
    const scenario = await interfaceFixture(app),
      id = scenario.item.id,
      path = `/api/items/${id}/workspace/actions`;
    await app.files.change(scenario.ws.work.work.id, (work) =>
      work.messages.push({
        id: 'legacy-message',
        role: 'user',
        text: '原有会话材料',
      }),
    );
    const before = await current(id);
    let receipt = (await (
      await post(path, { action: 'assistant', text: '主会话继续' })
    ).json()) as any;
    let ws = await finish(id, receipt.requestId);
    assert.equal(receipt.conversationId, 'main');
    assert.ok(calls[0].sessionDir!.endsWith('/work-item'));
    const created = (await (
      await post(path, { action: 'createConversation' })
    ).json()) as any;
    const second = created.conversationId;
    assert.notEqual(second, 'main');
    assert.equal(created.work.work.assistantConversations.length, 2);
    assert.equal(itemConversationMessages(created.work.work, second).length, 0);
    assert.equal(
      itemConversationMessages(created.work.work, 'main')[0].text,
      '原有会话材料',
    );
    receipt = (await (
      await post(path, {
        action: 'assistant',
        text: '新的讨论',
        conversationId: second,
      })
    ).json()) as any;
    ws = await finish(id, receipt.requestId);
    const secondDir = calls.at(-1)!.sessionDir;
    assert.ok(secondDir!.endsWith(`/work-item-conversations/${second}`));
    assert.notEqual(secondDir, calls[0].sessionDir);
    assert.equal(itemConversationMessages(ws.work.work, second).length, 2);
    assert.equal(itemConversationMessages(ws.work.work, 'main').length, 3);
    for (const field of ['draftId', 'definitionIds', 'runs'])
      assert.deepEqual(ws.work.work[field], before.work.work[field]);
    for (const field of [
      'criteria',
      'inputBindings',
      'receivedInputs',
      'uiProgram',
      'deliveries',
    ])
      assert.deepEqual(ws.item[field], before.item[field]);
    const foreign = (await (
      await post(path, { action: 'createConversation' })
    ).json()) as any;
    const other = await interfaceFixture(app);
    const response = await post(
      `/api/items/${other.item.id}/workspace/actions`,
      {
        action: 'assistant',
        text: '不应写入',
        conversationId: foreign.conversationId,
      },
    );
    assert.equal(response.status, 400);
    assert.equal(
      ((await response.json()) as any).code,
      'CONVERSATION_NOT_FOUND',
    );
    assert.equal((await current(other.item.id)).work.work.messages.length, 0);
    receipt = (await (
      await post(path, {
        action: 'assistant',
        text: '真实失败替身',
        conversationId: foreign.conversationId,
      })
    ).json()) as any;
    ws = await finish(id, receipt.requestId);
    assert.equal(
      itemConversationMessages(ws.work.work, foreign.conversationId).at(-1)
        ?.status,
      'failed',
    );
    assert.equal(
      itemConversationMessages(ws.work.work, second).at(-1)?.status,
      'completed',
    );
    app.runs.close();
    app.batches.close();
    app = await createApplication({ dataRoot: root, runSession: runner });
    receipt = (await (
      await post(path, {
        action: 'assistant',
        text: '重新打开后继续',
        conversationId: second,
      })
    ).json()) as any;
    ws = await finish(id, receipt.requestId);
    assert.equal(calls.at(-1)!.sessionDir, secondDir);
    assert.equal(itemConversationMessages(ws.work.work, second).length, 4);
    assert.equal(ws.work.work.runs.length, 0);
  } finally {
    app.runs.close();
    app.batches.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('requests in different conversations remain serial and late replies keep their original conversation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'item-conversation-queue-'));
  await seedCatalog(root, {
    baseUrl: 'https://fixture.invalid',
    model: 'fixture',
    apiKey: 'fixture-not-real',
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started: string[] = [];
  const app = await createApplication({
    dataRoot: root,
    runSession: async (input) => {
      const text = JSON.parse(input.prompt).instruction;
      started.push(text);
      if (text === 'first') await gate;
      return text;
    },
  });
  try {
    const s = await interfaceFixture(app),
      path = `/api/items/${s.item.id}/workspace/actions`;
    const post = async (body: unknown) => {
      const r = await app.app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(r.status, 200);
      return r.json() as Promise<any>;
    };
    const second = (await post({ action: 'createConversation' }))
      .conversationId;
    await post({ action: 'assistant', text: 'first', conversationId: 'main' });
    await post({ action: 'assistant', text: 'second', conversationId: second });
    assert.deepEqual(started, ['first']);
    release();
    let ws: any;
    for (let i = 0; i < 100; i++) {
      ws = await (
        await app.app.request(`/api/items/${s.item.id}/workspace`)
      ).json();
      if (
        itemConversationMessages(ws.work.work, second).at(-1)?.status ===
        'completed'
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.deepEqual(started, ['first', 'second']);
    assert.equal(
      itemConversationMessages(ws.work.work, 'main').at(-1)?.text,
      'first',
    );
    assert.equal(
      itemConversationMessages(ws.work.work, second).at(-1)?.text,
      'second',
    );
  } finally {
    release();
    app.runs.close();
    app.batches.close();
    await rm(root, { recursive: true, force: true });
  }
});
