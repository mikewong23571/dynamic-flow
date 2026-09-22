import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server/index.ts';
import { seedCatalog } from './catalog-fixture.ts';
import type { Definition, Json } from '../src/shared/records.ts';

/** 纯函数流程：分流含"失败"的条目，契约要求条目是字符串。 */
const definition: Definition = {
  schemaVersion: 1,
  inputs: ['materials'],
  inputContracts: {
    materials: { item: { type: 'string' }, onInvalid: 'reject' },
  },
  nodes: [
    {
      id: 'step',
      label: '整理材料',
      kind: 'function',
      mode: 'each',
      functionName: 'identity',
    },
  ],
  edges: [{ from: ['$input', 'materials'], to: ['step', 'input'] }],
  outputs: { result: ['step', 'output'] },
};

async function fixture(options: {
  runSession?: (input: { prompt: string }) => Promise<string>;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'invoke-test-'));
  // interpret 修复环走真实模型配置解析；测试目录种子目录，替身 runner 不产生真实调用。
  await seedCatalog(root, {
    baseUrl: 'http://test.invalid',
    model: 'test',
    apiKey: 'test-secret',
  });
  const server = await createApplication({
    dataRoot: root,
    executeNode: async () => '节点结果' as Json,
    ...(options.runSession
      ? {
          runSession: (input) =>
            options.runSession!(input as { prompt: string }),
        }
      : {}),
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
    return { status: res.status, body: await res.json() };
  };
  const createWork = async (def: Definition = definition) => {
    const created = await send('/api/works', { goal: 'invoke 测试' });
    const work = created.body.work;
    const saved = await send(`/api/works/${work.id}/actions`, {
      action: 'saveDraft',
      definition: def,
    });
    const adopted = await send(`/api/works/${work.id}/actions`, {
      action: 'adopt',
      definitionId: saved.body.work.draftId,
    });
    return adopted.body.work;
  };
  const adoptCurrent = async (workId: string) => {
    const snap = await (await server.app.request(`/api/works/${workId}`)).json();
    return send(`/api/works/${workId}/actions`, {
      action: 'adopt',
      definitionId: snap.work.draftId,
    });
  };
  return { server, send, createWork, adoptCurrent, clean: () => rm(root, { recursive: true, force: true }) };
}

test('invoke: adopted 缺省、裸值包装、wait 同步返回输出', async () => {
  const f = await fixture();
  try {
    const work = await f.createWork();
    const res = await f.send(`/api/works/${work.id}/invoke`, {
      inputs: { materials: ['导出失败', '界面好看'] },
      wait: true,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, 'completed');
    assert.deepEqual(res.body.outputs.result, ['导出失败', '界面好看']);
    const read = await f.server.app.request(`/api/works/${work.id}`);
    const final = (await read.json()).work.runs.at(-1);
    assert.equal(final.inputs.materials.length, 2);
    assert.deepEqual(final.inputs.materials[0].materialIds, []);
    assert.equal(final.inputs.materials[0].sampleId, 'materials-1');
  } finally {
    await f.clean();
  }
});

test('invoke: 契约违约门口拒绝，不产生运行；显式 loose 豁免并留痕', async () => {
  const f = await fixture();
  try {
    const work = await f.createWork();
    const bad = await f.send(`/api/works/${work.id}/invoke`, {
      inputs: { materials: ['正常文本', { 结构化: '对象' }] },
    });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /不符合契约/);
    assert.equal(bad.body.code, 'contract_violation');
    let snap = await (
      await f.server.app.request(`/api/works/${work.id}`)
    ).json();
    assert.equal(snap.work.runs.length, 0);

    const loose = await f.send(`/api/works/${work.id}/invoke`, {
      inputs: { materials: ['正常文本', { 结构化: '对象' }] },
      mode: 'loose',
      wait: true,
    });
    assert.equal(loose.status, 200);
    assert.equal(loose.body.status, 'completed');
    snap = await (await f.server.app.request(`/api/works/${work.id}`)).json();
    assert.equal(snap.work.runs.at(-1).invocation?.loose, true);
  } finally {
    await f.clean();
  }
});

test('invoke: interpret 修复环真实修复违约输入并留痕；修不出如实拒绝', async () => {
  const repaired = await fixture({
    runSession: async () => JSON.stringify(['导出失败', '界面好看']),
  });
  try {
    // 直接以 interpret 契约建工作
    const interpretDef: Definition = {
      ...definition,
      inputContracts: {
        materials: { item: { type: 'string' }, onInvalid: 'interpret' },
      },
    };
    const work = await repaired.createWork(interpretDef);
    const res = await repaired.send(`/api/works/${work.id}/invoke`, {
      inputs: { materials: ['正常文本', 42] },
      wait: true,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, 'completed');
    assert.deepEqual(res.body.outputs.result, ['导出失败', '界面好看']);
    const snap = await (
      await repaired.server.app.request(`/api/works/${work.id}`)
    ).json();
    assert.deepEqual(snap.work.runs.at(-1).invocation?.repairedPorts, [
      'materials',
    ]);
  } finally {
    await repaired.clean();
  }

  const failing = await fixture({
    runSession: async () => JSON.stringify([{ 仍然: '不合规' }, 42]),
  });
  try {
    const interpretDef: Definition = {
      ...definition,
      inputContracts: {
        materials: { item: { type: 'string' }, onInvalid: 'interpret' },
      },
    };
    const work = await failing.createWork(interpretDef);
    const res = await failing.send(`/api/works/${work.id}/invoke`, {
      inputs: { materials: [42] },
      wait: true,
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /修复失败/);
    assert.equal(res.body.code, 'contract_violation');
    const snap = await (
      await failing.server.app.request(`/api/works/${work.id}`)
    ).json();
    assert.equal(snap.work.runs.length, 0);
  } finally {
    await failing.clean();
  }
});

test('invoke: 未采用版本/未知端口/无 wait 异步', async () => {
  const f = await fixture();
  try {
    const created = await f.send('/api/works', { goal: 'invoke 测试' });
    const work = created.body.work;
    await f.send(`/api/works/${work.id}/actions`, {
      action: 'saveDraft',
      definition,
    });
    // 未采用 → 拒绝
    const none = await f.send(`/api/works/${work.id}/invoke`, {
      inputs: { materials: ['x'] },
    });
    assert.equal(none.status, 400);
    assert.match(none.body.error, /已采用/);
    assert.equal(none.body.code, undefined);
    await f.adoptCurrent(work.id);
    // 未知端口 → 拒绝
    const unknown = await f.send(`/api/works/${work.id}/invoke`, {
      inputs: { nope: ['x'] },
    });
    assert.equal(unknown.status, 400);
    assert.match(unknown.body.error, /没有输入端口/);
    // 无 wait → 立即返回 started
    const asyncRes = await f.send(`/api/works/${work.id}/invoke`, {
      inputs: { materials: ['x'] },
    });
    assert.equal(asyncRes.body.status, 'started');
    assert.ok(asyncRes.body.runId);
    // 等后台运行进终态，避免清理时仍在写文件
    for (let i = 0; i < 100; i++) {
      const snap = await (
        await f.server.app.request(`/api/works/${work.id}`)
      ).json();
      const run = snap.work.runs.find((r: { id: string }) => r.id === asyncRes.body.runId);
      if (run && ['completed', 'failed', 'cancelled'].includes(run.status))
        break;
      await new Promise((r) => setTimeout(r, 20));
    }
  } finally {
    await f.clean();
  }
});
