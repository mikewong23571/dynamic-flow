import type {
  Definition,
  FlowNode,
  Json,
} from '../../../src/shared/records.ts';
import type {
  Expression,
  PureFunction,
} from '../../../src/shared/expressions.ts';

// This is a business recipe over supplied judgments, never a vulnerability detector.
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
const and = (...args: Expression[]) => args.reduce((a, b) => call('and', a, b));
const nonempty = (value: Expression) =>
  call('greaterThan', call('length', value), lit(0));
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
const text = { type: 'string', minLength: 1 };
const texts = { type: 'array', items: text };
export const alertSchema = {
  type: 'object',
  required: [
    'id',
    'relationId',
    'repository',
    'requestedRef',
    'baseline',
    'cve',
  ],
  properties: Object.fromEntries(
    ['id', 'relationId', 'repository', 'requestedRef', 'baseline', 'cve'].map(
      (k) => [k, text],
    ),
  ),
} satisfies Json;
export const assessmentSchema = {
  type: 'object',
  required: [
    'id',
    'repository',
    'requestedRef',
    'baseline',
    'conclusion',
    'disposition',
    'reason',
    'evidence',
    'confirmation',
    'changes',
    'verification',
  ],
  properties: {
    ...Object.fromEntries(
      ['id', 'repository', 'requestedRef', 'baseline', 'reason'].map((k) => [
        k,
        text,
      ]),
    ),
    conclusion: { enum: ['受影响', '不受影响', '证据不足'] },
    disposition: { enum: ['fixed', 'excluded', 'exception', 'pending'] },
    evidence: texts,
    confirmation: { type: 'string' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'id',
          'repository',
          'requestedRef',
          'description',
          'dependsOn',
        ],
        properties: {
          ...Object.fromEntries(
            ['id', 'repository', 'requestedRef', 'description'].map((k) => [
              k,
              text,
            ]),
          ),
          dependsOn: texts,
        },
      },
    },
    verification: {
      type: 'object',
      required: ['baseline', 'successor', 'evidence'],
      properties: {
        baseline: { type: 'string' },
        successor: { type: 'string' },
        evidence: texts,
      },
    },
  },
} satisfies Json;

const scopeMatched = and(
  ...['repository', 'requestedRef', 'baseline'].map((k) =>
    call('equal', v('a', k), v('input', 'left', k)),
  ),
);
const accepted = and(
  v('scopeMatched'),
  nonempty(v('a', 'evidence')),
  yes(
    call('equal', v('a', 'disposition'), lit('fixed')),
    and(
      call('equal', v('a', 'conclusion'), lit('受影响')),
      nonempty(v('a', 'changes')),
      call(
        'equal',
        v('a', 'verification', 'baseline'),
        v('input', 'left', 'baseline'),
      ),
      nonempty(v('a', 'verification', 'successor')),
      nonempty(v('a', 'verification', 'evidence')),
    ),
    yes(
      call('equal', v('a', 'disposition'), lit('excluded')),
      call('equal', v('a', 'conclusion'), lit('不受影响')),
      and(
        call('equal', v('a', 'disposition'), lit('exception')),
        nonempty(v('a', 'confirmation')),
      ),
    ),
  ),
);
const missing: Json = {
  repository: '',
  requestedRef: '',
  baseline: '',
  conclusion: '证据不足',
  disposition: 'pending',
  reason: '尚无本范围的判断材料',
  evidence: [],
  confirmation: '',
  changes: [],
  verification: { baseline: '', successor: '', evidence: [] },
};

/** Pure integration of explicit assessments. All safety judgments and evidence are inputs. */
export const assessmentMethod: Definition = {
  schemaVersion: 1,
  inputs: ['input'],
  inputContracts: {
    input: {
      required: true,
      item: {
        type: 'object',
        required: ['left', 'right'],
        properties: {
          left: {
            type: 'object',
            required: [
              'id',
              'repository',
              'requestedRef',
              'baseline',
              'cve',
              'alertIds',
            ],
            properties: {
              ...Object.fromEntries(
                ['id', 'repository', 'requestedRef', 'baseline', 'cve'].map(
                  (k) => [k, text],
                ),
              ),
              alertIds: texts,
            },
          },
          right: { anyOf: [assessmentSchema, { type: 'null' }] },
        },
      },
    },
  },
  nodes: [
    expression('integrate', '核对已提供判断的范围与交付依据', {
      kind: 'let',
      pattern: { kind: 'bind', name: 'a' },
      value: yes(
        call('equal', v('input', 'right'), lit(null)),
        lit(missing),
        v('input', 'right'),
      ),
      body: {
        kind: 'let',
        pattern: { kind: 'bind', name: 'scopeMatched' },
        value: scopeMatched,
        body: obj({
          ...Object.fromEntries(
            [
              'id',
              'repository',
              'requestedRef',
              'baseline',
              'cve',
              'alertIds',
            ].map((k) => [k, v('input', 'left', k)]),
          ),
          scopeMatched: v('scopeMatched'),
          conclusion: yes(
            v('scopeMatched'),
            v('a', 'conclusion'),
            lit('证据不足'),
          ),
          disposition: yes(
            v('scopeMatched'),
            v('a', 'disposition'),
            lit('pending'),
          ),
          reason: v('a', 'reason'),
          evidence: v('a', 'evidence'),
          confirmation: v('a', 'confirmation'),
          verification: v('a', 'verification'),
          changes: yes(v('scopeMatched'), v('a', 'changes'), lit([])),
          accepted,
        }),
      },
    }),
  ],
  edges: [{ from: ['$input', 'input'], to: ['integrate', 'input'] }],
  outputs: { relations: ['integrate', 'output'] },
};

/** Bind only a saved public method version; no work item or original batch identity is embedded. */
export function compositionDefinition(method: {
  workId: string;
  definitionId: string;
}): Definition {
  return {
    schemaVersion: 1,
    inputs: ['alerts', 'assessments'],
    inputContracts: {
      alerts: { item: alertSchema, required: true },
      assessments: { item: assessmentSchema },
    },
    nodes: [
      {
        id: 'unique',
        label: '按调查范围归组，保留原告警',
        kind: 'function',

        operation: 'aggregate',
        functionName: 'groupBy',
        groupBy: {
          keys: [
            ['relationId'],
            ['repository'],
            ['requestedRef'],
            ['baseline'],
            ['cve'],
          ],
        },
      },
      expression(
        'scope',
        '形成调查对象',
        obj({
          id: v('input', 'key', 0),
          repository: v('input', 'key', 1),
          requestedRef: v('input', 'key', 2),
          baseline: v('input', 'key', 3),
          cve: v('input', 'key', 4),
          alertIds: map(v('input', 'items'), 'alert', v('alert', 'id')),
        }),
      ),
      {
        id: 'attach',
        label: '关联判断，保留未匹配范围',
        kind: 'function',

        operation: 'aggregate',
        functionName: 'join',
        join: {
          type: 'left',
          leftKey: ['id'],
          rightKey: ['id'],
          duplicates: 'error',
        },
      },
      {
        id: 'assess',
        label: '逐范围核对判断与依据',
        kind: 'call',

        operation: 'map',
        call: {
          ...method,
          inputNames: ['input'],
          outputNames: ['relations'],
          eachPort: 'input',
        },
      },
      expression(
        'expandChanges',
        '展开实施仓库与覆盖关系',
        map(
          v('input', 'changes'),
          'change',
          obj({
            change: v('change'),
            relationId: v('input', 'id'),
            cve: v('input', 'cve'),
            affectedRepository: v('input', 'repository'),
            baseline: v('input', 'baseline'),
            verification: v('input', 'verification'),
          }),
        ),
        'flatMap',
      ),
      {
        id: 'groupChanges',
        label: '按实施仓库、ref与方案归并',
        kind: 'function',

        operation: 'aggregate',
        functionName: 'groupBy',
        groupBy: {
          keys: [
            ['change', 'repository'],
            ['change', 'requestedRef'],
            ['change', 'id'],
          ],
        },
      },
      expression(
        'changes',
        '形成改动安排',
        obj({
          id: call(
            'concat',
            call(
              'concat',
              call('concat', v('input', 'key', 0), lit('@')),
              v('input', 'key', 1),
            ),
            call('concat', lit(':'), v('input', 'key', 2)),
          ),
          repository: v('input', 'key', 0),
          requestedRef: v('input', 'key', 1),
          changeId: v('input', 'key', 2),
          description: v('input', 'items', 0, 'change', 'description'),
          dependsOn: v('input', 'items', 0, 'change', 'dependsOn'),
          coverage: map(
            v('input', 'items'),
            'item',
            obj({
              relationId: v('item', 'relationId'),
              cve: v('item', 'cve'),
              repository: v('item', 'affectedRepository'),
              baseline: v('item', 'baseline'),
              verification: v('item', 'verification'),
            }),
          ),
        }),
      ),
      expression(
        'audit',
        '逐条返回原告警，包括重复与未决',
        map(
          v('input', 'alertIds'),
          'alertId',
          obj({
            id: v('alertId'),
            relationId: v('input', 'id'),
            ...Object.fromEntries(
              [
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
              ].map((k) => [k, v('input', k)]),
            ),
          }),
        ),
        'flatMap',
      ),
      expression(
        'completion',
        '列出覆盖和未决，等待用户验收',
        obj({
          originalAlertCount: call('length', v('input')),
          unresolvedAlertIds: map(
            {
              kind: 'filter',
              input: v('input'),
              binding: { kind: 'bind', name: 'row' },
              predicate: call('not', v('row', 'accepted')),
            },
            'row',
            v('row', 'id'),
          ),
          acceptedCount: {
            kind: 'reduce',
            input: v('input'),
            initial: lit(0),
            accumulator: 'count',
            binding: { kind: 'bind', name: 'row' },
            body: call(
              'add',
              v('count'),
              yes(v('row', 'accepted'), lit(1), lit(0)),
            ),
          },
        }),
        'aggregate',
      ),
    ],
    edges: [
      { from: ['$input', 'alerts'], to: ['unique', 'input'] },
      { from: ['unique', 'output'], to: ['scope', 'input'] },
      { from: ['scope', 'output'], to: ['attach', 'left'] },
      { from: ['$input', 'assessments'], to: ['attach', 'right'] },
      { from: ['attach', 'output'], to: ['assess', 'input'] },
      { from: ['assess', 'relations'], to: ['expandChanges', 'input'] },
      { from: ['expandChanges', 'output'], to: ['groupChanges', 'input'] },
      { from: ['groupChanges', 'output'], to: ['changes', 'input'] },
      { from: ['assess', 'relations'], to: ['audit', 'input'] },
      { from: ['audit', 'output'], to: ['completion', 'input'] },
    ],
    outputs: {
      impact: ['assess', 'relations'],
      changes: ['changes', 'output'],
      audit: ['audit', 'output'],
      completion: ['completion', 'output'],
    },
  };
}

export const cveUiProgram = `root = Workspace("核查交付", [navigation])
navigation = ViewNavigation("tabs", [impactView, changesView, auditView, completionView])
impactView = View("仓库影响", [impact])
impact = Records("impact", "仓库影响", "id", [Field("repository", "对象仓库"), Field("requestedRef", "分支"), Field("cve", "问题"), Field("conclusion", "判断"), Field("accepted", "依据齐备")], $impactSelection)
$impactSelection = []
changesView = View("改动安排", [changes])
changes = Records("changes", "改动安排", "id", [Field("repository", "实施仓库"), Field("description", "改动"), Field("coverage", "覆盖和验证"), Field("dependsOn", "依赖")], $changeSelection)
$changeSelection = []
auditView = View("逐条交付", [audit])
audit = Records("audit", "逐条告警交付", "id", [Field("id", "原告警"), Field("repository", "仓库"), Field("disposition", "处置"), Field("accepted", "依据齐备")], $auditSelection)
$auditSelection = []
completionView = View("验收缺口", [completion])
completion = Report("completion", "验收缺口")`;

export const completionCriteria = [
  '每条原告警的全部纳入关系均有适用本范围的修复验证、排除证据或明确例外确认；未决清单为空',
  '必要改动的实际后继交付与原基线逐一对应，跨仓库依赖已经验证',
  '用户核对固定交付和依据后明确确认本批验收',
];
