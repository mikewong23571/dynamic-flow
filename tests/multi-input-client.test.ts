import test from 'node:test';
import assert from 'node:assert/strict';
import type { Definition } from '../src/shared/records';
import { inputPorts, localInputs } from '../src/client/model';
import {
  changeFunction,
  changeInputNames,
  collectionSummary,
} from '../src/client/collection-model';
const definition: Definition = {
  schemaVersion: 1,
  inputs: ['materials'],
  nodes: [
    {
      id: 'gather',
      label: '收集',
      kind: 'function',
      mode: 'all',
      functionName: 'collect',
      inputNames: ['investigation', 'remediation', 'verification'],
    },
  ],
  edges: ['investigation', 'remediation', 'verification'].map((p, i) => ({
    from: [`source${i}`, 'output'],
    to: ['gather', p],
  })),
  outputs: { final: ['gather', 'output'] },
};
test('动态端口改名保留连接，删除只删除对应连接，原定义不变', () => {
  const renamed = changeInputNames(
    definition,
    'gather',
    ['findings', 'remediation', 'verification'],
    ['investigation', 'findings'],
  );
  assert.deepEqual(
    renamed.edges.map((e) => e.to[1]),
    ['findings', 'remediation', 'verification'],
  );
  const removed = changeInputNames(renamed, 'gather', [
    'findings',
    'verification',
  ]);
  assert.deepEqual(
    removed.edges.map((e) => e.from[0]),
    ['source0', 'source2'],
  );
  assert.deepEqual(removed.outputs, definition.outputs);
  assert.equal(definition.edges[0].to[1], 'investigation');
});
test('切换关联不遗留不可见端口；旧merge可升级动态端口', () => {
  const joined = changeFunction(definition, 'gather', 'join');
  assert.deepEqual(joined.edges, []);
  assert.deepEqual(inputPorts(joined.nodes[0]), ['left', 'right']);
  assert.deepEqual(joined.nodes[0].join, {
    type: 'inner',
    leftKey: ['id'],
    rightKey: ['id'],
    duplicates: 'all',
  });
  const legacy: Definition = {
    ...definition,
    nodes: [
      { ...definition.nodes[0], functionName: 'merge', inputNames: undefined },
    ],
  };
  assert.deepEqual(inputPorts(legacy.nodes[0]), ['left', 'right']);
  assert.deepEqual(
    changeFunction(legacy, 'gather', 'collect').nodes[0].inputNames,
    ['left', 'right'],
  );
});
test('局部试验可选择任意具名端口，保留其他空路；画布摘要体现集合含义', () => {
  const item = {
    sampleId: 'm',
    value: 3,
    materialIds: ['m'],
    sourceResultIds: [],
  };
  assert.deepEqual(
    localInputs(definition.nodes[0], { input: [item] }, 'verification'),
    { investigation: [], remediation: [], verification: [item] },
  );
  assert.equal(collectionSummary(definition.nodes[0]), '具名收集 · 3 路');
});

test('具名Schema随端口改名和删除同步，保留描述、其他属性及嵌套约束', () => {
  const schema = {
    type: 'object',
    title: '收集结果',
    properties: {
      investigation: {
        type: 'array',
        items: {
          type: 'object',
          properties: { investigation: { type: 'string' } },
        },
      },
      remediation: { type: 'array' },
      note: { type: 'string' },
    },
    required: ['investigation', 'remediation'],
    additionalProperties: false,
  };
  const withSchema = {
    ...definition,
    nodes: [
      { ...definition.nodes[0], inputSchema: schema, expectedOutput: schema },
    ],
  };
  const renamed = changeInputNames(
    withSchema,
    'gather',
    ['findings', 'remediation', 'verification'],
    ['investigation', 'findings'],
  );
  const expected = {
    ...schema,
    properties: {
      findings: schema.properties.investigation,
      remediation: schema.properties.remediation,
      note: schema.properties.note,
    },
    required: ['findings', 'remediation'],
  };
  assert.deepEqual(renamed.nodes[0].inputSchema, expected);
  assert.deepEqual(renamed.nodes[0].expectedOutput, expected);
  const removed = changeInputNames(renamed, 'gather', [
    'findings',
    'verification',
  ]);
  assert.deepEqual(removed.nodes[0].inputSchema, {
    ...expected,
    properties: {
      findings: schema.properties.investigation,
      note: schema.properties.note,
    },
    required: ['findings'],
  });
});
