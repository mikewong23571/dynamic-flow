import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInvokeFields,
  parseInvokeInputs,
} from '../src/client/core/invoke-form.ts';
import type { Definition } from '../src/shared/records';

const base: Definition = {
  schemaVersion: 1,
  inputs: ['query', 'ticket'],
  nodes: [],
  edges: [],
  outputs: {},
};

test('buildInvokeFields：未声明契约的端口为宽松 json，保持 inputs 顺序', () => {
  const fields = buildInvokeFields(base);
  assert.deepEqual(
    fields.map((f) => [f.port, f.kind, f.required]),
    [
      ['query', 'json', false],
      ['ticket', 'json', false],
    ],
  );
});

test('buildInvokeFields：按 item schema 顶层类型映射控件，required 缺省为必填', () => {
  const definition: Definition = {
    ...base,
    inputs: ['name', 'count', 'flag', 'payload', 'note'],
    inputContracts: {
      name: { item: { type: 'string' } },
      count: { item: { type: 'integer' }, required: false },
      flag: { item: { type: 'boolean' } },
      payload: { item: { type: 'object' } },
      note: { required: false },
    },
  };
  const fields = buildInvokeFields(definition);
  assert.deepEqual(
    fields.map((f) => [f.port, f.kind, f.required]),
    [
      ['name', 'text', true],
      ['count', 'number', false],
      ['flag', 'boolean', true],
      ['payload', 'json', true],
      ['note', 'json', false],
    ],
  );
});

test('parseInvokeInputs：文本原样、数字与布尔转换、JSON 解析', () => {
  const fields = buildInvokeFields({
    ...base,
    inputs: ['name', 'count', 'flag', 'payload'],
    inputContracts: {
      name: { item: { type: 'string' } },
      count: { item: { type: 'number' } },
      flag: { item: { type: 'boolean' } },
      payload: { item: { type: 'object' } },
    },
  });
  const result = parseInvokeInputs(fields, {
    name: ['订单失败', ''],
    count: ['3'],
    flag: ['true'],
    payload: ['{"id": 1}'],
  });
  assert.deepEqual(result, {
    inputs: {
      name: ['订单失败'],
      count: [3],
      flag: [true],
      payload: [{ id: 1 }],
    },
  });
});

test('parseInvokeInputs：必填端口为空与非法值给出中文错误', () => {
  const fields = buildInvokeFields({
    ...base,
    inputs: ['name', 'count', 'payload'],
    inputContracts: {
      name: { item: { type: 'string' } },
      count: { item: { type: 'number' }, required: false },
      payload: { item: { type: 'object' }, required: false },
    },
  });
  const result = parseInvokeInputs(fields, {
    name: [''],
    count: ['abc'],
    payload: ['{bad'],
  });
  assert.ok('errors' in result);
  const { errors } = result as { errors: string[] };
  assert.equal(errors.length, 3);
  assert.match(errors[0], /端口「name」必须提供输入/);
  assert.match(errors[1], /端口「count」第 1 条不是数字/);
  assert.match(errors[2], /端口「payload」第 1 条不是合法 JSON/);
});

test('parseInvokeInputs：数字只收十进制，拒绝 Infinity 与十六进制', () => {
  const fields = buildInvokeFields({
    ...base,
    inputs: ['count'],
    inputContracts: { count: { item: { type: 'number' } } },
  });
  const ok = parseInvokeInputs(fields, { count: ['-2.5', '1e5', '.5'] });
  assert.deepEqual(ok, { inputs: { count: [-2.5, 100000, 0.5] } });
  for (const text of ['Infinity', '-Infinity', '0x1F', 'NaN']) {
    const result = parseInvokeInputs(fields, { count: [text] });
    assert.ok('errors' in result, text);
    assert.match((result as { errors: string[] }).errors[0], /不是数字/);
  }
});

test('parseInvokeInputs：非必填端口留空则不出现', () => {
  const fields = buildInvokeFields({
    ...base,
    inputs: ['name', 'extra'],
    inputContracts: {
      name: { item: { type: 'string' } },
      extra: { required: false },
    },
  });
  const result = parseInvokeInputs(fields, { name: ['x'], extra: [''] });
  assert.deepEqual(result, { inputs: { name: ['x'] } });
});
