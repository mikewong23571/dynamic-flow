import { mergeOpenUIProgram } from '../../../src/shared/openui.ts';
import type {
  Definition,
  FlowNode,
  Json,
} from '../../../src/shared/records.ts';
import type {
  Expression,
  PureFunction,
} from '../../../src/shared/expressions.ts';
import {
  alertSchema,
  assessmentSchema,
  compositionDefinition,
  cveUiProgram,
} from './recipe.ts';
export type SavedMethod = { workId: string; definitionId: string };
const v = (name: string, ...path: (string | number)[]): Expression => ({
  kind: 'variable',
  name,
  ...(path.length ? { path } : {}),
});
const lit = (value: Json): Expression => ({ kind: 'literal', value });
const obj = (fields: Record<string, Expression>): Expression => ({
  kind: 'object',
  fields,
});
const call = (fn: PureFunction, ...args: Expression[]): Expression => ({
  kind: 'call',
  function: fn,
  args,
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
const filter = (
  input: Expression,
  name: string,
  predicate: Expression,
): Expression => ({
  kind: 'filter',
  input,
  binding: { kind: 'bind', name },
  predicate,
});
const yes = (
  condition: Expression,
  then: Expression,
  otherwise: Expression,
): Expression => ({
  kind: 'match',
  value: condition,
  cases: [{ pattern: { kind: 'literal', value: true }, then }],
  otherwise,
});
const expression = (
  id: string,
  label: string,
  body: Expression,
  operation: 'map' | 'flatMap' | 'aggregate' = 'map',
): FlowNode => ({
  id,
  label,
  kind: 'function',
  functionName: 'expression',
  operation,
  expression: body,
});
export const batchSchema = {
  type: 'object',
  required: ['alerts', 'assessments'],
  properties: {
    alerts: { type: 'array', items: alertSchema },
    assessments: { type: 'array', items: assessmentSchema },
  },
} satisfies Json;
/** All batch policy and context propagation stay in an ordinary saved pipeline. */
export function interactiveBatchDefinition(check: SavedMethod): Definition {
  const base = compositionDefinition(check);
  const nodes = [
    expression('alerts', '读取原告警集合', v('input', 'alerts'), 'flatMap'),
    expression(
      'assessments',
      '读取已提供判断',
      v('input', 'assessments'),
      'flatMap',
    ),
    ...base.nodes,
  ];
  const edges: Definition['edges'] = [
    { from: ['$input', 'batch'], to: ['alerts', 'input'] },
    { from: ['$input', 'batch'], to: ['assessments', 'input'] },
    ...base.edges.map((edge) => ({
      ...edge,
      from:
        edge.from[0] === '$input'
          ? ([edge.from[1], 'output'] as [string, string])
          : edge.from,
    })),
  ];
  const fields = {
    impact: [
      'id',
      'repository',
      'requestedRef',
      'baseline',
      'cve',
      'alertIds',
      'scopeMatched',
      'conclusion',
      'disposition',
      'reason',
      'evidence',
      'confirmation',
      'verification',
      'changes',
      'accepted',
    ],
    audit: [
      'id',
      'relationId',
      'repository',
      'requestedRef',
      'baseline',
      'cve',
      'conclusion',
      'disposition',
      'reason',
      'evidence',
      'confirmation',
      'verification',
      'accepted',
    ],
  };
  const outputs = { ...base.outputs };
  for (const name of ['impact', 'audit'] as const) {
    nodes.push(
      {
        id: `collect_${name}`,
        label: '关联本批范围与已采用判断',
        kind: 'function',
        functionName: 'collect',
        inputNames: ['rows', 'batch'],

        operation: 'aggregate',
      },
      expression(
        `context_${name}`,
        '保留后续处理所需的批次上下文',
        map(
          v('input', 'rows'),
          'row',
          obj({
            ...Object.fromEntries(
              fields[name].map((field) => [field, v('row', field)]),
            ),
            context: v('input', 'batch', 0),
          }),
        ),
        'flatMap',
      ),
    );
    edges.push(
      { from: base.outputs[name], to: [`collect_${name}`, 'rows'] },
      { from: ['$input', 'batch'], to: [`collect_${name}`, 'batch'] },
      { from: [`collect_${name}`, 'output'], to: [`context_${name}`, 'input'] },
    );
    outputs[name] = [`context_${name}`, 'output'];
  }
  return {
    schemaVersion: 1,
    problem: {
      framing:
        '核对已提供的假设告警与判断，形成影响、改动、逐条交付和缺口；保留范围上下文以承接补查。',
      known: '这里只机械核对调用者给定的判断与依据。',
      unknown: '证据真实性和真实修复有效性由实际调查及人工核对负责。',
      constraints: '不扫描仓库，不生成新的漏洞判断，例外必须由用户明确确认。',
      evidence: '调用者提供的batch',
    },
    inputs: ['batch'],
    inputContracts: { batch: { item: batchSchema, required: true } },
    nodes,
    edges,
    outputs,
  };
}
/** One explicit user update, then delegate the batch policy to the same saved method. */
export function interactiveUpdateDefinition(
  batch: SavedMethod,
  kind: 'evidence' | 'exception',
): Definition {
  const scope =
    kind === 'exception'
      ? v('input', 'record', 'relationId')
      : v('input', 'record', 'id');
  const context = v('input', 'record', 'context');
  const remaining = filter(
    v('input', 'record', 'context', 'assessments'),
    'a',
    call('not', call('equal', v('a', 'id'), scope)),
  );
  const updated =
    kind === 'evidence'
      ? obj({
          id: scope,
          repository: v('input', 'record', 'repository'),
          requestedRef: v('input', 'record', 'requestedRef'),
          baseline: v('input', 'observedBaseline'),
          conclusion: v('input', 'conclusion'),
          disposition: yes(
            call('equal', v('input', 'conclusion'), lit('不受影响')),
            lit('excluded'),
            lit('pending'),
          ),
          reason: v('input', 'reason'),
          evidence: { kind: 'array', items: [v('input', 'evidence')] },
          confirmation: lit(''),
          changes: lit([]),
          verification: lit({ baseline: '', successor: '', evidence: [] }),
        })
      : ({
          kind: 'let',
          pattern: { kind: 'bind', name: 'matched' },
          value: filter(
            v('input', 'record', 'context', 'assessments'),
            'a',
            call('equal', v('a', 'id'), scope),
          ),
          body: obj({
            ...Object.fromEntries(
              [
                'id',
                'repository',
                'requestedRef',
                'baseline',
                'conclusion',
                'disposition',
                'reason',
                'evidence',
                'changes',
                'verification',
              ].map((field) => [field, v('matched', 0, field)]),
            ),
            confirmation: yes(
              v('input', 'confirm'),
              v('input', 'confirmationNote'),
              lit(''),
            ),
          }),
        } satisfies Expression);
  const props: Record<string, Json> =
    kind === 'evidence'
      ? {
          observedBaseline: {
            type: 'string',
            minLength: 1,
            maxLength: 128,
            title: '实际核对版本',
          },
          conclusion: {
            type: 'string',
            enum: ['不受影响', '证据不足'],
            title: '本次核查结论',
          },
          reason: {
            type: 'string',
            minLength: 1,
            maxLength: 2000,
            title: '核查说明',
          },
          evidence: {
            type: 'string',
            minLength: 1,
            maxLength: 4000,
            title: '证据位置或核对记录',
          },
        }
      : {
          confirm: {
            type: 'boolean',
            const: true,
            title: '明确确认上述范围的例外',
          },
          confirmationNote: {
            type: 'string',
            minLength: 1,
            maxLength: 4000,
            title: '确认理由与适用范围',
          },
        };
  return {
    schemaVersion: 1,
    inputs: ['records'],
    inputContracts: {
      records: {
        item: {
          type: 'object',
          required: ['record', ...Object.keys(props)],
          properties: {
            record: {
              type: 'object',
              required: ['id', 'context'],
              properties: { context: batchSchema },
            },
            ...props,
          },
        },
      },
    },
    nodes: [
      expression(
        'update',
        kind === 'evidence'
          ? '保存实际核查依据及适用版本'
          : '保存用户对所选范围的明确例外确认',
        obj({
          alerts: {
            kind: 'variable',
            name: 'input',
            path: ['record', 'context', 'alerts'],
          },
          assessments: call('concat', remaining, {
            kind: 'array',
            items: [updated],
          }),
        }),
      ),
      {
        id: 'check',
        label: '重新核对批次并汇合交付',
        kind: 'call',

        operation: 'map',
        call: {
          ...batch,
          inputNames: ['batch'],
          outputNames: ['impact', 'changes', 'audit', 'completion'],
          eachPort: 'batch',
        },
      },
    ],
    edges: [
      { from: ['$input', 'records'], to: ['update', 'input'] },
      { from: ['update', 'output'], to: ['check', 'batch'] },
    ],
    outputs: Object.fromEntries(
      ['impact', 'changes', 'audit', 'completion'].map((output) => [
        output,
        ['check', output] as [string, string],
      ]),
    ),
  };
}
export function interactiveUiProgram(
  evidence: SavedMethod,
  exception: SavedMethod,
): string {
  return mergeOpenUIProgram(
    cveUiProgram,
    `impactView = View("仓库影响", [impact, evidenceForm])
auditView = View("逐条交付", [audit, exceptionForm])
$evidenceDraft = {}
$exceptionDraft = {}
evidenceForm = InputForm("records", "补充实际核查依据", $evidenceDraft, evidenceButton, "${evidence.workId}", "${evidence.definitionId}", ["observedBaseline", "conclusion", "reason", "evidence"], "impact")
evidenceButton = ActionButton("准备所选记录的核查输入", @Run(evidenceStep))
evidenceStep = Mutation("continue_records", {output:"impact",recordIds:$impactSelection,inputPort:"records",methodId:"${evidence.workId}",methodDefinitionId:"${evidence.definitionId}",draft:$evidenceDraft,recordField:"record"})
exceptionForm = InputForm("records", "明确例外确认", $exceptionDraft, exceptionButton, "${exception.workId}", "${exception.definitionId}", ["confirm", "confirmationNote"], "audit")
exceptionButton = ActionButton("准备所选记录的例外输入", @Run(exceptionStep))
exceptionStep = Mutation("continue_records", {output:"audit",recordIds:$auditSelection,inputPort:"records",methodId:"${exception.workId}",methodDefinitionId:"${exception.definitionId}",draft:$exceptionDraft,recordField:"record"})`,
  );
}
