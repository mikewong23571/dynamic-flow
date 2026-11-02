import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApplication } from '../src/server/index.ts';
import { interfaceFixture } from './interface-fixture.ts';
import { createStreamText } from '../src/server/assistant/stream-text.ts';
import { seedCatalog } from './catalog-fixture.ts';
import { invocationBatches } from '../src/server/runs/invocation.ts';
import type { FlowNode, Inputs } from '../src/shared/records.ts';

test('per-item calls copy only their selected input and shared ports, with isolated child inputs', () => {
  let copiedValues = 0;
  const input: Inputs = {
    rows: Array.from({ length: 100 }, (_, i) => ({
      sampleId: String(i),
      materialIds: [],
      sourceResultIds: [],
      get value() {
        copiedValues++;
        return { id: i };
      },
    })),
    targets: [
      {
        sampleId: 'scope',
        value: { name: 'selected scope' },
        materialIds: [],
        sourceResultIds: [],
      },
    ],
  };
  const node: FlowNode = {
    id: 'method',
    label: '逐项应用',
    kind: 'call',

    operation: 'map',
    call: {
      workId: 'fixed-work',
      definitionId: 'fixed-version',
      inputNames: ['rows', 'targets'],
      outputNames: ['result'],
      eachPort: 'rows',
    },
  };
  const batches = invocationBatches(node, input);
  assert.equal(batches.length, 100);
  assert.equal(
    copiedValues,
    100,
    'do not clone all 100 rows for every invocation',
  );
  assert.equal(batches[1].rows[0].sampleId, '1');
  (batches[0].rows[0].value as { id: number }).id = -1;
  (batches[0].targets[0].value as { name: string }).name = 'local change';
  assert.equal((input.rows[0].value as { id: number }).id, 0);
  assert.equal(
    (batches[1].targets[0].value as { name: string }).name,
    'selected scope',
  );
  assert.equal(
    (input.targets[0].value as { name: string }).name,
    'selected scope',
  );
});

test('conditional workspace reads skip the full snapshot and observe edits, uploads, method contracts and external disk changes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'workspace-performance-'));
  const app = await createApplication({ dataRoot: root });
  t.after(async () => {
    app.batches.close();
    app.runs.close();
    await rm(root, { recursive: true, force: true });
  });
  const scenario = await interfaceFixture(app),
    id = scenario.item.id;
  const path = `/api/items/${id}/workspace`;
  let response = await app.app.request(path);
  assert.equal(response.status, 200);
  let etag = response.headers.get('ETag')!;
  let ws = (await response.json()) as any;
  const privateId = ws.work.work.id;
  const originalRead = app.files.read;
  app.files.read = async () => {
    throw Error('unchanged polling must not construct a snapshot');
  };
  const unchanged = await app.app.request(path, {
    headers: { 'If-None-Match': etag },
  });
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), '');
  app.files.read = originalRead;
  async function changed() {
    response = await app.app.request(path, {
      headers: { 'If-None-Match': etag },
    });
    assert.equal(response.status, 200, await response.clone().text());
    assert.notEqual(response.headers.get('ETag'), etag);
    etag = response.headers.get('ETag')!;
    ws = await response.json();
  }
  await app.files.change(privateId, (w) => {
    w.messages.push({ id: 'stream', role: 'assistant', text: '新回复' });
  });
  await changed();
  assert.equal(ws.work.work.messages.at(-1).text, '新回复');
  await app.files.saveUpload(privateId, 'extra.txt', Buffer.from('source'));
  await changed();
  assert.ok(ws.uploads.includes('extra.txt'));
  const method = await app.work.createWork('新的复用方法', []);
  await changed();
  await app.flow.saveDraft(method.id, undefined, {
    schemaVersion: 1,
    inputs: ['rows'],
    nodes: [],
    edges: [],
    outputs: {},
  });
  await changed();
  assert.ok(ws.methods.some((m: any) => m.workId === method.id));
  const itemPath = join(root, 'work-items', `${id}.json`);
  const item = JSON.parse(await readFile(itemPath, 'utf8'));
  item.title = '磁盘外部修订';
  // Deliberately do not increment revision: disk identity must still invalidate the HTTP cache.
  await writeFile(itemPath, JSON.stringify(item));
  await changed();
  assert.equal(ws.item.title, '磁盘外部修订');
  const header = await app.app.request(`/api/works/${privateId}?view=header`);
  const value = (await header.json()) as any;
  assert.equal(value.work.id, privateId);
  assert.equal(value.work.runs, undefined);
  assert.equal(value.work.messages, undefined);
});

test('projection reads remain independent and invalidate when disk content changes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'file-projection-'));
  const app = await createApplication({ dataRoot: root });
  t.after(async () => {
    app.batches.close();
    app.runs.close();
    await rm(root, { recursive: true, force: true });
  });
  const work = await app.work.createWork('完整原文', ['正文']);
  const first = await app.files.select(work.id, (w) => ({
    materials: w.materials,
  }));
  first.materials[0].text = '不可污染';
  assert.equal((await app.files.read(work.id)).materials[0].text, '正文');
  const before = await app.files.version(work.id);
  const saved = JSON.parse(
    await readFile(join(root, work.id, 'work.json'), 'utf8'),
  );
  saved.materials[0].text = '外部替换';
  await writeFile(join(root, work.id, 'work.json'), JSON.stringify(saved));
  assert.notEqual(await app.files.version(work.id), before);
  assert.equal(
    await app.files.select(work.id, (w) => w.materials[0].text),
    '外部替换',
  );
});

test('slow stream persistence does not hold up tokens; terminal writes cannot be overwritten by a queued timer', async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writes: string[] = [];
  const stream = createStreamText(async (text) => {
    writes.push(text);
    await blocked;
  }, 5);
  stream.push('开始');
  await delay(15);
  assert.deepEqual(writes, ['开始']);
  for (let i = 0; i < 100; i++) stream.push('片段');
  assert.equal(writes.length, 1);
  let finished = false;
  const finishing = stream.finish().then(() => {
    finished = true;
  });
  await delay(5);
  assert.equal(finished, false);
  release();
  await finishing;
  assert.equal(stream.text, '开始' + '片段'.repeat(100));
  await delay(15);
  assert.equal(writes.length, 1);
  assert.throws(() => stream.push('迟到'), /结束/);
});

test('stream save failure is surfaced at finalization and the complete received text remains available', async () => {
  const stream = createStreamText(async () => {
    throw Error('disk write failed');
  }, 1);
  stream.push('保留已接收文本');
  await delay(10);
  await assert.rejects(stream.finish(), /disk write failed/);
  assert.equal(stream.text, '保留已接收文本');
});

test('real work-item assistant persists complete streamed replies on completion, failure and cancellation', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'assistant-stream-'));
  await seedCatalog(root, {
    baseUrl: 'https://fixture.invalid',
    model: 'fixture',
    apiKey: 'fixture-only',
  });
  const app = await createApplication({
    dataRoot: root,
    runSession: async (input) => {
      for (let i = 0; i < 200; i++) await input.onText?.('片段');
      const instruction = JSON.parse(input.prompt).instruction;
      if (instruction === '失败') throw Error('explicit model failure');
      if (instruction === '停止')
        await new Promise<void>((_, reject) => {
          if (input.signal?.aborted) reject(Error('aborted'));
          else
            input.signal?.addEventListener(
              'abort',
              () => reject(Error('aborted')),
              { once: true },
            );
        });
      return '';
    },
  });
  t.after(async () => {
    app.batches.close();
    app.runs.close();
    await rm(root, { recursive: true, force: true });
  });
  const item = await app.items.create({
    title: '文本流回归',
    goal: '保留完整回复',
    materials: [],
  });
  const action = async (body: unknown) => {
    const r = await app.app.request(`/api/items/${item.id}/workspace/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(r.status, 200, await r.clone().text());
    return r.json() as Promise<any>;
  };
  const ws = await action({ action: 'init' }),
    workId = ws.work.work.id;
  let writes = 0;
  const change = app.files.change;
  app.files.change = (id, edit) => {
    if (id === workId) writes++;
    return change(id, edit);
  };
  for (const [text, status] of [
    ['完成', 'completed'],
    ['失败', 'failed'],
    ['停止', 'cancelled'],
  ]) {
    const receipt = await action({ action: 'assistant', text });
    if (text === '停止') {
      await delay(20);
      await action({ action: 'stopAssistant', requestId: receipt.requestId });
    }
    let message: any;
    for (let i = 0; i < 200; i++) {
      message = (await app.files.read(workId)).messages.find(
        (m) => m.role === 'assistant' && m.requestId === receipt.requestId,
      );
      if (message?.status === status) break;
      await delay(10);
    }
    assert.equal(message?.status, status);
    assert.equal(message.text, '片段'.repeat(200));
  }
  assert.ok(
    writes < 15,
    `three turns should not cause 600 disk rewrites: ${writes}`,
  );
});
