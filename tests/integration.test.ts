import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server/index.ts';
import type {
  Definition,
  Snapshot,
  Inputs,
  Json,
} from '../src/shared/records.ts';
const definition: Definition = {
  schemaVersion: 1,
  inputs: ['materials'],
  nodes: [
    {
      id: 'classify',
      kind: 'function',
      functionName: 'identity',
      mode: 'each',
      label: '整理材料',
    },
    {
      id: 'report',
      kind: 'agent',
      mode: 'all',
      label: '报告',
      task: '总结输入并引用材料',
    },
  ],
  edges: [
    { from: ['$input', 'materials'], to: ['classify', 'input'] },
    { from: ['classify', 'output'], to: ['report', 'input'] },
  ],
  outputs: { report: ['report', 'output'] },
};
test('HTTP真实文件：独立采用与保留、混合旧新结果预览、显式续做、重开来源', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dynamic-http-'));
  const seen: Inputs[] = [];
  try {
    const server = await createApplication({
      dataRoot: root,
      executeNode: async (c) => {
        seen.push(structuredClone(c.inputs));
        return '报告 ' + c.inputs.input.map((i) => i.value).join('；');
      },
    });
    const send = async (path: string, body?: unknown) => {
      const res = await server.app.request(
        path,
        body === undefined
          ? undefined
          : {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            },
      );
      const json = await res.json();
      assert.equal(res.ok, true, JSON.stringify(json));
      return json as Snapshot;
    };
    let snapshot = await send('/api/works', {
      goal: '反馈分析',
      materials: ['第一条', '第二条', '第三条'],
    });
    const id = snapshot.work.id,
      path = `/api/works/${id}/actions`;
    snapshot = await send(path, { action: 'saveDraft', definition });
    const d1 = snapshot.work.draftId!;
    const input: Inputs = {
      materials: snapshot.work.materials.map((m) => ({
        sampleId: m.id,
        value: m.text,
        materialIds: [m.id],
        sourceResultIds: [],
      })),
    };
    snapshot = await send(path, {
      action: 'run',
      definitionId: d1,
      scope: 'full',
      inputs: input,
    });
    await server.runs.wait(snapshot.work.runs[0].id);
    snapshot = await send(`/api/works/${id}`);
    const old = snapshot.work.runs[0].results.filter(
      (r) => r.nodeId === 'classify',
    );
    assert.equal(snapshot.work.runs[0].status, 'completed');
    snapshot = await send(path, { action: 'adopt', definitionId: d1 });
    assert.equal(snapshot.work.keptResultIds.length, 0);
    snapshot = await send(path, {
      action: 'saveDraft',
      expectedDraftId: d1,
      definition: {
        ...definition,
        nodes: definition.nodes.map((n) =>
          n.id === 'classify' ? { ...n, label: '新的整理' } : n,
        ),
      },
    });
    const d2 = snapshot.work.draftId!;
    snapshot = await send(path, {
      action: 'run',
      definitionId: d2,
      scope: { nodeId: 'classify' },
      inputs: { input: [input.materials[0]] },
    });
    await server.runs.wait(snapshot.work.runs[1].id);
    snapshot = await send(`/api/works/${id}`);
    const fresh = snapshot.work.runs[1].results[0];
    snapshot = await send(path, {
      action: 'keepResults',
      resultIds: [fresh.id],
    });
    assert.equal(snapshot.work.adoptedId, d1);
    const selected = [fresh.id, old[1].id, old[2].id];
    const previewResponse = await server.app.request(
      `/api/works/${id}/preview-results`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resultIds: selected }),
      },
    );
    const preview = (await previewResponse.json()) as { inputs: Inputs };
    assert.deepEqual(
      preview.inputs.input.flatMap((i) => i.sourceResultIds),
      selected,
    );
    snapshot = await send(path, {
      action: 'run',
      definitionId: d2,
      scope: { nodeId: 'report' },
      inputs: preview.inputs,
    });
    await server.runs.wait(snapshot.work.runs[2].id);
    assert.deepEqual(seen[1], preview.inputs);
    snapshot = await send(path, { action: 'discardDraft' });
    assert.equal(snapshot.work.draftId, d1);
    assert.ok(snapshot.work.keptResultIds.includes(fresh.id));
    const reopened = await createApplication({
      dataRoot: root,
      executeNode: async () => '',
    });
    const loaded = await reopened.flow.snapshot(id);
    assert.equal(loaded.work.runs.length, 3);
    assert.deepEqual(loaded.work.runs[2].results[0].input, preview.inputs);
    assert.equal(loaded.definitions[d2].nodes[0].label, '新的整理');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('SSE带完整定义，断开连接不停止运行；重连无需事件重放', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dynamic-sse-'));
  let finish!: (value: Json) => void;
  let started!: () => void;
  const ready = new Promise<void>((r) => (started = r));
  try {
    const server = await createApplication({
      dataRoot: root,
      executeNode: async () => {
        started();
        return new Promise<Json>((r) => (finish = r));
      },
    });
    const w = await server.work.createWork('流式', ['a']);
    const def = await server.flow.saveDraft(w.id, undefined, definition);
    const inputs = {
      materials: w.materials.map((m) => ({
        sampleId: m.id,
        value: m.text,
        materialIds: [m.id],
        sourceResultIds: [],
      })),
    };
    const runId = await server.runs.start(w.id, {
      definitionId: def,
      scope: 'full',
      inputs,
    });
    await ready;
    const response = await server.app.request(`/api/works/${w.id}/events`);
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.match(first, /event: snapshot/);
    assert.ok(first.includes(def));
    assert.ok(first.includes('整理材料'));
    await reader.cancel();
    assert.equal((await server.files.read(w.id)).runs[0].status, 'running');
    finish('完成');
    await server.runs.wait(runId);
    const reconnect = await server.app.request(`/api/works/${w.id}/events`);
    const reader2 = reconnect.body!.getReader();
    const data = new TextDecoder().decode((await reader2.read()).value);
    assert.match(data, /"status":"completed"/);
    await reader2.cancel();
    assert.equal((await server.files.read(w.id)).runs.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
