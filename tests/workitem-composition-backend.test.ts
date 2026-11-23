import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedCatalog } from './catalog-fixture.ts';
import type { SessionInput } from '../src/server/assistant/pi.ts';
import { createApplication } from '../src/server/index.ts';
import { workItemSystemPrinciples } from '../src/server/assistant/workitem.ts';

test('private workspace is isolated, stale edits rejected, and real inputs run without a model', async () => {
  const root = await mkdtemp(join(tmpdir(), 'item-composition-'));
  try {
    const server = await createApplication({ dataRoot: root });
    const post = async (path: string, body: unknown) =>
      server.app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const item = (await (
      await post('/api/items', {
        title: '报价比较',
        goal: '比较报价',
        materials: ['原始报价'],
      })
    ).json()) as any;
    let response = await post(`/api/items/${item.id}/workspace/actions`, {
      action: 'init',
    });
    assert.equal(response.status, 200);
    let workspace = (await response.json()) as any;
    assert.equal(workspace.work.work.ownerItemId, item.id);
    const listed = (await (
      await server.app.request('/api/works')
    ).json()) as any;
    assert.equal(listed.total, 0);
    const definition = {
      schemaVersion: 1,
      inputs: ['input'],
      nodes: [
        {
          id: 'identity',
          label: '保留报价',
          kind: 'function',
          operation: 'map',
          functionName: 'identity',
        },
      ],
      edges: [{ from: ['$input', 'input'], to: ['identity', 'input'] }],
      outputs: { quotes: ['identity', 'output'] },
    };
    response = await post(`/api/items/${item.id}/workspace/actions`, {
      action: 'saveFlow',
      baseRevision: workspace.item.revision,
      definition,
    });
    assert.equal(
      response.status,
      200,
      JSON.stringify(await response.clone().json()),
    );
    const saved = (await response.json()) as any;
    response = await post(`/api/items/${item.id}/workspace/actions`, {
      action: 'saveFlow',
      baseRevision: workspace.item.revision,
      definition,
    });
    assert.equal(response.status, 400);
    assert.equal(((await response.json()) as any).code, 'REVISION_CONFLICT');
    response = await post(`/api/items/${item.id}/workspace/actions`, {
      action: 'selectInputs',
      baseRevision: saved.item.revision,
      inputPort: 'input',
      materialIds: [item.materials[0].id],
    });
    assert.equal(
      response.status,
      200,
      JSON.stringify(await response.clone().json()),
    );
    const prepared = (await response.json()) as any;
    assert.deepEqual(prepared.item.inputBindings.input, [
      { kind: 'material', materialId: item.materials[0].id },
    ]);
    response = await post(`/api/items/${item.id}/workspace/actions`, {
      action: 'run',
      baseRevision: prepared.item.revision,
    });
    assert.equal(
      response.status,
      200,
      JSON.stringify(await response.clone().json()),
    );
    for (let i = 0; i < 100; i++) {
      workspace = (await (
        await server.app.request(`/api/items/${item.id}/workspace`)
      ).json()) as any;
      if (workspace.work.work.runs.at(-1)?.status === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const run = workspace.work.work.runs.at(-1);
    assert.equal(run.status, 'completed');
    assert.equal(run.results[0].outputs.output[0].value, '原始报价');
    assert.equal(workspace.item.status, 'open');
    response = await post(`/api/items/${item.id}/workspace/actions`, {
      action: 'criteria',
      baseRevision: 0,
      criteria: [],
    });
    assert.equal(response.status, 400);
    assert.equal(((await response.json()) as any).code, 'REVISION_CONFLICT');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('declared delivery uses saved values, preserves other outputs and selected records across restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'item-delivery-'));
  try {
    let server = await createApplication({ dataRoot: root });
    const req = async (path: string, body?: unknown) => {
      const response = await server.app.request(
        path,
        body === undefined
          ? undefined
          : {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            },
      );
      return { response, data: (await response.json()) as any };
    };
    const item = (
      await req('/api/items', {
        title: '采购报价',
        goal: '比较供应商',
        materials: ['报价原文'],
      })
    ).data;
    let ws = (
      await req(`/api/items/${item.id}/workspace/actions`, { action: 'init' })
    ).data;
    const action = (body: unknown) =>
      req(`/api/items/${item.id}/workspace/actions`, body);
    const definition = {
      schemaVersion: 1,
      inputs: ['input', 'facts'],
      nodes: [
        {
          id: 'normalize',
          label: '整理报价',
          kind: 'function',
          operation: 'map',
          functionName: 'expression',
          expression: {
            kind: 'literal',
            value: [
              { id: 'offer-b', vendor: '乙', price: 8 },
              { id: 'offer-a', vendor: '甲', price: 10 },
            ],
          },
        },
        {
          id: 'facts',
          label: '保留事实',
          kind: 'function',
          operation: 'map',
          functionName: 'identity',
        },
      ],
      edges: [
        { from: ['$input', 'input'], to: ['normalize', 'input'] },
        { from: ['$input', 'facts'], to: ['facts', 'input'] },
      ],
      outputs: {
        quotes: ['normalize', 'output'],
        archive: ['facts', 'output'],
      },
    };
    {
      const saved = await action({
        action: 'saveFlow',
        baseRevision: ws.item.revision,
        definition,
      });
      assert.equal(saved.response.status, 200, JSON.stringify(saved.data));
      ws = saved.data;
    }
    for (const inputPort of ['input', 'facts']) {
      const prepared = await action({
        action: 'selectInputs',
        baseRevision: ws.item.revision,
        inputPort,
        materialIds: [item.materials[0].id],
      });
      assert.equal(
        prepared.response.status,
        200,
        JSON.stringify(prepared.data),
      );
      ws = prepared.data;
    }
    ws = (await action({ action: 'run', baseRevision: ws.item.revision })).data;
    for (
      let i = 0;
      i < 100 && ws.work.work.runs.at(-1)?.status !== 'completed';
      i++
    ) {
      await new Promise((r) => setTimeout(r, 10));
      ws = (await req(`/api/items/${item.id}/workspace`)).data;
    }
    const runId = ws.work.work.runs.at(-1).id;
    const source =
      'root = Workspace("报价成果", [quotes, archive])\nquotes = Records("quotes", "供应商", "id", [Field("vendor", "供应商"), Field("price", "价格")])\narchive = Report("archive", "原始事实")';
    ws = (
      await action({
        action: 'saveUiProgram',
        baseRevision: ws.item.revision,
        source,
      })
    ).data;
    for (const output of ['quotes', 'archive']) {
      const result = await action({
        action: 'publishDelivery',
        baseRevision: ws.item.revision,
        runId,
        output,
        programId: ws.uiProgram.id,
      });
      assert.equal(result.response.status, 200, JSON.stringify(result.data));
      ws = result.data;
    }
    assert.equal(ws.deliveries.length, 2);
    const deliveryId = ws.deliveries.find((d: any) => d.output === 'quotes').id;
    const invalid = await action({
      action: 'continueRecords',
      baseRevision: ws.item.revision,
      deliveryId,
      recordIds: ['not-present'],
      inputPort: 'input',
    });
    assert.equal(invalid.response.status, 400);
    const selected = await action({
      action: 'continueRecords',
      baseRevision: ws.item.revision,
      deliveryId,
      recordIds: ['offer-a'],
      inputPort: 'input',
    });
    assert.equal(selected.response.status, 200, JSON.stringify(selected.data));
    ws = selected.data;
    assert.deepEqual(ws.item.receivedInputs.at(-1).value, {
      id: 'offer-a',
      vendor: '甲',
      price: 10,
    });
    assert.equal(ws.item.receivedInputs.at(-1).source.runId, runId);
    assert.deepEqual(ws.item.inputBindings.facts, [
      { kind: 'material', materialId: item.materials[0].id },
    ]);
    const saved = await action({
      action: 'saveMethod',
      baseRevision: ws.item.revision,
      title: '比较报价',
    });
    assert.equal(saved.response.status, 200, JSON.stringify(saved.data));
    const methods = (await req(`/api/items/${item.id}/workspace`)).data.methods;
    assert.equal(methods[0].uiProgramTemplate.source, source);
    server = await createApplication({ dataRoot: root });
    ws = (await req(`/api/items/${item.id}/workspace`)).data;
    assert.equal(ws.deliveries.length, 2);
    assert.equal(ws.item.receivedInputs.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('work item Pi tools discover methods and save through the page service; turn state survives reopen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'item-assistant-'));
  const sessions: SessionInput[] = [];
  try {
    await seedCatalog(root, {
      baseUrl: 'https://fixture.invalid',
      model: 'fixture',
      apiKey: 'fixture-secret',
    });
    const runSession = async (input: SessionInput) => {
      sessions.push(input);
      const call = async (name: string, args: any) => {
        const tool = input.tools.find((t) => t.name === name);
        assert.ok(tool, name);
        return tool.execute(
          'fixture-tool',
          args,
          input.signal,
          undefined as never,
          undefined as never,
        ) as Promise<any>;
      };
      const methods = await call('methods', { action: 'find' });
      assert.ok(methods.content[0].text.includes('报价方法'));
      const snapshot = JSON.parse(
        (await call('inspect_workspace', {})).content[0].text,
      );
      const saved = await call('apply_workspace_plan', {
        baseRevision: snapshot.item.revision,
        expectedDraftId: snapshot.work.draftId,
        definition: {
          schemaVersion: 1,
          inputs: ['input'],
          nodes: [
            {
              id: 'copy',
              label: '保存报价',
              kind: 'function',
              operation: 'map',
              functionName: 'identity',
            },
          ],
          edges: [{ from: ['$input', 'input'], to: ['copy', 'input'] }],
          outputs: { report: ['copy', 'output'] },
        },
      });
      const receipt = JSON.parse(saved.content[0].text);
      assert.equal(receipt.item.id, snapshot.item.id);
      const capabilities = JSON.parse(
        (await call('describe_capabilities', {})).content[0].text,
      );
      assert.equal(capabilities.systemPrinciples, workItemSystemPrinciples);
      assert.ok(input.systemPrompt.startsWith(workItemSystemPrinciples));
      assert.ok(Array.isArray(capabilities.openuiComponents));
      assert.ok(capabilities.openuiComponents.includes('InputForm'));
      assert.ok(capabilities.openuiInstructions.includes('InputForm'));
      const source =
        'root = Workspace("报价交付", [report])\nreport = Report("report", "报价交付")';
      const checked = JSON.parse(
        (await call('check_workspace', { source })).content[0].text,
      );
      assert.equal(
        checked.issues.filter(
          (i: any) => i.area === 'ui' && i.code !== 'UI_PROGRAM_NOT_SAVED',
        ).length,
        0,
      );
      const beforeSave = JSON.parse(
        (await call('inspect_workspace', {})).content[0].text,
      );
      assert.equal(beforeSave.item.revision, receipt.item.revision);
      const planned = JSON.parse(
        (
          await call('apply_workspace_plan', {
            baseRevision: receipt.item.revision,
            uiSource: source,
          })
        ).content[0].text,
      );
      assert.equal(planned.uiProgram.source, source);
      assert.equal(planned.work.runs.length, 0);
      return '流程已保存，可在本页运行。';
    };
    let server = await createApplication({ dataRoot: root, runSession });
    const publicMethod = await server.work.createWork('报价方法', []);
    await server.flow.saveDraft(publicMethod.id, undefined, {
      schemaVersion: 1,
      inputs: ['input'],
      nodes: [
        {
          id: 'x',
          label: '报价',
          kind: 'function',
          operation: 'map',
          functionName: 'identity',
        },
      ],
      edges: [{ from: ['$input', 'input'], to: ['x', 'input'] }],
      outputs: { quote: ['x', 'output'] },
    });
    const post = async (path: string, body: unknown) =>
      server.app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const item = (await (
      await post('/api/items', {
        title: '报价调查',
        goal: '调查报价',
        materials: ['原始报价'],
      })
    ).json()) as any;
    const response = await post(`/api/items/${item.id}/workspace/actions`, {
      action: 'assistant',
      text: '找到已有报价方法，保存处理流程',
    });
    assert.equal(
      response.status,
      200,
      JSON.stringify(await response.clone().json()),
    );
    const receipt = (await response.json()) as any;
    assert.equal(typeof receipt.requestId, 'string');
    let ws: any;
    for (let i = 0; i < 100; i++) {
      ws = await (
        await server.app.request(`/api/items/${item.id}/workspace`)
      ).json();
      if (ws.work.work.messages.at(-1).status !== 'running') break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(
      ws.work.work.messages.at(-1).status,
      'completed',
      JSON.stringify(ws.work.work.messages),
    );
    assert.ok(ws.work.work.draftId);
    assert.ok(sessions[0].sessionDir?.includes('work-item'));
    assert.equal(
      ws.work.work.runs.length,
      0,
      'saving does not silently execute',
    );
    server = await createApplication({ dataRoot: root, runSession });
    ws = await (
      await server.app.request(`/api/items/${item.id}/workspace`)
    ).json();
    assert.equal(
      ws.work.work.messages.at(-1).text,
      '流程已保存，可在本页运行。',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('uploads keep real spreadsheet values and structured input revisions keep provenance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'item-upload-'));
  try {
    const xlsx = await import('xlsx');
    const book = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(
      book,
      xlsx.utils.json_to_sheet([{ vendor: '真实供应商', price: 18 }]),
      '报价',
    );
    const bytes = xlsx.write(book, { type: 'buffer', bookType: 'xlsx' });
    const server = await createApplication({ dataRoot: root });
    const post = async (path: string, body: unknown) =>
      server.app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const item = (await (
      await post('/api/items', { title: '附件报价', goal: '核对报价' })
    ).json()) as any;
    let response = await server.app.request(
      `/api/items/${item.id}/uploads?name=quotes.xlsx`,
      { method: 'POST', body: bytes },
    );
    assert.equal(response.status, 201);
    let ws = (await response.json()) as any;
    assert.ok(ws.item.materials[0].text.includes('真实供应商'));
    assert.ok(ws.item.materials[0].text.includes('18'));
    assert.deepEqual(
      await server.files.readUpload(ws.work.work.id, 'quotes.xlsx'),
      bytes,
    );
    response = await server.app.request(
      `/api/items/${item.id}/uploads?name=unknown.bin`,
      { method: 'POST', body: Buffer.from([1, 2, 3]) },
    );
    ws = await response.json();
    assert.ok(ws.item.materials.at(-1).text.includes('正文尚未解析'));
    const definition = {
      schemaVersion: 1,
      inputs: ['quotes'],
      inputContracts: {
        quotes: {
          item: {
            type: 'object',
            properties: { id: { type: 'string' }, price: { type: 'number' } },
            required: ['id', 'price'],
            additionalProperties: false,
          },
        },
      },
      nodes: [
        {
          id: 'keep',
          label: '核对报价',
          kind: 'function',
          operation: 'map',
          functionName: 'identity',
        },
      ],
      edges: [{ from: ['$input', 'quotes'], to: ['keep', 'input'] }],
      outputs: { quotes: ['keep', 'output'] },
    };
    response = await post(`/api/items/${item.id}/workspace/actions`, {
      action: 'saveFlow',
      baseRevision: ws.item.revision,
      definition,
    });
    ws = await response.json();
    response = await post(`/api/items/${item.id}/workspace/actions`, {
      action: 'addInput',
      baseRevision: ws.item.revision,
      inputPort: 'quotes',
      label: '明确报价',
      value: { id: 'q1', price: '18' },
    });
    assert.equal(
      response.status,
      400,
      'input schema is checked by page service',
    );
    response = await post(`/api/items/${item.id}/workspace/actions`, {
      action: 'addInput',
      baseRevision: ws.item.revision,
      inputPort: 'quotes',
      label: '明确报价',
      value: { id: 'q1', price: 18 },
    });
    ws = await response.json();
    const oldId = ws.item.receivedInputs.at(-1).id;
    response = await post(`/api/items/${item.id}/workspace/actions`, {
      action: 'reviseInput',
      baseRevision: ws.item.revision,
      inputId: oldId,
      inputPort: 'quotes',
      label: '修订报价',
      value: { id: 'q1', price: 17 },
    });
    ws = await response.json();
    assert.equal(ws.item.receivedInputs.length, 2);
    assert.equal(ws.item.receivedInputs.at(-1).replacesId, oldId);
    assert.equal(ws.item.inputBindings.quotes.length, 1);
    assert.equal(ws.item.receivedInputs[0].value.price, 18);
    response = await post(`/api/items/${item.id}/workspace/actions`, {
      action: 'addInput',
      baseRevision: ws.item.revision,
      inputPort: 'quotes',
      label: '源报价',
      value: { id: 'q2', price: 18 },
      materialIds: [ws.item.materials[0].id],
    });
    ws = await response.json();
    assert.equal(
      ws.item.receivedInputs.at(-1).materials[0].text,
      ws.item.materials[0].text,
    );
    response = await post(`/api/items/${item.id}/workspace/actions`, {
      action: 'run',
      baseRevision: ws.item.revision,
    });
    assert.equal(
      response.status,
      200,
      JSON.stringify(await response.clone().json()),
    );
    const latest = (await (
      await server.app.request(`/api/items/${item.id}/workspace`)
    ).json()) as any;
    assert.ok(
      latest.work.work.runs
        .at(-1)
        .workItem.materials.some((m: any) => m.text.includes('真实供应商')),
      'explicit original material survives into frozen run',
    );
    for (let n = 0; n < 100; n++) {
      const state = (await (
        await server.app.request(`/api/items/${item.id}/workspace`)
      ).json()) as any;
      if (
        ['completed', 'failed', 'cancelled'].includes(
          state.work.work.runs.at(-1).status,
        )
      )
        break;
      await new Promise((r) => setTimeout(r, 10));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('record continuation selects a saved method version and only runs the chosen real row', async () => {
  const root = await mkdtemp(join(tmpdir(), 'item-call-selection-'));
  try {
    const server = await createApplication({ dataRoot: root });
    const req = async (path: string, body?: unknown) => {
      const response = await server.app.request(
        path,
        body === undefined
          ? undefined
          : {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            },
      );
      const data = (await response.json()) as any;
      assert.equal(response.status, 200, JSON.stringify(data));
      return data;
    };
    const created = await server.items.create({
      title: '选报价',
      goal: '选报价',
      materials: ['两条原始报价'],
    });
    const id = created.id,
      act = (body: unknown) => req(`/api/items/${id}/workspace/actions`, body);
    let ws = await act({ action: 'init' });
    const d = {
      schemaVersion: 1,
      inputs: ['input'],
      nodes: [
        {
          id: 'normalize',
          label: '整理报价',
          kind: 'function',
          operation: 'map',
          functionName: 'expression',
          expression: {
            kind: 'literal',
            value: [
              { id: 'q-b', price: 8 },
              { id: 'q-a', price: 10 },
            ],
          },
        },
      ],
      edges: [{ from: ['$input', 'input'], to: ['normalize', 'input'] }],
      outputs: { quotes: ['normalize', 'output'] },
    };
    ws = await act({
      action: 'saveFlow',
      baseRevision: ws.item.revision,
      definition: d,
    });
    ws = await act({
      action: 'selectInputs',
      baseRevision: ws.item.revision,
      inputPort: 'input',
      materialIds: [created.materials[0].id],
    });
    ws = await act({ action: 'run', baseRevision: ws.item.revision });
    const settle = async () => {
      for (let n = 0; n < 100; n++) {
        ws = await req(`/api/items/${id}/workspace`);
        if (['completed', 'failed'].includes(ws.work.work.runs.at(-1)?.status))
          return;
        await new Promise((r) => setTimeout(r, 10));
      }
    };
    await settle();
    assert.equal(ws.work.work.runs.at(-1).status, 'completed');
    ws = await act({
      action: 'saveUiProgram',
      baseRevision: ws.item.revision,
      source:
        'root = Workspace("报价", [quotes])\nquotes = Records("quotes", "报价", "id", [Field("id", "报价"), Field("price", "价格")])',
    });
    ws = await act({
      action: 'publishDelivery',
      baseRevision: ws.item.revision,
      runId: ws.work.work.runs.at(-1).id,
      output: 'quotes',
      programId: ws.uiProgram.id,
    });
    const method = await server.work.createWork('逐项报价复核', []);
    await server.flow.saveDraft(method.id, undefined, {
      schemaVersion: 1,
      inputs: ['quotes'],
      nodes: [
        {
          id: 'copy',
          label: '保留实际报价',
          kind: 'function',
          operation: 'map',
          functionName: 'identity',
        },
      ],
      edges: [{ from: ['$input', 'quotes'], to: ['copy', 'input'] }],
      outputs: { quote: ['copy', 'output'] },
    });
    const version = (await server.files.read(method.id)).draftId;
    ws = await act({
      action: 'continueRecords',
      baseRevision: ws.item.revision,
      deliveryId: ws.deliveries[0].id,
      recordIds: ['q-a'],
      methodId: method.id,
      methodDefinitionId: version,
      inputPort: 'quotes',
    });
    const saved = ws.work.definitions[ws.work.work.draftId];
    assert.equal(saved.nodes[0].kind, 'call');
    assert.equal(saved.nodes[0].call.definitionId, version);
    ws = await act({ action: 'run', baseRevision: ws.item.revision });
    await settle();
    const run = ws.work.work.runs.at(-1);
    assert.equal(run.status, 'completed', JSON.stringify(run));
    assert.deepEqual(
      run.results[0].outputs.quote.map((x: any) => x.value),
      [{ id: 'q-a', price: 10 }],
    );
    assert.equal(
      ws.item.runs.length,
      2,
      'nested call is not another business advancement',
    );
    assert.equal(ws.deliveries.length, 1, 'previous delivery remains readable');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('method catalog advertises emitted item schemas rather than batch validation schemas', async () => {
  const root = await mkdtemp(join(tmpdir(), 'item-method-contract-'));
  try {
    const server = await createApplication({ dataRoot: root });
    const item = await server.items.create({
      title: '方法目录',
      goal: '检查方法合同',
      materials: [],
    });
    const method = await server.work.createWork('整理输入集合', []);
    const itemSchema = {
      type: 'object',
      properties: { id: { type: 'string' } },
    };
    const groupSchema = {
      type: 'object',
      properties: {
        key: { type: 'array' },
        items: { type: 'array', items: itemSchema },
      },
    };
    const version = await server.files.writeDefinition(method.id, {
      schemaVersion: 1,
      inputs: ['input'],
      nodes: [
        {
          id: 'split',
          label: '拆分',
          kind: 'agent',
          operation: 'flatMap',
          task: '拆分真实输入',
          expectedOutput: { type: 'array', items: itemSchema },
        },
        {
          id: 'group',
          label: '分组',
          kind: 'function',
          functionName: 'groupBy',

          operation: 'aggregate',
          groupBy: { keys: [['id']] },
          expectedOutput: { type: 'array', items: groupSchema },
        },
        {
          id: 'wait',
          label: '补充',
          kind: 'wait',

          wait: { event: 'reply', reason: '等待回复' },
          expectedOutput: { type: 'array', items: itemSchema },
        },
      ],
      edges: [
        { from: ['$input', 'input'], to: ['split', 'input'] },
        { from: ['split', 'output'], to: ['group', 'input'] },
        { from: ['split', 'output'], to: ['wait', 'input'] },
      ],
      outputs: {
        split: ['split', 'output'],
        groups: ['group', 'output'],
        continued: ['wait', 'output'],
        event: ['wait', 'event'],
      },
    });
    await server.files.change(method.id, (w) => {
      w.definitionIds.push(version);
      w.adoptedId = version;
    });
    const response = await server.app.request(
      `/api/items/${item.id}/workspace`,
    );
    assert.equal(response.status, 200);
    const ws = (await response.json()) as any;
    const contract = ws.methods.find(
      (m: any) => m.workId === method.id,
    ).outputContracts;
    assert.deepEqual(contract.split, itemSchema);
    assert.deepEqual(contract.groups, groupSchema);
    assert.deepEqual(contract.continued, itemSchema);
    assert.equal(contract.event, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
