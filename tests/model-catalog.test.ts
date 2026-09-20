import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  catalogFromInput,
  loadCatalog,
  parseCatalog,
  publicCatalog,
  resolveModel,
  saveCatalog,
  stringifyCatalog,
  type CatalogInput,
} from '../src/server/assistant/catalog.ts';

const validToml = `
[providers.acme]
type = "anthropic"
base_url = "https://api.example.com"
api_key = "test-key-1"
custom_headers = { "X-Org" = "org-1" }

[providers.other]
type = "openai"
base_url = "https://other.example.com/v1"
api_key = "test-key-2"

[providers.responses]
type = "openai-responses"
base_url = "https://responses.example.com/v1"
api_key = "test-key-3"

[models."acme/sonnet"]
provider = "acme"
model = "claude-sonnet-4-5"
display_name = "Sonnet"
max_context_size = 200000
support_efforts = ["low", "high"]
default_effort = "high"

[models."other/gpt"]
provider = "other"
model = "gpt-x"
max_context_size = 128000
`;

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), 'model-catalog-'));
  return { root, clean: () => rm(root, { recursive: true, force: true }) };
}

test('parse and resolve valid catalog with protocol mapping and headers', () => {
  const catalog = parseCatalog(validToml);
  assert.equal(catalog.providers.length, 3);
  assert.equal(catalog.models.length, 2);
  const resolved = resolveModel(catalog, { alias: 'acme/sonnet' });
  assert.equal(resolved.protocol, 'anthropic-messages');
  assert.equal(resolved.baseUrl, 'https://api.example.com');
  assert.equal(resolved.model, 'claude-sonnet-4-5');
  assert.equal(resolved.apiKey, 'test-key-1');
  assert.equal(resolved.reasoningEffort, 'high');
  assert.equal(resolved.contextWindow, 200000);
  assert.deepEqual(resolved.headers, { 'X-Org': 'org-1' });
  assert.equal(resolved.temperature, 1);
  assert.equal(resolved.topP, 0.95);
  const openai = resolveModel(catalog, {
    alias: 'other/gpt',
    effort: 'max',
  });
  assert.equal(openai.protocol, 'openai-completions');
  assert.equal(openai.reasoningEffort, 'max');
  assert.equal(openai.contextWindow, 128000);
  assert.equal(openai.headers, undefined);
  const responses = parseCatalog(`
[providers.r]
type = "openai-responses"
base_url = "https://r.example.com"
api_key = "k"
[models."r/m"]
provider = "r"
model = "m"
max_context_size = 8192
`);
  assert.equal(
    resolveModel(responses, { alias: 'r/m' }).protocol,
    'openai-responses',
  );
});

test('effort falls back to entry default and rejects unsupported effort', () => {
  const catalog = parseCatalog(validToml);
  assert.equal(
    resolveModel(catalog, { alias: 'other/gpt' }).reasoningEffort,
    'medium',
  );
  assert.throws(
    () => resolveModel(catalog, { alias: 'acme/sonnet', effort: 'max' }),
    /不支持思考级别/,
  );
  assert.throws(() => resolveModel(catalog, { alias: 'none' }), /请重新选择/);
});

test('empty support_efforts means no thinking level and resolves as off', () => {
  const catalog = parseCatalog(`
[providers.p]
type = "openai"
base_url = "https://x.example.com"
api_key = "k"
[models."p/plain"]
provider = "p"
model = "plain-chat"
max_context_size = 8192
support_efforts = []
`);
  assert.equal(
    resolveModel(catalog, { alias: 'p/plain' }).reasoningEffort,
    'off',
  );
  assert.throws(
    () => resolveModel(catalog, { alias: 'p/plain', effort: 'high' }),
    /不设置思考级别/,
  );
  assert.throws(
    () =>
      parseCatalog(`
[providers.p]
type = "openai"
base_url = "https://x.example.com"
api_key = "k"
[models."p/m"]
provider = "p"
model = "m"
max_context_size = 8192
support_efforts = []
default_effort = "low"
`),
    /default_effort 不在 support_efforts/,
  );
});

test('catalog validation reports entry-specific errors', () => {
  assert.throws(
    () =>
      parseCatalog(`
[models."ghost/m"]
provider = "ghost"
model = "m"
max_context_size = 8192
`),
    /不存在的 provider「ghost」/,
  );
  assert.throws(
    () =>
      parseCatalog(`
[providers.p]
type = "kimi"
base_url = "https://x.example.com"
api_key = "k"
`),
    /类型「kimi」不受支持/,
  );
  assert.throws(
    () =>
      parseCatalog(`
[providers.p]
type = "openai"
base_url = "not a url"
api_key = "k"
`),
    /base_url 不是有效网址/,
  );
  assert.throws(
    () =>
      parseCatalog(`
[providers.p]
type = "openai"
base_url = "https://x.example.com"
`),
    /缺少 API Key/,
  );
  assert.throws(
    () =>
      parseCatalog(`
[providers.p]
type = "openai"
base_url = "https://x.example.com"
api_key = "k"
[models."p/m"]
provider = "p"
model = "m"
max_context_size = 8192
support_efforts = ["turbo"]
`),
    /思考级别「turbo」无效/,
  );
  assert.throws(
    () =>
      parseCatalog(`
[providers.p]
type = "openai"
base_url = "https://x.example.com"
api_key = "k"
[models."p/m"]
provider = "p"
model = "m"
max_context_size = 4096
`),
    /8192 到 2000000/,
  );
  assert.throws(
    () =>
      parseCatalog(`
[providers.p]
type = "openai"
base_url = "https://x.example.com"
api_key = "k"
[models."p/m"]
provider = "p"
model = "m"
max_context_size = 8192
support_efforts = ["low"]
default_effort = "high"
`),
    /default_effort 不在 support_efforts/,
  );
});

test('loadCatalog treats missing file as empty catalog', async () => {
  const { root, clean } = await tempRoot();
  try {
    assert.deepEqual(await loadCatalog(join(root, 'models.toml')), {
      providers: [],
      models: [],
    });
  } finally {
    await clean();
  }
});

test('public entries never contain secrets or headers', () => {
  const catalog = parseCatalog(validToml);
  const entries = publicCatalog(catalog);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].alias, 'acme/sonnet');
  assert.equal(entries[0].protocol, 'anthropic-messages');
  assert.equal(entries[0].apiKeyConfigured, true);
  assert.deepEqual(entries[0].supportedEfforts, ['low', 'high']);
  assert.equal(JSON.stringify(entries).includes('test-key'), false);
  assert.equal(JSON.stringify(entries).includes('X-Org'), false);
});

test('saveCatalog rewrites atomically, keeps blank keys and round-trips', async () => {
  const { root, clean } = await tempRoot();
  const path = join(root, 'models.toml');
  const input: CatalogInput = {
    providers: [
      {
        name: 'acme',
        type: 'anthropic',
        baseUrl: 'https://api.example.com/',
        apiKey: 'first-key',
      },
    ],
    models: [
      {
        alias: 'acme/sonnet',
        provider: 'acme',
        model: 'claude-sonnet-4-5',
        contextWindow: 200000,
        supportedEfforts: ['low', 'high'],
        defaultEffort: 'high',
      },
    ],
  };
  try {
    await saveCatalog(path, input);
    const first = loadCatalog(path);
    assert.equal(first.providers[0].baseUrl, 'https://api.example.com');
    assert.equal(first.providers[0].apiKey, 'first-key');
    // 第二轮留空密钥沿用旧值，并新增 provider
    await saveCatalog(path, {
      providers: [
        { ...input.providers[0], apiKey: '' },
        {
          name: 'other',
          type: 'openai',
          baseUrl: 'https://other.example.com/v1',
          apiKey: 'second-key',
        },
      ],
      models: [
        ...input.models,
        {
          alias: 'other/gpt',
          provider: 'other',
          model: 'gpt-x',
          contextWindow: 128000,
        },
      ],
    });
    const second = loadCatalog(path);
    assert.equal(second.providers.length, 2);
    assert.equal(second.providers[0].apiKey, 'first-key');
    assert.equal(second.providers[1].apiKey, 'second-key');
    assert.equal(
      resolveModel(second, { alias: 'other/gpt' }).protocol,
      'openai-completions',
    );
    assert.deepEqual(await readdir(root), ['models.toml']);
    const text = await readFile(path, 'utf8');
    assert.match(text, /custom_headers|api_key = "first-key"/);
    assert.equal(loadCatalog(path).models[1].defaultEffort, 'medium');
  } finally {
    await clean();
  }
});

test('saveCatalog requires a key when none can be inherited', async () => {
  const { root, clean } = await tempRoot();
  try {
    await assert.rejects(
      saveCatalog(join(root, 'models.toml'), {
        providers: [
          { name: 'p', type: 'openai', baseUrl: 'https://x.example.com' },
        ],
        models: [],
      }),
      /缺少 API Key/,
    );
  } finally {
    await clean();
  }
});

test('catalogFromInput filters blank header rows and validates', () => {
  const catalog = catalogFromInput(
    {
      providers: [
        {
          name: 'p',
          type: 'openai',
          baseUrl: 'https://x.example.com',
          apiKey: 'k',
          headers: { 'X-A': '1', '': 'ignored', 'X-Empty': '' },
        },
      ],
      models: [],
    },
    { providers: [], models: [] },
  );
  assert.deepEqual(catalog.providers[0].headers, { 'X-A': '1' });
});

test('stringifyCatalog escapes dotted alias keys for round-trip', () => {
  const catalog = catalogFromInput(
    {
      providers: [
        {
          name: 'p',
          type: 'openai',
          baseUrl: 'https://x.example.com',
          apiKey: 'k',
        },
      ],
      models: [
        {
          alias: 'p/gpt-4.1',
          provider: 'p',
          model: 'gpt-4.1',
          contextWindow: 100000,
        },
      ],
    },
    { providers: [], models: [] },
  );
  const text = stringifyCatalog(catalog);
  const reparsed = parseCatalog(text);
  assert.equal(reparsed.models[0].alias, 'p/gpt-4.1');
  assert.equal(reparsed.models[0].model, 'gpt-4.1');
});
