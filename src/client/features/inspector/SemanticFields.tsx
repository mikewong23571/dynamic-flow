import type { Definition, FlowNode } from '../../../shared/records';
import { ExpressionEditor } from './ExpressionEditor';
import { Button } from '../../components/ui';
const problemLabels = {
  framing: '当前问题',
  known: '已知事实',
  unknown: '仍待确认',
  constraints: '约束',
  evidence: '依据与来源',
} as const;
export function ProblemEditor({
  definition,
  onChange,
}: {
  definition: Definition;
  onChange: (d: Definition) => void;
}) {
  const problem = definition.problem ?? {
    framing: '',
    known: '',
    unknown: '',
    constraints: '',
    evidence: '',
  };
  return (
    <div className="inspector scroll">
      <div className="section-heading">
        <h2>问题与依据</h2>
      </div>
      {Object.entries(problemLabels).map(([key, label]) => (
        <label className="field" key={key}>
          {label}
          <textarea
            rows={key === 'framing' ? 3 : 2}
            value={problem[key as keyof typeof problem]}
            onChange={(e) =>
              onChange({
                ...definition,
                problem: { ...problem, [key]: e.target.value },
              })
            }
          />
        </label>
      ))}
    </div>
  );
}
export function SemanticFields({
  node,
  update,
}: {
  node: FlowNode;
  update: (patch: Partial<FlowNode>) => void;
}) {
  const contract = node.contract ?? {
    responsibility: '',
    done: '',
    rationale: '',
    semanticRole: '',
  };
  return (
    <>
      <details className="details" open={!!node.contract}>
        <summary>职责与依据</summary>
        {(
          [
            ['responsibility', '具体职责'],
            ['done', '完成条件'],
            ['rationale', '为什么这样组织'],
            ['semanticRole', '同类对象角色'],
          ] as const
        ).map(([key, label]) => (
          <label className="field" key={key}>
            {label}
            <textarea
              rows={2}
              value={contract[key] ?? ''}
              onChange={(e) =>
                update({ contract: { ...contract, [key]: e.target.value } })
              }
            />
          </label>
        ))}
      </details>
      {node.kind === 'dynamic' && (
        <>
          <label className="field">
            局部目标
            <textarea
              rows={4}
              value={node.task ?? ''}
              onChange={(e) => update({ task: e.target.value })}
            />
          </label>
          <label className="field">
            展开边界
            <textarea
              rows={3}
              value={node.dynamic?.boundary ?? ''}
              onChange={(e) =>
                update({
                  dynamic: {
                    maxNodes: node.dynamic?.maxNodes ?? 5,
                    boundary: e.target.value,
                  },
                })
              }
            />
          </label>
          <label className="field">
            最多生成步骤
            <input
              type="number"
              min={1}
              max={20}
              value={node.dynamic?.maxNodes ?? 5}
              onChange={(e) =>
                update({
                  dynamic: {
                    boundary: node.dynamic?.boundary ?? '',
                    maxNodes: Number(e.target.value),
                  },
                })
              }
            />
          </label>
        </>
      )}
      {['agent', 'function'].includes(node.kind) &&
        !['merge', 'collect', 'join'].includes(node.functionName ?? '') && (
          <details className="details" open={!!node.repeat}>
            <summary>有限迭代</summary>
            <label className="check-row">
              <input
                type="checkbox"
                checked={!!node.repeat}
                onChange={(e) =>
                  update({
                    repeat: e.target.checked ? { max: 3 } : undefined,
                    ...(e.target.checked
                      ? { operation: 'map', mode: 'each' }
                      : {}),
                  })
                }
              />
              重复改善此步骤
            </label>
            {node.repeat && (
              <>
                <label className="field">
                  最多轮次
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={node.repeat.max}
                    onChange={(e) =>
                      update({
                        repeat: {
                          ...node.repeat!,
                          max: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
                <p className="muted">
                  每轮输出作为下一轮输入；有停止条件时，达到上限仍未满足会报告未完成。
                </p>
                {node.repeat.until ? (
                  <>
                    <ExpressionEditor
                      value={node.repeat.until}
                      onChange={(until) =>
                        update({ repeat: { ...node.repeat!, until } })
                      }
                    />
                    <Button
                      variant="ghost"
                      onClick={() =>
                        update({ repeat: { max: node.repeat!.max } })
                      }
                    >
                      改为固定轮次
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() =>
                      update({
                        repeat: {
                          ...node.repeat!,
                          until: { kind: 'literal', value: false },
                        },
                      })
                    }
                  >
                    添加停止条件
                  </Button>
                )}
              </>
            )}
          </details>
        )}
    </>
  );
}
