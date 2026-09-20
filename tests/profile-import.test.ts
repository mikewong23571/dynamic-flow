import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server/index.ts';
import type { Json, Snapshot } from '../src/shared/records.ts';

async function setup(
  executeNode: (context: {
    node: { id: string };
    inputs: Json;
  }) => Promise<Json>,
) {
  const root = await mkdtemp(join(tmpdir(), 'profile-import-'));
  const server = await createApplication({
    dataRoot: root,
    executeNode: executeNode as never,
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
    if (!res.ok) throw new Error(json.error || `请求失败 (${res.status})`);
    return json;
  };
  const upload = async (workId: string, name: string, content: string) => {
    const res = await server.app.request(
      `/api/works/${workId}/uploads?name=${encodeURIComponent(name)}`,
      { method: 'POST', body: content },
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '上传失败');
    return json.file as string;
  };
  const snapshot = async (workId: string) =>
    (await (
      await server.app.request(`/api/works/${workId}`)
    ).json()) as Snapshot;
  const settleMessage = async (workId: string) => {
    for (let i = 0; i < 400; i++) {
      const snap = await snapshot(workId);
      const message = snap.work.messages.at(-1);
      if (
        message &&
        ['completed', 'failed', 'cancelled'].includes(message.status!)
      )
        return message;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('导入消息未结束');
  };
  return {
    root,
    server,
    send,
    upload,
    snapshot,
    settleMessage,
    clean: () => rm(root, { recursive: true, force: true }),
  };
}

test('小文件导入：probe 判 small，拆分结果登记为材料', async () => {
  const f = await setup(async ({ node }) => {
    if (node.id === 'probe')
      return {
        kind: 'txt',
        bytes: 40,
        rows: 2,
        scale: 'small',
        preview: '两行反馈',
      } as Json;
    if (node.id === 'register-small')
      return { materials: ['界面很好但导出失败', '搜索很快'] } as Json;
    throw new Error(`不应执行节点 ${node.id}`);
  });
  try {
    const work = await f.send('/api/works', {
      goal: '整理反馈',
      materials: ['已有材料'],
    });
    const id = work.work.id as string;
    const file = await f.upload(id, '反馈.txt', '界面很好但导出失败\n搜索很快');
    assert.equal(file, '反馈.txt');
    await f.send(`/api/works/${id}/actions`, {
      action: 'importMaterials',
      file,
    });
    const message = await f.settleMessage(id);
    assert.equal(message.status, 'completed', message.error ?? '');
    assert.match(message.text, /已登记 2 条材料/);
    const snap = await f.snapshot(id);
    assert.deepEqual(
      snap.work.materials.map((m) => m.id),
      ['M01', 'M02', 'M03'],
    );
    assert.equal(snap.work.materials[1].text, '界面很好但导出失败');
  } finally {
    await f.clean();
  }
});

test('大文件导入：洞见以 cleaned-insight.json 为准登记为一条材料', async () => {
  const insight = {
    overview: '42 万行多来源扫描汇总',
    structure: {
      sheets: [{ name: '三方组件', dataRows: 1893, keyCols: ['Vulnerability ID'] }],
    },
    stats: '8290 条唯一 CVE',
    qualityIssues: '两个空 sheet',
    artifacts: ['cleaned-cve.csv'],
    suggestions: '先按高危过滤',
  };
  const f = await setup(async ({ node }) => {
    if (node.id === 'probe')
      return {
        kind: 'xlsx',
        bytes: 5_000_000,
        rows: 420000,
        scale: 'large',
        preview: '扫描报告',
      } as Json;
    if (node.id === 'profile') return '总结：8290 条 CVE，高危 1043。';
    throw new Error(`不应执行节点 ${node.id}`);
  });
  try {
    const work = await f.send('/api/works', {
      goal: 'CVE 信息收集',
      materials: [],
      import: true,
    });
    const id = work.work.id as string;
    const file = await f.upload(id, 'scc.xlsx', 'fake-binary');
    await f.send(`/api/works/${id}/actions`, {
      action: 'importMaterials',
      file,
    });
    // 剖析节点的脚本产出：校验过的 schema 化洞见
    await f.server.files.saveUpload(
      id,
      'cleaned-insight.json',
      Buffer.from(JSON.stringify(insight)),
    );
    const message = await f.settleMessage(id);
    assert.equal(message.status, 'completed', message.error ?? '');
    assert.match(message.text, /洞见/);
    const snap = await f.snapshot(id);
    assert.equal(snap.work.materials.length, 1);
    assert.deepEqual(JSON.parse(snap.work.materials[0].text), insight);
  } finally {
    await f.clean();
  }
});

test('大文件缺少洞见制品时如实失败', async () => {
  const f = await setup(async ({ node }) => {
    if (node.id === 'probe')
      return {
        kind: 'xlsx',
        bytes: 5_000_000,
        rows: 420000,
        scale: 'large',
        preview: '扫描报告',
      } as Json;
    if (node.id === 'profile') return '只回复了文本，没有写制品。';
    throw new Error(`不应执行节点 ${node.id}`);
  });
  try {
    const work = await f.send('/api/works', {
      goal: 'CVE 信息收集',
      materials: [],
      import: true,
    });
    const id = work.work.id as string;
    const file = await f.upload(id, 'scc.xlsx', 'fake-binary');
    await f.send(`/api/works/${id}/actions`, {
      action: 'importMaterials',
      file,
    });
    const message = await f.settleMessage(id);
    assert.equal(message.status, 'failed');
    assert.match(message.error!, /cleaned-insight\.json/);
    assert.equal((await f.snapshot(id)).work.materials.length, 0);
  } finally {
    await f.clean();
  }
});

test('导入运行失败时消息如实失败且不登记材料', async () => {
  const f = await setup(async ({ node }) => {
    if (node.id === 'probe') throw new Error('模型调用失败');
    throw new Error(`不应执行节点 ${node.id}`);
  });
  try {
    const work = await f.send('/api/works', {
      goal: '整理反馈',
      materials: ['已有材料'],
    });
    const id = work.work.id as string;
    const file = await f.upload(id, '反馈.txt', '内容');
    await f.send(`/api/works/${id}/actions`, {
      action: 'importMaterials',
      file,
    });
    const message = await f.settleMessage(id);
    assert.equal(message.status, 'failed');
    assert.match(message.error!, /模型调用失败/);
    assert.equal((await f.snapshot(id)).work.materials.length, 1);
  } finally {
    await f.clean();
  }
});

test('剖析定义幂等 seed：结构签名识别，不占草稿', async () => {
  const f = await setup(async ({ node }) => {
    if (node.id === 'probe')
      return { kind: 'txt', bytes: 5, rows: 1, scale: 'small', preview: 'x' } as Json;
    if (node.id === 'register-small') return { materials: ['一条'] } as Json;
    throw new Error(`不应执行节点 ${node.id}`);
  });
  try {
    const work = await f.send('/api/works', {
      goal: '整理反馈',
      materials: ['已有材料'],
    });
    const id = work.work.id as string;
    const file = await f.upload(id, 'a.txt', '一条');
    await f.send(`/api/works/${id}/actions`, {
      action: 'importMaterials',
      file,
    });
    await f.settleMessage(id);
    const first = await f.snapshot(id);
    const definitionCount = first.work.definitionIds.length;
    await f.send(`/api/works/${id}/actions`, {
      action: 'importMaterials',
      file,
    });
    await f.settleMessage(id);
    const second = await f.snapshot(id);
    assert.equal(second.work.definitionIds.length, definitionCount);
    assert.equal(second.work.draftId, undefined);
    assert.equal(second.work.adoptedId, undefined);
  } finally {
    await f.clean();
  }
});
