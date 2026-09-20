// 证据服务：独立端口 4391 + 临时数据目录，不占用户 dev 进程、不污染 data/ 与 models.toml。
// 用法：pnpm exec tsx conductor/tracks/model-catalog_20260920/artifacts/serve-evidence.mts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createApplication } from '../../../../src/server/index.ts';

const dataRoot = await mkdtemp(join(tmpdir(), 'model-catalog-evidence-'));
const { app } = await createApplication({ dataRoot });
serve({ fetch: app.fetch, port: 4391, hostname: '127.0.0.1' }, (info) =>
  console.log(`evidence server http://127.0.0.1:${info.port} data=${dataRoot}`),
);
