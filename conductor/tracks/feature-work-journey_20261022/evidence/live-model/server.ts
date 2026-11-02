import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { mkdtemp, copyFile, cp, chmod, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createApplication } from '../../../../../src/server/index.ts';
import { createModelSettings } from '../../../../../src/server/assistant/settings.ts';

// Private data, real configured model, real HTTP/runtime and built UI. No model stub.
const output = resolve('conductor/tracks/feature-work-journey_20261022/evidence/live-model');
const webSearchEnabled = !process.argv.includes('--without-websearch');
if (!webSearchEnabled) {
  // Offline-input verification only: do not load an unrelated, rate-limited connector.
  // This is private process configuration, not a change to the app or user's files.
  process.env.WEBSEARCH_MCP_URL = '';
  process.env.WEBSEARCH_MCP_TOKEN = '';
}
const root: string = process.argv.includes('--feedback-final')
  ? await mkdtemp(join(tmpdir(), 'flowcraft-journey-live-'))
  : process.argv.includes('--reuse')
  ? JSON.parse(await readFile(join(output, 'environment.json'), 'utf8')).dataRoot
  : await mkdtemp(join(tmpdir(), 'flowcraft-journey-live-'));
if (process.argv.includes('--feedback-final')) {
  const previous = JSON.parse(await readFile(join(output, 'environment.json'), 'utf8'));
  const state = JSON.parse(await readFile(join(output, 'state.json'), 'utf8'));
  await writeFile(join(output, 'cve-running-environment.json'), JSON.stringify(previous, null, 2));
  for (const id of [state.methodId, state.reportMethodId]) await cp(join(previous.dataRoot, id), join(root, id), { recursive: true });
  await cp(join(previous.dataRoot, 'work-items', state.itemId + '.json'), join(root, 'work-items', state.itemId + '.json'), { recursive: true });
  await writeFile(join(output, 'final-clone.json'), JSON.stringify({ sourceRoot: previous.dataRoot, targetRoot: root, workIds: [state.methodId,state.reportMethodId], itemId:state.itemId, reason:'Final build review uses completed feedback data; existing CVE max model continues separately.' }, null, 2));
}
if (!root.startsWith(join(tmpdir(), 'flowcraft-journey-live-'))) throw Error('Expected private verification directory');
await copyFile(resolve('models.toml'), join(root, 'models.toml'));
await chmod(join(root, 'models.toml'), 0o600);
await copyFile(resolve('data/model-settings.json'), join(root, 'model-settings.json'));
await chmod(join(root, 'model-settings.json'), 0o600);
const settings = createModelSettings(join(root, 'model-settings.json'), join(root, 'models.toml'));
const effectiveModel = settings.getScopedConfig('workflow').effective;
const application = await createApplication({ dataRoot: root });
const uiRoot = join(root, 'verification-ui');
await rm(uiRoot, { recursive: true, force: true });
await cp(resolve('dist'), uiRoot, { recursive: true });
// Keep this test's built UI stable while the implementation agent builds the next increment.
const host = new Hono();
host.all('/api/*', context => application.app.fetch(context.req.raw));
host.use('/*', serveStatic({ root: uiRoot }));
host.get('*', serveStatic({ path: join(uiRoot, 'index.html') }));
const server = serve({ fetch: host.fetch, port: 0, hostname: '127.0.0.1' });
if (!server.listening) await new Promise<void>(done => server.once('listening', done));
const address = server.address();
if (!address || typeof address === 'string') throw Error('Private HTTP server address unavailable');
const hashes: Record<string, string> = {};
for (const file of ['dist/index.html', 'src/server/index.ts', 'src/server/work-items/index.ts', 'src/server/runs/index.ts']) {
  hashes[file] = createHash('sha256').update(await readFile(resolve(file))).digest('hex');
}
const metadata = { url: `http://127.0.0.1:${address.port}`, dataRoot: root, pid: process.pid,
  effectiveModel, webSearchEnabled, createdAt: new Date().toISOString(), hashes, modelStub: false };
await writeFile(join(output, 'environment.json'), JSON.stringify(metadata, null, 2));
await writeFile(join(output, `environment-${Date.now()}.json`), JSON.stringify(metadata, null, 2));
console.log(JSON.stringify({ url: metadata.url, effectiveModel, webSearchEnabled, modelStub: false }));
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  application.runs.close();
  server.closeAllConnections();
  await new Promise<void>(done => server.close(() => done()));
  // Keep test inputs/runs for review, remove the private credential copy.
  await rm(join(root, 'models.toml'), { force: true });
  await writeFile(join(output, 'closed.json'), JSON.stringify({ closedAt: new Date().toISOString(), credentialsRemoved: true }));
  process.exit(0);
}
process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());
