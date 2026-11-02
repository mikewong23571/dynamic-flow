import type { Definition } from '../../../src/shared/records';
import type { Expression } from '../../../src/shared/expressions';
import { cveBatchResultSchema } from './result-records';
const v = (name: string, ...path: (string | number)[]): Expression => ({
  kind: 'variable',
  name,
  ...(path.length ? { path } : {}),
});
const lit = (value: string | string[]): Expression => ({
  kind: 'literal',
  value,
});
const call = (
  name: 'concat' | 'equal' | 'greaterThan' | 'length' | 'or',
  ...args: Expression[]
): Expression =>
  name === 'concat' && args.length > 2
    ? args.slice(1).reduce<Expression>(
        (acc, arg) => ({
          kind: 'call',
          function: 'concat',
          args: [acc, arg],
        }),
        args[0],
      )
    : { kind: 'call', function: name, args };
const conditional = (
  condition: Expression,
  yes: Expression,
  no: Expression,
): Expression => ({
  kind: 'match',
  value: condition,
  cases: [{ pattern: { kind: 'literal', value: true }, then: yes }],
  otherwise: no,
});
const map = (
  input: Expression,
  name: string,
  body: Expression,
): Expression => ({
  kind: 'map',
  input,
  binding: { kind: 'bind', name },
  body,
});
const object = (fields: Record<string, Expression>): Expression => ({
  kind: 'object',
  fields,
});
/** Deterministic aggregation of already verified sources, not a new investigation. */
export const batchResultDefinition: Definition = {
  schemaVersion: 1,
  inputs: ['checks'],
  inputContracts: {
    checks: {
      item: {
        type: 'object',
        required: ['item', 'outputs'],
        properties: {
          item: {
            type: 'object',
            required: ['id', 'title'],
            properties: { id: { type: 'string' }, title: { type: 'string' } },
          },
          outputs: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['source', 'value'],
              properties: {
                value: {
                  type: 'object',
                  required: [
                    'repository',
                    'requestedRef',
                    'commit',
                    'target',
                    'conclusion',
                    'reason',
                    'unknown',
                  ],
                  properties: {
                    repository: { type: 'string', minLength: 1 },
                    requestedRef: { type: 'string', minLength: 1 },
                    commit: { type: ['string', 'null'], minLength: 1 },
                    target: { type: 'string' },
                    conclusion: { enum: ['受影响', '不受影响', '证据不足'] },
                    reason: { type: 'string', minLength: 1 },
                    unknown: {
                      type: 'array',
                      items: { type: 'string', minLength: 1 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  nodes: [
    {
      id: 'batch-result',
      label: '形成整批影响核查结果',
      kind: 'function',

      operation: 'aggregate',
      functionName: 'expression',
      expression: object({
        title: lit('CVE 整批影响核查结果'),
        items: map(
          v('input'),
          'child',
          object({
            id: v('child', 'item', 'id'),
            title: v('child', 'item', 'title'),
            records: map(
              v('child', 'outputs'),
              'output',
              object({
                id: call(
                  'concat',
                  v('child', 'item', 'id'),
                  lit(':'),
                  v('output', 'value', 'repository'),
                  lit(':'),
                  v('output', 'value', 'requestedRef'),
                ),
                title: call(
                  'concat',
                  v('output', 'value', 'repository'),
                  lit(' · '),
                  v('output', 'value', 'requestedRef'),
                ),
                scope: {
                  kind: 'match',
                  value: v('output', 'value', 'commit'),
                  cases: [
                    {
                      pattern: {
                        kind: 'type',
                        valueType: 'string',
                        name: 'commit',
                      },
                      then: call('concat', lit('核查提交：'), v('commit')),
                    },
                  ],
                  otherwise: lit('核查未取得提交，源码版本范围待确认'),
                },
                finding: v('output', 'value', 'conclusion'),
                reason: v('output', 'value', 'reason'),
                actions: lit([]),
                disposition: object({
                  status: lit('pending'),
                  reason: lit(
                    '本轮仅汇集源码核查结果，尚未判定具体后续处置；未知说明不自动等同补证任务。',
                  ),
                }),
                questions: call(
                  'concat',
                  v('output', 'value', 'unknown'),
                  conditional(
                    call('equal', v('output', 'value', 'commit'), {
                      kind: 'literal',
                      value: null,
                    }),
                    lit(['核查未取得提交，需确认源码版本。']),
                    lit([]),
                  ),
                ),
                source: v('output', 'source'),
                detail: v('output', 'value'),
              }),
            ),
          }),
        ),
      }),
      expectedOutput: cveBatchResultSchema,
    },
    {
      id: 'record-list',
      label: '整理逐条核查记录',
      kind: 'function',
      operation: 'map',
      functionName: 'expression',
      expression: {
        kind: 'flatMap',
        input: v('input', 'items'),
        binding: { kind: 'bind', name: 'item' },
        body: map(
          v('item', 'records'),
          'record',
          object({
            id: v('record', 'id'),
            itemId: v('item', 'id'),
            itemTitle: v('item', 'title'),
            title: v('record', 'title'),
            scope: v('record', 'scope'),
            finding: v('record', 'finding'),
            reason: v('record', 'reason'),
            actions: v('record', 'actions'),
            disposition: v('record', 'disposition'),
            questions: v('record', 'questions'),
            source: v('record', 'source'),
            detail: v('record', 'detail'),
          }),
        ),
      },
      expectedOutput: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'itemId', 'finding', 'source'],
        },
      },
    },
  ],
  edges: [
    { from: ['$input', 'checks'], to: ['batch-result', 'input'] },
    { from: ['batch-result', 'output'], to: ['record-list', 'input'] },
  ],
  outputs: {
    results: ['batch-result', 'output'],
    records: ['record-list', 'output'],
  },
};
