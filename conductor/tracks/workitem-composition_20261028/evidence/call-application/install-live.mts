import { writeFile, readFile } from 'node:fs/promises';
import { primitiveDisplayFixture } from '/home/mike/projs/fork/dynamic-flow-workitem-composition/tests/primitive-display-fixture.ts';
const origin = 'http://127.0.0.1:4331';
const recordPath = '/tmp/flowcraft-primitive-preview-installed.json';
const post = async (path: string, fields: unknown) => {
  const response = await fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fields) });
  if (!response.ok) throw Error(await response.text());
  return response.json() as Promise<any>;
};
let saved: any;
try { saved = JSON.parse(await readFile(recordPath, 'utf8')); } catch {}
if (saved) {
  const response = await fetch(origin + `/api/items/${saved.itemId}/workspace`);
  if (!response.ok) throw Error('已安装演示不可用，保留现场，不重复创建');
  console.log(JSON.stringify({ reused: true, itemId: saved.itemId, url: saved.url }));
} else {
  const adapter = {
    app: { request: (path: string, options: RequestInit) => fetch(origin + path, options) },
    work: {
      createWork: async (goal: string, materials: string[]) => (await post('/api/works', { goal, materials })).work,
      rename: (id: string, title: string) => post(`/api/works/${id}/actions`, { action: 'rename', title }),
    },
    flow: { saveDraft: async (id: string, expectedDraftId: string | undefined, definition: unknown) => (await post(`/api/works/${id}/actions`, { action: 'saveDraft', expectedDraftId, definition })).work.draftId },
  };
  const scenario = await primitiveDisplayFixture(adapter as never);
  saved = { itemId: scenario.item.id, methodId: scenario.method.id, definitionId: scenario.version, scope: '独立预览中以合成输入验证原语展示；纯函数，无模型', url: `http://10.134.94.200:4330/items/${scenario.item.id}?tab=flow` };
  await writeFile(recordPath, JSON.stringify(saved, null, 2));
  await scenario.action({ action: 'run' });
  let ws: any;
  for (let i = 0; i < 100; i++) {
    ws = await (await fetch(origin + scenario.path)).json();
    if (!['queued', 'running', 'stopping'].includes(ws.work.work.runs.at(-1)?.status)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const run = ws.work.work.runs.at(-1);
  if (run?.status !== 'completed') throw Error(`合成演示执行状态 ${run?.status}`);
  await post(scenario.path + '/actions', { action: 'publishUiPlan', baseRevision: ws.item.revision, planId: ws.uiPlan.id, runId: run.id });
  saved = { ...saved, rootRunId: run.id, calls: run.results.filter((r: any) => r.nodeId === 'apply').length, status: 'completed', itemStatus: ws.item.status };
  await writeFile(recordPath, JSON.stringify(saved, null, 2));
  console.log(JSON.stringify(saved));
}
