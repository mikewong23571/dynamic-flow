import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { serve } from '@hono/node-server';
import { createApplication } from '../../../../../../src/server/index.ts';
import { seedCatalog } from '../../../../../../tests/catalog-fixture.ts';
import type { Definition, Json } from '../../../../../../src/shared/records.ts';
const dataRoot = await mkdtemp(join(tmpdir(), 'unified-artifacts-review-'));
await seedCatalog(dataRoot, { baseUrl: 'http://fixture.invalid', model: 'fixture', apiKey: 'fixture' });
const app = await createApplication({ dataRoot, executeNode: async (context): Promise<Json> => {
  if (context.node.id === 'failed') throw Error('fixture：记录读取失败');
  if (context.node.id === 'report') return '# 客户复核报告\n\n十份记录已整理，等待人工确认。\n\n' + '核查范围是本次明确提交的记录。\n\n'.repeat(60);
  return { account: context.inputs.input[0].value, records: Array.from({ length: 35 }, (_, index) => ({ name: `记录-${index}`, content: '# 记录正文\n\n' + '可核对的记录正文。\n'.repeat(180) })), notes: '本次记录待人工确认。' };
} });
const ids: Record<string, string> = {};
for (const [name, count] of [['单份报告', 1], ['十份记录与报告', 10], ['失败运行', 0]] as const) {
  const work = await app.work.createWork(name, []);
  const definition: Definition = { schemaVersion: 1, inputs: ['materials'], nodes: count === 10 ? [{ id: 'check', label: '客户记录核查', kind: 'agent', mode: 'each', operation: 'map', task: '核查' }, { id: 'report', label: '汇总', kind: 'agent', mode: 'all', operation: 'aggregate', task: '汇总' }] : [{ id: count ? 'report' : 'failed', label: count ? '汇总' : '读取', kind: 'agent', mode: 'all', operation: 'aggregate', task: '处理' }], edges: count === 10 ? [{ from: ['$input', 'materials'], to: ['check', 'input'] }, { from: ['check', 'output'], to: ['report', 'input'] }] : [{ from: ['$input', 'materials'], to: [count ? 'report' : 'failed', 'input'] }], outputs: count === 10 ? { records: ['check', 'output'], report: ['report', 'output'] } : { report: [count ? 'report' : 'failed', 'output'] } };
  const definitionId = await app.flow.saveDraft(work.id, undefined, definition);
  for (const body of [{ action: 'rename', title: name }, { action: 'adopt', definitionId }]) await app.app.request(`/api/works/${work.id}/actions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  await app.runs.start(work.id, { definitionId, scope: 'full', inputs: { materials: Array.from({ length: Math.max(1, count) }, (_, i) => ({ value: `客户-${i + 1}`, sampleId: `item-${i}`, materialIds: [], sourceResultIds: [] })) } });
  while (['running', 'queued'].includes((await app.files.read(work.id)).runs[0].status)) await delay(20);
  ids[name] = work.id;
}
const server = serve({ fetch: app.app.fetch, hostname: '127.0.0.1', port: 0 });
await new Promise<void>((resolve) => server.on('listening', resolve));
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
await writeFile(new URL('./fixture-state.json', import.meta.url), JSON.stringify({ url, ids }, null, 2));
console.log(JSON.stringify({ url, ids }));
process.on('SIGTERM', () => {
  server.closeAllConnections();
  server.close(() => void rm(dataRoot, { recursive: true, force: true, maxRetries: 3 }).then(() => process.exit(0)));
});
