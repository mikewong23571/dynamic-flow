import type { Expression, PureFunction } from '../shared/expressions';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import {
  Field,
  Choice,
  Remove,
  LiteralEditor,
  FieldName,
} from './ExpressionFields';
import { PatternEditor } from './PatternEditor';
import {
  expressionNames,
  patternNames,
  functionNames,
  newExpression,
  expressionSummary,
  nextField,
  renameField,
  variable,
} from './expression-model';
import './ExpressionEditor.css';
export function ExpressionEditor({
  value,
  onChange,
  label = '数据变换',
  depth = 0,
}: {
  value: Expression;
  onChange: (value: Expression) => void;
  label?: string;
  depth?: number;
}) {
  const child = (
    name: string,
    expression: Expression,
    save: (next: Expression) => void,
  ) => (
    <ExpressionEditor
      label={name}
      value={expression}
      depth={depth + 1}
      onChange={save}
    />
  );
  return (
    <details className="expression-block" open={depth < 1}>
      <summary>
        <span>{label}</span>
        <small>{expressionSummary(value)}</small>
      </summary>
      <div className="expression-body">
        <Choice
          label="表达式类型"
          value={value.kind}
          options={expressionNames}
          onChange={(kind) => onChange(newExpression(kind))}
        />
        {value.kind === 'literal' && (
          <LiteralEditor
            key={value.kind}
            value={value.value}
            onChange={(next) => onChange({ ...value, value: next })}
          />
        )}
        {value.kind === 'variable' && (
          <>
            <Field label="变量名">
              <Input
                value={value.name}
                onChange={(event) =>
                  onChange({ ...value, name: event.target.value })
                }
              />
            </Field>
            {(value.path || []).map((part, index) => (
              <div className="expression-entry-header" key={index}>
                <Field label={`路径 ${index + 1}`}>
                  <Input
                    value={String(part)}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        path: value.path!.map((item, i) =>
                          i === index ? event.target.value : item,
                        ),
                      })
                    }
                  />
                </Field>
                <Remove
                  label={`移除路径 ${index + 1}`}
                  onClick={() =>
                    onChange({
                      ...value,
                      path: value.path!.filter((_, i) => i !== index),
                    })
                  }
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onChange({ ...value, path: [...(value.path || []), 'field'] })
              }
            >
              读取字段或索引
            </Button>
          </>
        )}
        {value.kind === 'object' && (
          <>
            {Object.entries(value.fields).map(([name, expression], index) => (
              <div className="expression-entry" key={index}>
                <div className="expression-entry-header">
                  <FieldName
                    name={name}
                    names={Object.keys(value.fields)}
                    onChange={(next) =>
                      onChange({
                        ...value,
                        fields: renameField(value.fields, name, next),
                      })
                    }
                  />
                  <Remove
                    label={`移除输出字段 ${name}`}
                    onClick={() =>
                      onChange({
                        ...value,
                        fields: Object.fromEntries(
                          Object.entries(value.fields).filter(
                            ([key]) => key !== name,
                          ),
                        ),
                      })
                    }
                  />
                </div>
                {child(`字段 ${name}`, expression, (next) =>
                  onChange({
                    ...value,
                    fields: { ...value.fields, [name]: next },
                  }),
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onChange({
                  ...value,
                  fields: {
                    ...value.fields,
                    [nextField(value.fields)]: variable(),
                  },
                })
              }
            >
              添加输出字段
            </Button>
          </>
        )}
        {(value.kind === 'array' || value.kind === 'call') && (
          <>
            {value.kind === 'call' && (
              <Choice
                label="运算"
                value={value.function}
                options={functionNames}
                onChange={(fn: PureFunction) =>
                  onChange({
                    ...value,
                    function: fn,
                    args:
                      fn === 'not' || fn === 'length'
                        ? value.args.slice(0, 1)
                        : value.args.length < 2
                          ? [...value.args, newExpression('literal')]
                          : value.args,
                  })
                }
              />
            )}
            {(value.kind === 'array' ? value.items : value.args).map(
              (expression, index) => (
                <div className="expression-entry" key={index}>
                  {child(
                    `${value.kind === 'array' ? '数组项' : '参数'} ${index + 1}`,
                    expression,
                    (next) => {
                      const items = (
                        value.kind === 'array' ? value.items : value.args
                      ).map((item, i) => (i === index ? next : item));
                      onChange(
                        value.kind === 'array'
                          ? { ...value, items }
                          : { ...value, args: items },
                      );
                    },
                  )}
                  <Remove
                    label={`移除项 ${index + 1}`}
                    onClick={() => {
                      const items = (
                        value.kind === 'array' ? value.items : value.args
                      ).filter((_, i) => i !== index);
                      onChange(
                        value.kind === 'array'
                          ? { ...value, items }
                          : { ...value, args: items },
                      );
                    }}
                  />
                </div>
              ),
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onChange(
                  value.kind === 'array'
                    ? { ...value, items: [...value.items, variable()] }
                    : { ...value, args: [...value.args, variable()] },
                )
              }
            >
              添加{value.kind === 'array' ? '数组项' : '参数'}
            </Button>
          </>
        )}
        {'input' in value &&
          child('输入值', value.input, (input) =>
            onChange({ ...value, input }),
          )}
        {value.kind === 'pipe' && (
          <>
            <p className="expression-hint">每步用 value 读取上一步结果。</p>
            {value.steps.map((step, index) => (
              <div className="expression-entry" key={index}>
                {child(`步骤 ${index + 1}`, step, (next) =>
                  onChange({
                    ...value,
                    steps: value.steps.map((item, i) =>
                      i === index ? next : item,
                    ),
                  }),
                )}
                <div className="expression-actions">
                  {index > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const steps = [...value.steps];
                        [steps[index - 1], steps[index]] = [
                          steps[index],
                          steps[index - 1],
                        ];
                        onChange({ ...value, steps });
                      }}
                    >
                      上移步骤 {index + 1}
                    </Button>
                  )}
                  <Remove
                    label={`移除步骤 ${index + 1}`}
                    onClick={() =>
                      onChange({
                        ...value,
                        steps: value.steps.filter((_, i) => i !== index),
                      })
                    }
                  />
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onChange({
                  ...value,
                  steps: [...value.steps, variable('value')],
                })
              }
            >
              添加组合步骤
            </Button>
          </>
        )}
        {'binding' in value && (
          <PatternEditor
            value={value.binding}
            label="逐项解构"
            depth={depth + 1}
            onChange={(binding) => onChange({ ...value, binding })}
          />
        )}
        {value.kind === 'reduce' && (
          <>
            <Field label="累积变量名">
              <Input
                value={value.accumulator}
                onChange={(event) =>
                  onChange({ ...value, accumulator: event.target.value })
                }
              />
            </Field>
            {child('归约初值', value.initial, (initial) =>
              onChange({ ...value, initial }),
            )}
          </>
        )}
        {value.kind === 'filter' &&
          child('筛选条件（布尔）', value.predicate, (predicate) =>
            onChange({ ...value, predicate }),
          )}
        {'body' in value &&
          child('返回值', value.body, (body) => onChange({ ...value, body }))}
        {(value.kind === 'let' || value.kind === 'match') &&
          child('待匹配值', value.value, (next) =>
            onChange({ ...value, value: next }),
          )}
        {value.kind === 'let' && (
          <PatternEditor
            label="解构规则"
            value={value.pattern}
            depth={depth + 1}
            onChange={(pattern) => onChange({ ...value, pattern })}
          />
        )}
        {value.kind === 'match' && (
          <>
            {value.cases.map((entry, index) => (
              <details className="expression-entry expression-case" key={index}>
                <summary>
                  分支 {index + 1} · {patternNames[entry.pattern.kind]}
                </summary>
                <PatternEditor
                  value={entry.pattern}
                  depth={depth + 1}
                  onChange={(pattern) =>
                    onChange({
                      ...value,
                      cases: value.cases.map((item, i) =>
                        i === index ? { ...entry, pattern } : item,
                      ),
                    })
                  }
                />
                {entry.when &&
                  child('守卫（布尔）', entry.when, (when) =>
                    onChange({
                      ...value,
                      cases: value.cases.map((item, i) =>
                        i === index ? { ...entry, when } : item,
                      ),
                    }),
                  )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onChange({
                      ...value,
                      cases: value.cases.map((item, i) =>
                        i === index
                          ? {
                              ...entry,
                              when: entry.when
                                ? undefined
                                : { kind: 'literal', value: true },
                            }
                          : item,
                      ),
                    })
                  }
                >
                  {entry.when ? '移除守卫' : '添加守卫'}
                </Button>
                {child('匹配后返回', entry.then, (then) =>
                  onChange({
                    ...value,
                    cases: value.cases.map((item, i) =>
                      i === index ? { ...entry, then } : item,
                    ),
                  }),
                )}
                <div className="expression-actions">
                  {index > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const cases = [...value.cases];
                        [cases[index - 1], cases[index]] = [
                          cases[index],
                          cases[index - 1],
                        ];
                        onChange({ ...value, cases });
                      }}
                    >
                      上移分支 {index + 1}
                    </Button>
                  )}
                  <Remove
                    label={`移除分支 ${index + 1}`}
                    onClick={() =>
                      onChange({
                        ...value,
                        cases: value.cases.filter((_, i) => i !== index),
                      })
                    }
                  />
                </div>
              </details>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onChange({
                  ...value,
                  cases: [
                    ...value.cases,
                    { pattern: { kind: 'wildcard' }, then: variable() },
                  ],
                })
              }
            >
              添加匹配分支
            </Button>
            {value.otherwise &&
              child('未匹配时返回', value.otherwise, (otherwise) =>
                onChange({ ...value, otherwise }),
              )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange({
                  ...value,
                  otherwise: value.otherwise
                    ? undefined
                    : newExpression('literal'),
                })
              }
            >
              {value.otherwise ? '移除兜底（未匹配时报错）' : '添加兜底'}
            </Button>
          </>
        )}
      </div>
    </details>
  );
}
