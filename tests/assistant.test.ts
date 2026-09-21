import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { Type } from '@earendil-works/pi-ai';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { runPiSession } from '../src/server/assistant/pi.ts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFiles } from '../src/server/files/index.ts';
import { createFlow } from '../src/server/flow/index.ts';
import { createWorkService } from '../src/server/work/index.ts';
import { createAssistant } from '../src/server/assistant/index.ts';
import { loadConfig, type ModelConfig } from '../src/server/assistant/config.ts';
import { seedCatalog } from './catalog-fixture.ts';
import {
  parseOutput,
  validateEvidence,
} from '../src/server/assistant/validation.ts';
import type {
  SessionInput,
  SessionRunner,
} from '../src/server/assistant/pi.ts';
import type {
  Definition,
  EditRequest,
  NodeExecution,
} from '../src/shared/records.ts';

const config: ModelConfig = {
  protocol: 'anthropic-messages',
  baseUrl: 'http://test.invalid',
  model: 'test',
  apiKey: 'test-secret',
};
const definition: Definition = {
  schemaVersion: 1,
  inputs: ['materials'],
  nodes: [
    {
      id: 'classify',
      label: '分类',
      kind: 'agent',
      mode: 'each',
      task: '分类',
    },
    { id: 'report', label: '报告', kind: 'agent', mode: 'all', task: '汇总' },
  ],
  edges: [
    { from: ['$input', 'materials'], to: ['classify', 'input'] },
    { from: ['classify', 'output'], to: ['report', 'input'] },
  ],
  outputs: { report: ['report', 'output'] },
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function fixture(runner: SessionRunner) {
  const root = await mkdtemp(join(tmpdir(), 'assistant-test-'));
  const files = createFiles(root),
    flow = createFlow(files);
  const work = await createWorkService(files).createWork('整理反馈并保留依据', [
    '界面很好但导出失败',
    '搜索很快',
  ]);
  const id = await flow.saveDraft(work.id, undefined, definition);
  const paths = await seedCatalog(root, {
    baseUrl: 'http://test.invalid',
    model: 'test',
    apiKey: 'test-secret',
  });
  const assistant = createAssistant(files, flow, {
    ...paths,
    runSession: runner,
  });
  const finish = async (requestId: string) => {
    for (let i = 0; i < 400; i++) {
      const message = (await files.read(work.id)).messages.find(
        (message) =>
          message.role === 'assistant' && message.requestId === requestId,
      )!;
      if (['completed', 'cancelled', 'failed'].includes(message.status!))
        return message;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('Assistant did not settle');
  };
  return {
    files,
    flow,
    work,
    id,
    assistant,
    finish,
    root,
    runner,
    clean: () => rm(root, { recursive: true, force: true }),
  };
}
async function save(input: SessionInput, proposal: Definition) {
  const tool = input.tools.find((tool) => tool.name === 'update_flow')!;
  return tool.execute(
    'same-tool-call-id',
    { definition: proposal },
    input.signal,
    undefined,
    {} as never,
  );
}

test('configuration rejects missing/unknown fields without exposing credentials', () => {
  assert.equal(
    loadConfig({
      LLM_PROTOCOL: 'openai-chat-completions',
      LLM_BASE_URL: 'https://example.com',
      LLM_MODEL: 'm',
      LLM_API_KEY: 'secret',
    }).protocol,
    'openai-completions',
  );
  assert.throws(() => loadConfig({}), /LLM_PROTOCOL/);
  assert.throws(
    () =>
      loadConfig({
        LLM_PROTOCOL: 'invented',
        LLM_BASE_URL: 'https://example.com',
        LLM_MODEL: 'm',
        LLM_API_KEY: 'secret',
      }),
    /不支持/,
  );
  assert.equal(
    loadConfig({
      LLM_PROTOCOL: 'openai-responses',
      LLM_BASE_URL: 'https://example.com/v1/',
      LLM_MODEL: 'm',
      LLM_API_KEY: 'secret',
    }).baseUrl,
    'https://example.com/v1',
  );
});

test('real file tool save occurs before final reply; selection and expected version are frozen across two saves', async () => {
  const entered = deferred(),
    release = deferred(),
    saved = deferred(),
    finishReply = deferred();
  let seen: { selectedNodeId: string; selectedSampleIds: string[] } | undefined;
  const f = await fixture(async (input) => {
    seen = JSON.parse(input.prompt);
    entered.resolve();
    await release.promise;
    const first = structuredClone(definition);
    first.nodes[0].task = '混合反馈优先问题';
    await save(input, first);
    const second = structuredClone(first);
    second.nodes[0].task += '，保留两方面依据';
    await save(input, second);
    saved.resolve();
    await finishReply.promise;
    return '实际保存完成';
  });
  try {
    const request: EditRequest = {
      text: '调整分类',
      expectedDraftId: f.id,
      nodeId: 'classify',
      sampleIds: ['sample-1'],
    };
    const requestId = await f.assistant.requestEdit(f.work.id, request);
    await entered.promise;
    request.nodeId = 'report';
    request.sampleIds![0] = 'different';
    release.resolve();
    await saved.promise;
    const current = await f.files.read(f.work.id);
    assert.notEqual(current.draftId, f.id);
    assert.equal(current.messages.at(-1)!.status, 'running');
    assert.equal(
      (await f.files.readDefinition(f.work.id, current.draftId!)).nodes[0].task,
      '混合反馈优先问题，保留两方面依据',
    );
    assert.deepEqual(current.messages.at(-2)!.sampleIds, ['sample-1']);
    assert.deepEqual(current.messages.at(-1)!.sampleIds, ['sample-1']);
    assert.equal(current.messages.at(-2)!.definitionId, f.id);
    assert.equal(seen!.selectedNodeId, 'classify');
    assert.deepEqual(seen!.selectedSampleIds, ['sample-1']);
    finishReply.resolve();
    assert.equal((await f.finish(requestId)).status, 'completed');
  } finally {
    release.resolve();
    finishReply.resolve();
    await f.clean();
  }
});

test('concurrent user edit keeps latest draft and records rejected proposal', async () => {
  const entered = deferred(),
    release = deferred();
  const f = await fixture(async (input) => {
    entered.resolve();
    await release.promise;
    const proposed = structuredClone(definition);
    proposed.nodes[0].task = '迟到修改';
    await save(input, proposed);
    return 'saved';
  });
  try {
    const requestId = await f.assistant.requestEdit(f.work.id, {
      text: '修改',
      expectedDraftId: f.id,
      nodeId: 'classify',
    });
    await entered.promise;
    const manual = structuredClone(definition);
    manual.nodes[0].task = '用户最新修改';
    const currentId = await f.flow.saveDraft(f.work.id, f.id, manual);
    release.resolve();
    const message = await f.finish(requestId);
    assert.equal(message.status, 'failed');
    assert.match(message.error!, /草稿已变化/);
    assert.equal(message.proposedDefinition!.nodes[0].task, '迟到修改');
    assert.equal((await f.files.read(f.work.id)).draftId, currentId);
  } finally {
    release.resolve();
    await f.clean();
  }
});

test('selected node cannot change unrelated node; no-change turns complete honestly', async (t) => {
  await t.test('unrelated change is rejected as failed', async () => {
    const f = await fixture(async (input) => {
      const proposed = structuredClone(definition);
      proposed.nodes[1].task = '不相关改动';
      await save(input, proposed);
      return '已修改';
    });
    try {
      const id = await f.assistant.requestEdit(f.work.id, {
        text: '改分类',
        expectedDraftId: f.id,
        nodeId: 'classify',
      });
      assert.equal((await f.finish(id)).status, 'failed');
      assert.equal((await f.files.read(f.work.id)).draftId, f.id);
    } finally {
      await f.clean();
    }
  });
  // 纯说明或原样保存不产生变更：声称与事实一致，如实标 unchanged 完成，不误报失败。
  for (const mode of ['text-only', 'unchanged']) {
    await t.test(`${mode} completes with unchanged flag`, async () => {
      const f = await fixture(async (input) => {
        if (mode === 'unchanged') await save(input, structuredClone(definition));
        return '这是对当前做法的说明，没有修改。';
      });
      try {
        const id = await f.assistant.requestEdit(f.work.id, {
          text: '改分类',
          expectedDraftId: f.id,
          nodeId: 'classify',
        });
        const message = await f.finish(id);
        assert.equal(message.status, 'completed');
        assert.equal(message.unchanged, true);
        assert.equal(message.error, undefined);
        assert.equal((await f.files.read(f.work.id)).draftId, f.id);
      } finally {
        await f.clean();
      }
    });
  }
});

test('stop reaches active session signal and cancelled state, preserving saved draft', async () => {
  const entered = deferred();
  const f = await fixture(async (input) => {
    entered.resolve();
    await new Promise<void>((resolve) =>
      input.signal.addEventListener('abort', () => resolve(), { once: true }),
    );
    throw new DOMException('Stopped', 'AbortError');
  });
  try {
    const id = await f.assistant.requestEdit(f.work.id, {
      text: '修改',
      expectedDraftId: f.id,
    });
    await entered.promise;
    await f.assistant.stopEdit(f.work.id, id);
    assert.equal((await f.finish(id)).status, 'cancelled');
    assert.equal((await f.files.read(f.work.id)).draftId, f.id);
  } finally {
    await f.clean();
  }
});

test('required fields, nested schemas, enum and raw evidence are enforced', () => {
  const schema = {
    type: 'object',
    required: ['category', 'evidence'],
    properties: {
      category: { type: 'string', enum: ['问题', '称赞'] },
      evidence: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['quote'],
          properties: { quote: { type: 'string' } },
        },
      },
    },
  };
  assert.throws(() => parseOutput('{"category":"问题"}', schema), /evidence/);
  assert.throws(
    () => parseOutput('{"category":"需求","evidence":[]}', schema),
    /allowed values/,
  );
  assert.throws(
    () => parseOutput('{"category":"问题","evidence":[]}', schema),
    /fewer than 1/,
  );
  assert.throws(() => parseOutput('fake', schema), /JSON/);
  const output = parseOutput(
    '{"category":"问题","evidence":[{"quote":"导出失败","materialId":"F01"}]}',
    schema,
  );
  validateEvidence(output, [{ id: 'F01', text: '界面很好但导出失败' }]);
  assert.throws(
    () => validateEvidence({ materialId: 'F99' }, [{ id: 'F01', text: 'x' }]),
    /本次输入/,
  );
  assert.throws(
    () =>
      validateEvidence({ materialId: 'F01', quote: '编造原话' }, [
        { id: 'F01', text: 'x' },
      ]),
    /逐字引用/,
  );
  assert.throws(
    () => validateEvidence('报告 [F99]', [{ id: 'F01', text: 'x' }]),
    /本次输入/,
  );
  assert.throws(
    () =>
      validateEvidence('报告 [12345678-1234-1234-1234-123456789012]', [
        { id: 'F01', text: 'x' },
      ]),
    /本次输入/,
  );
});

test('node executor sees only selected source materials and rejects fabricated required output', async () => {
  let input: SessionInput | undefined;
  const f = await fixture(async (session) => {
    input = session;
    return '{"category":"问题"}';
  });
  try {
    const material = f.work.materials[0];
    const context: NodeExecution = {
      workId: f.work.id,
      runId: 'r',
      definitionId: f.id,
      node: definition.nodes[0],
      instanceId: 'i',
      inputs: {
        input: [
          {
            sampleId: material.id,
            value: material.text,
            materialIds: [material.id],
            sourceResultIds: [],
          },
        ],
      },
      materials: f.work.materials,
      signal: new AbortController().signal,
      onActivity: async () => {},
    };
    assert.deepEqual(await f.assistant.executeNode(context), {
      category: '问题',
    });
    assert.equal(JSON.parse(input!.prompt).materials.length, 1);
    // agent 节点会话带运行时与文件访问
    assert.deepEqual(input!.builtinTools, ['read', 'grep', 'find', 'ls', 'bash']);
    assert.equal(input!.linkRuntime, true);
    assert.equal(typeof input!.collect, 'function');
    context.node = {
      ...context.node,
      expectedOutput: { type: 'object', required: ['evidence'] },
    };
    await assert.rejects(f.assistant.executeNode(context), /evidence/);
  } finally {
    await f.clean();
  }
});

test('node session links work uploads and collects only cleaned artifacts', async () => {
  let input: SessionInput | undefined;
  const f = await fixture(async (session) => {
    input = session;
    return '{"category":"问题"}';
  });
  try {
    await f.files.saveUpload(f.work.id, '数据.csv', Buffer.from('a,b\n1,2\n'));
    const material = f.work.materials[0];
    const context: NodeExecution = {
      workId: f.work.id,
      runId: 'r',
      definitionId: f.id,
      node: definition.nodes[0],
      instanceId: 'i',
      inputs: {
        input: [
          {
            sampleId: material.id,
            value: material.text,
            materialIds: [material.id],
            sourceResultIds: [],
          },
        ],
      },
      materials: f.work.materials,
      signal: new AbortController().signal,
      onActivity: async () => {},
    };
    await f.assistant.executeNode(context);
    assert.deepEqual(
      input!.linkFiles!.map((link) => link.as),
      ['数据.csv'],
    );
    assert.match(input!.linkFiles![0].path, /数据\.csv$/);
    const stage = await mkdtemp(join(tmpdir(), 'node-stage-'));
    await writeFile(join(stage, 'cleaned-out.csv'), 'x\n');
    await writeFile(join(stage, 'scratch.mjs'), '// 不收割');
    await input!.collect!(stage);
    assert.equal(
      await readFile(f.files.uploadPath(f.work.id, 'cleaned-out.csv'), 'utf8'),
      'x\n',
    );
    await assert.rejects(readFile(f.files.uploadPath(f.work.id, 'scratch.mjs')), /ENOENT/);
    await rm(stage, { recursive: true, force: true });
  } finally {
    await f.clean();
  }
});

test('invalid author proposals never become drafts or comparison baselines and remain inspectable', async () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  f = await fixture(async (input) => {
    const invalid = structuredClone(definition);
    invalid.edges.push({
      from: ['report', 'output'],
      to: ['$output', 'input'],
    });
    await assert.rejects(save(input, invalid), /连接|节点|端口/);
    const rejected = await f.files.read(f.work.id);
    assert.equal(rejected.draftId, undefined);
    assert.equal(rejected.draftBaseId, undefined);
    assert.deepEqual(rejected.definitionIds, []);
    assert.deepEqual(rejected.messages.at(-1)!.proposedDefinition, invalid);
    await save(input, definition);
    return '流程已生成，可以检查并运行。';
  });
  try {
    await f.files.change(f.work.id, (work) => {
      delete work.draftId;
      delete work.draftBaseId;
      work.definitionIds = [];
    });
    const requestId = await f.assistant.requestEdit(f.work.id, {
      text: '生成流程',
    });
    const response = await f.finish(requestId);
    assert.equal(response.status, 'completed');
    const current = await f.files.read(f.work.id);
    assert.equal(current.draftBaseId, current.draftId);
    assert.equal(current.definitionIds.length, 1);
    assert.deepEqual(
      await f.files.readDefinition(f.work.id, current.draftBaseId!),
      definition,
    );
    assert.equal(response.proposedDefinition, undefined);
  } finally {
    await f.clean();
  }
});

test('nested evidence strings inherit their material identity and cannot cite another real input', () => {
  const materials = [
    { id: 'M01', text: '界面顺手，但是导出失败。' },
    { id: 'M02', text: '搜索速度很快。' },
  ];
  validateEvidence(
    { materialId: 'M01', items: [{ category: '问题', evidence: '导出失败' }] },
    materials,
  );
  validateEvidence(
    { materialIds: ['M01'], items: [{ evidence: ['界面顺手', '导出失败'] }] },
    materials,
  );
  assert.throws(
    () =>
      validateEvidence(
        { materialId: 'M01', items: [{ evidence: '搜索速度很快' }] },
        materials,
      ),
    /逐字引用/,
  );
  assert.throws(
    () =>
      validateEvidence(
        { materialId: 'M01', items: [{ quote: '搜索速度很快' }] },
        materials,
      ),
    /逐字引用/,
  );
  assert.throws(
    () =>
      validateEvidence(
        { materialId: 'M01', items: [{ evidence: '编造依据' }] },
        materials,
      ),
    /逐字引用/,
  );
  assert.throws(() => validateEvidence('[M99]', materials), /本次输入/);
});

test('literal fenced JSON is parsed before schema validation', () => {
  assert.deepEqual(
    parseOutput('```json\n{"answer":"ok"}\n```', {
      type: 'object',
      required: ['answer'],
    }),
    { answer: 'ok' },
  );
  assert.deepEqual(
    parseOutput('```\n{"answer":"ok"}\n```', {
      type: 'object',
      required: ['answer'],
    }),
    { answer: 'ok' },
  );
});

test('string report output accepts Markdown and JSON strings, rejects object wrappers with actionable guidance', () => {
  const schema = { type: 'string' };
  const report = '# 报告\n\n导出有问题 [M01]。';
  assert.equal(parseOutput(report, schema), report);
  assert.equal(parseOutput(JSON.stringify(report), schema), report);
  assert.throws(
    () => parseOutput(JSON.stringify({ report }), schema),
    /请重试本节点/,
  );
  assert.throws(
    () => parseOutput('```json\n{"report":"正文"}\n```', schema),
    /不用 report 字段包装/,
  );
});

test('string report node prompts for Markdown instead of JSON and preserves structured-node JSON instructions', async () => {
  const prompts: string[] = [];
  const f = await fixture(async (input) => {
    prompts.push(input.systemPrompt);
    return prompts.length === 1
      ? '# 报告\n\n依据 [M01]'
      : '{"category":"问题"}';
  });
  try {
    const material = f.work.materials[0];
    const context: NodeExecution = {
      workId: f.work.id,
      runId: 'report-test',
      definitionId: f.id,
      node: { ...definition.nodes[1], expectedOutput: { type: 'string' } },
      instanceId: 'i',
      inputs: {
        input: [
          {
            sampleId: material.id,
            value: material.text,
            materialIds: [material.id],
            sourceResultIds: [],
          },
        ],
      },
      materials: f.work.materials,
      signal: new AbortController().signal,
      onActivity: async () => {},
    };
    assert.equal(typeof (await f.assistant.executeNode(context)), 'string');
    assert.match(prompts[0], /不要使用 report 或 content 字段包装/);
    assert.doesNotMatch(
      prompts[0],
      /最终回复必须仅包含符合 expectedOutput 的 JSON/,
    );
    context.node = {
      ...definition.nodes[0],
      expectedOutput: { type: 'object', required: ['category'] },
    };
    assert.deepEqual(await f.assistant.executeNode(context), {
      category: '问题',
    });
    assert.match(prompts[1], /符合 expectedOutput 的 JSON/);
  } finally {
    await f.clean();
  }
});

test('active author requests keep their captured catalog settings when the default changes mid-flight', async () => {
  const entered = deferred(),
    release = deferred();
  let captured: SessionInput | undefined;
  const f = await fixture(async (input) => {
    captured = input;
    entered.resolve();
    await release.promise;
    const proposal = structuredClone(definition);
    proposal.nodes[0].task = '改动';
    await save(input, proposal);
    return '已保存';
  });
  try {
    const id = await f.assistant.requestEdit(f.work.id, {
      text: '修改',
      expectedDraftId: f.id,
    });
    await entered.promise;
    // 请求开始后改默认选择，不影响本次已固定的配置
    await f.assistant.saveDefaultSelection({ alias: 'test/test', effort: 'max' });
    assert.equal(captured!.config.model, 'test');
    assert.equal(captured!.config.apiKey, 'test-secret');
    assert.equal(captured!.config.reasoningEffort, 'medium');
    release.resolve();
    assert.equal((await f.finish(id)).status, 'completed');
  } finally {
    release.resolve();
    await f.clean();
  }
});

test('author title is persisted but a concurrently hand-edited title is never overwritten', async () => {
  for (const manual of [false, true]) {
    const entered = deferred(),
      release = deferred();
    const f = await fixture(async (input) => {
      entered.resolve();
      await release.promise;
      const proposal = structuredClone(definition);
      proposal.nodes[0].task = '更清楚的分类要求';
      await input.tools
        .find((tool) => tool.name === 'update_flow')!
        .execute(
          'title-call',
          { definition: proposal, title: '反馈分析与建议' },
          input.signal,
          undefined,
          {} as never,
        );
      return '已保存';
    });
    try {
      const id = await f.assistant.requestEdit(f.work.id, {
        text: '生成做法和工作标题',
        expectedDraftId: f.id,
      });
      await entered.promise;
      if (manual)
        await f.files.change(f.work.id, (work) => {
          work.title = '我手工命名';
          work.titleEdited = true;
        });
      release.resolve();
      assert.equal((await f.finish(id)).status, 'completed');
      assert.equal(
        (await f.files.read(f.work.id)).title,
        manual ? '我手工命名' : '反馈分析与建议',
      );
    } finally {
      release.resolve();
      await f.clean();
    }
  }
});

test('real SDK maps recommended Chat settings and distinct Anthropic budgets into captured local HTTP payloads', async () => {
  let payload: Record<string, any> = {};
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    payload = JSON.parse(body);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'local capture complete' } }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const base = {
    ...config,
    baseUrl: `http://127.0.0.1:${address.port}`,
    model: 'glm-5.3-flash',
    reasoningEffort: 'max' as const,
    temperature: 1,
    topP: 0.95,
    contextWindow: 1000000,
  };
  const tool = defineTool({
    name: 'probe',
    label: 'probe',
    description: 'probe',
    parameters: Type.Object({ key: Type.String() }),
    async execute() {
      return { content: [], details: {} };
    },
  });
  try {
    for (const protocol of [
      'openai-completions',
      'anthropic-messages',
      'openai-responses',
    ] as const) {
      await assert.rejects(
        runPiSession({
          config: { ...base, protocol },
          systemPrompt: 'local',
          prompt: 'test',
          tools: [tool],
          signal: AbortSignal.timeout(10000),
        }),
      );
      assert.equal(payload.temperature, 1);
      assert.equal(payload.top_p, 0.95);
      assert.equal(payload.stream, true);
      if (protocol === 'openai-completions') {
        assert.equal(payload.reasoning_effort, 'max');
        assert.deepEqual(payload.thinking, {
          type: 'enabled',
          clear_thinking: false,
        });
        assert.equal(payload.tool_stream, true);
      }
      if (protocol === 'anthropic-messages') {
        assert.equal(payload.thinking.type, 'enabled');
        assert.equal(payload.thinking.budget_tokens, 16384);
        assert.equal(payload.reasoning_effort, undefined);
        assert.equal(payload.tool_stream, undefined);
      }
      if (protocol === 'openai-responses')
        assert.equal(payload.reasoning.effort, 'max');
    }
    await assert.rejects(
      runPiSession({
        config: {
          ...base,
          protocol: 'anthropic-messages',
          reasoningEffort: 'high',
        },
        systemPrompt: 'local',
        prompt: 'test',
        tools: [],
        signal: AbortSignal.timeout(10000),
      }),
    );
    assert.equal(payload.thinking.budget_tokens, 8192);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('item goal and frozen evidence reach the real Pi boundary; shared schema supports union constraints', async () => {
  let seen: Record<string, any> | undefined;
  const f = await fixture(async (session) => {
    seen = JSON.parse(session.prompt);
    return '{"summary":"工作项材料","verified":false}';
  });
  try {
    const item = {
      id: 'business-item',
      key: 'CASE-001',
      title: '独立事项',
      goal: '确认事项的处置依据',
      revision: 3,
      data: { asset: 'demo' },
      materials: [{ id: 'M01', text: '工作项材料，与方法样本不同' }],
    };
    const output = await f.assistant.executeNode({
      workId: f.work.id,
      runId: 'item-run',
      definitionId: f.id,
      node: {
        ...definition.nodes[0],
        mode: 'all',
        operation: 'map',
        expectedOutput: {
          type: 'object',
          required: ['summary', 'verified'],
          properties: {
            summary: { type: ['string', 'null'] },
            verified: { const: false },
          },
          additionalProperties: false,
        },
      },
      workItem: item,
      instanceId: 'item-instance',
      inputs: {
        input: [
          {
            sampleId: 'M01',
            value: item.materials[0].text,
            materialIds: ['M01'],
            sourceResultIds: [],
          },
        ],
      },
      materials: item.materials,
      signal: new AbortController().signal,
      onActivity: async () => {},
    });
    assert.deepEqual(output, { summary: '工作项材料', verified: false });
    assert.equal(seen!.operation, 'map');
    assert.equal(seen!.workItem.goal, item.goal);
    assert.deepEqual(seen!.materials, item.materials);
    assert.throws(
      () =>
        parseOutput('{"verified":true}', {
          type: 'object',
          properties: { verified: { const: false } },
        }),
      /schema/,
    );
  } finally {
    await f.clean();
  }
});

test('author prompt clips large material lists with an explicit marker', async () => {
  let seen: { materials?: unknown[] } | undefined;
  const f = await fixture(async (input) => {
    seen = JSON.parse(input.prompt);
    const next = structuredClone(definition);
    next.nodes[0].task = '调整后的分类任务';
    await save(input, next);
    return '完成';
  });
  try {
    const service = createWorkService(f.files);
    await service.addMaterials(
      f.work.id,
      Array.from({ length: 40 }, (_, i) => `补充材料 ${i + 1}`),
    );
    const requestId = await f.assistant.requestEdit(f.work.id, {
      text: '调整分类任务',
      expectedDraftId: f.id,
    });
    const message = await f.finish(requestId);
    assert.equal(message.status, 'completed', message.error ?? '');
    assert.equal(seen!.materials!.length, 31);
    assert.match(String(seen!.materials!.at(-1)), /已截断：共 42 条/);
  } finally {
    await f.clean();
  }
});

test('persistent session: bootstrap once, serialize per work, survive restart', async (t) => {
  await t.test('first turn bootstraps recentMessages; later turns rely on session file', async () => {
    const prompts: Record<string, unknown>[] = [];
    const dirs: (string | undefined)[] = [];
    const f = await fixture(async (input) => {
      dirs.push(input.sessionDir);
      prompts.push(JSON.parse(input.prompt));
      // 模拟 Pi：持久会话以 JSONL 落盘
      await mkdir(input.sessionDir!, { recursive: true });
      await writeFile(join(input.sessionDir!, 'session.jsonl'), '{}\n');
      return '说明';
    });
    try {
      const first = await f.assistant.requestEdit(f.work.id, {
        text: '先记住：分类阈值定为 0.8',
        expectedDraftId: f.id,
      });
      assert.equal((await f.finish(first)).status, 'completed');
      assert.ok(dirs[0]?.endsWith('assistant'));
      assert.ok('recentMessages' in prompts[0]!, '首轮无会话文件，用消息文本引导');

      const second = await f.assistant.requestEdit(f.work.id, {
        text: '阈值是多少？',
        expectedDraftId: f.id,
      });
      assert.equal((await f.finish(second)).status, 'completed');
      assert.ok(
        !('recentMessages' in prompts[1]!),
        '有会话文件后不再注入消息文本',
      );
      assert.equal(dirs[1], dirs[0]);

      // 进程重启等价物：同一 files 新建 assistant（内存队列清空），会话文件仍在
      const restarted = createAssistant(f.files, f.flow, {
        catalogPath: join(f.root, 'models.toml'),
        settingsPath: join(f.root, 'model-settings.json'),
        runSession: f.runner,
      });
      const third = await restarted.requestEdit(f.work.id, {
        text: '再说一遍？',
        expectedDraftId: f.id,
      });
      assert.equal((await f.finish(third)).status, 'completed');
      assert.ok(!('recentMessages' in prompts[2]!), '重启后仍复用会话文件');
    } finally {
      await f.clean();
    }
  });

  await t.test('same-work requests serialize session runs', async () => {
    let running = 0,
      max = 0;
    const f = await fixture(async () => {
      running++;
      max = Math.max(max, running);
      await new Promise((resolve) => setTimeout(resolve, 20));
      running--;
      return '好';
    });
    try {
      const a = await f.assistant.requestEdit(f.work.id, {
        text: '一',
        expectedDraftId: f.id,
      });
      const b = await f.assistant.requestEdit(f.work.id, {
        text: '二',
        expectedDraftId: f.id,
      });
      await f.finish(a);
      await f.finish(b);
      assert.equal(max, 1, '同一 Work 的会话执行不得并发');
    } finally {
      await f.clean();
    }
  });
});
