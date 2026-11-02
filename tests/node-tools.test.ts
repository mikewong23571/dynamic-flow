import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDefinition } from '../src/server/flow/index.ts';
import type { Definition } from '../src/shared/records.ts';
const definition: Definition = {
  schemaVersion: 1,
  inputs: ['input'],
  nodes: [
    {
      id: 'research',
      label: '研究',
      kind: 'agent',
      operation: 'map',
      task: '检查输入',
      tools: { builtin: [], mcp: ['sourcegraph'] },
    },
  ],
  edges: [{ from: ['$input', 'input'], to: ['research', 'input'] }],
  outputs: { result: ['research', 'output'] },
};
test('node tool configuration validates known sets and preserves omitted legacy configuration', () => {
  assert.deepEqual(checkDefinition(definition), []);
  for (const tools of [
    null,
    {},
    { builtin: ['unknown'], mcp: [] },
    { builtin: [], mcp: ['unknown'] },
    { builtin: [], mcp: ['sourcegraph', 'sourcegraph'] },
    { builtin: [], mcp: [], extra: true },
  ]) {
    const invalid = structuredClone(definition);
    invalid.nodes[0].tools = tools as never;
    assert.ok(
      checkDefinition(invalid).some((issue) => issue.field === 'tools'),
    );
  }
  const dynamic = structuredClone(definition);
  dynamic.nodes[0].kind = 'dynamic';
  assert.ok(checkDefinition(dynamic).some((issue) => issue.field === 'tools'));
  const legacy = structuredClone(definition);
  delete legacy.nodes[0].tools;
  assert.deepEqual(checkDefinition(legacy), []);
});
