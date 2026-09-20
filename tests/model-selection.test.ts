import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFiles } from '../src/server/files/index.ts';
import { createFlow } from '../src/server/flow/index.ts';
import { createWorkService } from '../src/server/work/index.ts';
import { createAssistant } from '../src/server/assistant/index.ts';
import { createModelSettings } from '../src/server/assistant/settings.ts';
import { createRuns } from '../src/server/runs/index.ts';
import type {
  SessionInput,
  SessionRunner,
} from '../src/server/assistant/pi.ts';
import type { Definition, Work } from '../src/shared/records.ts';

const catalogToml = `
[providers.acme]
type = "anthropic"
base_url = "https://acme.example.com"
api_key = "acme-secret"
custom_headers = { "X-Org" = "org-1" }

[models."acme/sonnet"]
provider = "acme"
model = "claude-sonnet-4-5"
display_name = "Sonnet"
max_context_size = 200000
support_efforts = ["low", "high"]
default_effort = "high"

[models."acme/fast"]
provider = "acme"
model = "claude-haiku"
max_context_size = 100000
`;
const definition: Definition = {
  schemaVersion: 1,
  inputs: ['materials'],
  nodes: [{ id: 'a', label: '分类', kind: 'agent', mode: 'all', task: '分类' }],
  edges: [{ from: ['$input', 'materials'], to: ['a', 'input'] }],
  outputs: { out: ['a', 'output'] },
};

async function fixture(runner?: SessionRunner) {
  const root = await mkdtemp(join(tmpdir(), 'model-selection-'));
  const catalogPath = join(root, 'models.toml');
  await writeFile(catalogPath, catalogToml);
  const files = createFiles(root),
    flow = createFlow(files);
  const workService = createWorkService(files);
  const workA = await workService.createWork('工作甲', ['材料一']);
  const workB = await workService.createWork('工作乙', ['材料二']);
  const draftA = await flow.saveDraft(workA.id, undefined, definition);
  const assistant = createAssistant(files, flow, {
    settingsPath: join(root, 'model-settings.json'),
    catalogPath,
    runSession: runner ?? (async () => '完成'),
  });
  const settings = createModelSettings(
    join(root, 'model-settings.json'),
    catalogPath,
  );
  return {
    root,
    files,
    flow,
    workA,
    workB,
    draftA,
    assistant,
    settings,
    catalogPath,
    clean: () => rm(root, { recursive: true, force: true }),
  };
}

test('default selection is validated, persisted across writers and exposed without secrets', async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.assistant.saveDefaultSelection({ alias: 'ghost/model' }),
      /请重新选择/,
    );
    await assert.rejects(
      f.assistant.saveDefaultSelection({
        alias: 'acme/sonnet',
        effort: 'max',
      }),
      /不支持思考级别/,
    );
    const saved = await f.assistant.saveDefaultSelection({
      alias: 'acme/sonnet',
      effort: 'low',
    });
    assert.deepEqual(saved.defaultSelection, {
      alias: 'acme/sonnet',
      effort: 'low',
    });
    assert.equal(saved.resolved?.default, 'catalog');
    assert.equal(saved.catalog?.length, 2);
    assert.equal(JSON.stringify(saved).includes('acme-secret'), false);
    // 另一读取方也能看到默认选择
    assert.deepEqual(f.settings.configuration().defaultSelection, {
      alias: 'acme/sonnet',
      effort: 'low',
    });
    const cleared = await f.assistant.saveDefaultSelection(null);
    assert.equal(cleared.defaultSelection, undefined);
    assert.equal(cleared.resolved?.default, 'none');
  } finally {
    await f.clean();
  }
});

test('work selections are validated, independent and clearable', async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.assistant.saveWorkSelection(f.workA.id, { alias: 'ghost/model' }),
      /请重新选择/,
    );
    await f.assistant.saveWorkSelection(f.workA.id, {
      alias: 'acme/sonnet',
      effort: 'high',
    });
    await f.assistant.saveWorkSelection(f.workB.id, { alias: 'acme/fast' });
    const a = await f.files.read(f.workA.id),
      b = await f.files.read(f.workB.id);
    assert.deepEqual(a.modelSelections, {
      assistant: { alias: 'acme/sonnet', effort: 'high' },
    });
    assert.deepEqual(b.modelSelections, { assistant: { alias: 'acme/fast' } });
    await f.assistant.saveWorkSelection(f.workA.id, null);
    assert.equal(
      (await f.files.read(f.workA.id)).modelSelections?.assistant,
      undefined,
    );
    assert.deepEqual(
      (await f.files.read(f.workB.id)).modelSelections?.assistant,
      { alias: 'acme/fast' },
    );
  } finally {
    await f.clean();
  }
});

test('scoped config falls back through the chain and records the failed selection', async () => {
  const f = await fixture();
  try {
    const work: Work = await f.files.read(f.workA.id);
    // 无覆盖无默认 → 如实报未配置
    assert.throws(
      () => f.settings.getScopedConfig('assistant', work),
      /尚未选择默认模型/,
    );
    // Work 覆盖生效
    await f.assistant.saveWorkSelection(f.workA.id, {
      alias: 'acme/sonnet',
      effort: 'low',
    });
    let scoped = f.settings.getScopedConfig(
      'assistant',
      await f.files.read(f.workA.id),
    );
    assert.equal(scoped.config.model, 'claude-sonnet-4-5');
    assert.equal(scoped.config.headers?.['X-Org'], 'org-1');
    assert.deepEqual(scoped.effective, {
      source: 'work',
      alias: 'acme/sonnet',
      model: 'claude-sonnet-4-5',
      effort: 'low',
    });
    // 覆盖别名失效 → 落到全局默认并如实记录
    await f.assistant.saveWorkSelection(f.workA.id, null);
    await f.files.change(f.workA.id, (w) => {
      w.modelSelections = { assistant: { alias: 'acme/gone' } };
    });
    await f.assistant.saveDefaultSelection({ alias: 'acme/fast' });
    scoped = f.settings.getScopedConfig(
      'assistant',
      await f.files.read(f.workA.id),
    );
    assert.equal(scoped.config.model, 'claude-haiku');
    assert.equal(scoped.effective.source, 'default');
    assert.deepEqual(scoped.requested, { alias: 'acme/gone' });
    // 覆盖与默认都失效 → 报错同时指明两者
    await rm(f.catalogPath);
    assert.throws(
      () =>
        f.settings.getScopedConfig('assistant', {
          ...work,
          modelSelections: { assistant: { alias: 'acme/gone' } },
        }),
      /「acme\/gone」已失效；默认模型「acme\/fast」已失效/,
    );
    // workflow scope 不看 Work 覆盖
    await writeFile(f.catalogPath, catalogToml);
    scoped = f.settings.getScopedConfig(
      'workflow',
      await f.files.read(f.workA.id),
    );
    assert.equal(scoped.config.model, 'claude-haiku');
    assert.equal(scoped.effective.source, 'default');
  } finally {
    await f.clean();
  }
});

test('configuration surfaces catalog problems and invalid default selection', async () => {
  const f = await fixture();
  try {
    await f.assistant.saveDefaultSelection({ alias: 'acme/sonnet' });
    // 目录文件缺失 → 空目录，默认选择如实失效
    await rm(f.catalogPath);
    let configuration = f.assistant.configuration();
    assert.equal(configuration.ready, false);
    assert.match(configuration.error!, /「acme\/sonnet」已失效/);
    assert.equal(configuration.catalog?.length, 0);
    // 目录内容损坏 → 如实报无法读取
    await writeFile(f.catalogPath, 'not = [valid');
    configuration = f.assistant.configuration();
    assert.equal(configuration.ready, false);
    assert.match(configuration.error!, /模型目录无法读取/);
    assert.ok(
      configuration.warnings?.some((w) => w.includes('模型目录无法读取')),
    );
    assert.equal(configuration.catalog, undefined);
  } finally {
    await f.clean();
  }
});

test('requestEdit uses the work override and records effectiveModel on the message', async () => {
  const captured: SessionInput[] = [];
  const f = await fixture(async (input) => {
    captured.push(input);
    const proposal = structuredClone(definition);
    proposal.nodes[0].task = '改动';
    await input.tools
      .find((tool) => tool.name === 'update_flow')!
      .execute(
        'call-1',
        { definition: proposal },
        input.signal,
        undefined,
        {} as never,
      );
    return '已保存';
  });
  try {
    await f.assistant.saveWorkSelection(f.workA.id, { alias: 'acme/sonnet' });
    const requestId = await f.assistant.requestEdit(f.workA.id, {
      text: '修改',
      expectedDraftId: f.draftA,
    });
    let message;
    for (let i = 0; i < 400; i++) {
      message = (await f.files.read(f.workA.id)).messages.find(
        (m) => m.role === 'assistant' && m.requestId === requestId,
      )!;
      if (['completed', 'cancelled', 'failed'].includes(message.status!)) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(message!.status, 'completed');
    assert.equal(captured[0].config.model, 'claude-sonnet-4-5');
    assert.equal(captured[0].config.apiKey, 'acme-secret');
    assert.equal(captured[0].config.headers?.['X-Org'], 'org-1');
    assert.equal(captured[0].config.reasoningEffort, 'high');
    assert.deepEqual(message!.effectiveModel, {
      source: 'work',
      alias: 'acme/sonnet',
      model: 'claude-sonnet-4-5',
      effort: 'high',
    });
  } finally {
    await f.clean();
  }
});

test('executeNode uses the global default and runs persist effectiveModel', async () => {
  const captured: SessionInput[] = [];
  const f = await fixture(async (input) => {
    captured.push(input);
    return '"完成"';
  });
  try {
    // Work 覆盖不影响 workflow 执行
    await f.assistant.saveWorkSelection(f.workA.id, { alias: 'acme/sonnet' });
    await f.assistant.saveDefaultSelection({ alias: 'acme/fast' });
    const runs = createRuns(f.files, f.assistant.executeNode);
    const material = (await f.files.read(f.workA.id)).materials[0];
    const runId = await runs.start(f.workA.id, {
      definitionId: f.draftA,
      scope: 'full',
      inputs: {
        materials: [
          {
            sampleId: material.id,
            value: material.text,
            materialIds: [material.id],
            sourceResultIds: [],
          },
        ],
      },
    });
    await runs.wait(runId);
    const run = (await f.files.read(f.workA.id)).runs.find(
      (r) => r.id === runId,
    )!;
    assert.equal(run.status, 'completed');
    assert.equal(captured[0].config.model, 'claude-haiku');
    assert.deepEqual(run.results[0].effectiveModel, {
      source: 'default',
      alias: 'acme/fast',
      model: 'claude-haiku',
      effort: 'medium',
    });
    runs.close();
  } finally {
    await f.clean();
  }
});

test('testCatalogEntry runs a minimal echo session and sanitizes errors', async () => {
  const seen: SessionInput[] = [];
  let failWith: Error | undefined;
  const f = await fixture(async (input) => {
    seen.push(input);
    if (failWith) throw failWith;
    const echo = input.tools.find((tool) => tool.name === 'echo_value')!;
    const result = await echo.execute(
      'echo-1',
      { value: 'ok' },
      input.signal,
      undefined,
      {} as never,
    );
    return (result.content[0] as { text: string }).text ?? 'ok';
  });
  try {
    const ok = await f.assistant.testCatalogEntry('acme/sonnet');
    assert.equal(ok.ok, true);
    assert.equal(typeof ok.latencyMs, 'number');
    assert.equal(seen[0].config.model, 'claude-sonnet-4-5');
    assert.equal(seen[0].config.apiKey, 'acme-secret');
    assert.equal(seen[0].tools.length, 1);
    const unknown = await f.assistant.testCatalogEntry('ghost/model');
    assert.equal(unknown.ok, false);
    assert.match(unknown.error!, /请重新选择/);
    failWith = new Error('401 unauthorized: acme-secret');
    const failed = await f.assistant.testCatalogEntry('acme/sonnet');
    assert.equal(failed.ok, false);
    assert.match(failed.error!, /\[已隐藏凭据\]/);
    assert.equal(failed.error!.includes('acme-secret'), false);
  } finally {
    await f.clean();
  }
});

test('configuration is ready with a resolvable catalog default and reports an invalid one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'model-selection-default-'));
  const catalogPath = join(root, 'models.toml');
  try {
    await writeFile(catalogPath, catalogToml);
    const settings = createModelSettings(
      join(root, 'model-settings.json'),
      catalogPath,
    );
    await settings.saveDefaultSelection({ alias: 'acme/sonnet' });
    const configuration = settings.configuration();
    // 目录默认选择可解析即就绪；目录是唯一配置来源
    assert.equal(configuration.ready, true);
    assert.equal(configuration.error, undefined);
    assert.deepEqual(configuration.defaultSelection, {
      alias: 'acme/sonnet',
      effort: undefined,
    });
    assert.equal(configuration.resolved?.default, 'catalog');
    assert.equal(configuration.catalog?.length, 2);
    const scoped = settings.getScopedConfig('workflow');
    assert.equal(scoped.config.model, 'claude-sonnet-4-5');
    assert.equal(scoped.effective.source, 'default');
    assert.equal(settings.getDefaultSelection()?.alias, 'acme/sonnet');
    // 默认失效则如实不就绪
    await rm(catalogPath);
    const invalid = settings.configuration();
    assert.equal(invalid.ready, false);
    assert.ok(invalid.error);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('saveCatalog rejects removing aliases still referenced by selections', async () => {
  const f = await fixture();
  try {
    await f.assistant.saveDefaultSelection({ alias: 'acme/fast' });
    await f.assistant.saveWorkSelection(f.workA.id, { alias: 'acme/sonnet' });
    const withoutSonnet = {
      providers: [
        {
          name: 'acme',
          type: 'anthropic',
          baseUrl: 'https://acme.example.com',
          apiKey: '',
        },
      ],
      models: [
        {
          alias: 'acme/fast',
          provider: 'acme',
          model: 'claude-haiku',
          contextWindow: 100000,
        },
      ],
    };
    await assert.rejects(
      f.assistant.saveCatalog(withoutSonnet),
      /对话仍选择「acme\/sonnet」/,
    );
    await f.assistant.saveWorkSelection(f.workA.id, null);
    await assert.rejects(
      f.assistant.saveCatalog({
        providers: withoutSonnet.providers,
        models: [
          { ...withoutSonnet.models[0], alias: 'acme/fast', model: 'x' },
          // 替换掉默认选择引用的别名
        ].slice(0, 0),
      }),
      /默认模型仍选择「acme\/fast」/,
    );
    // 引用保留时可保存，空密钥沿用
    const saved = await f.assistant.saveCatalog({
      providers: withoutSonnet.providers,
      models: [
        ...withoutSonnet.models,
        {
          alias: 'acme/sonnet',
          provider: 'acme',
          model: 'claude-sonnet-4-5',
          contextWindow: 200000,
          supportedEfforts: ['low', 'high'],
          defaultEffort: 'high',
        },
      ],
    });
    assert.equal(saved.catalog?.length, 2);
    assert.equal(f.settings.catalogConfig('acme/sonnet').apiKey, 'acme-secret');
  } finally {
    await f.clean();
  }
});
