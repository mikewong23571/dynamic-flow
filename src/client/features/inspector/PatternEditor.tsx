import type { Pattern } from '../../../shared/expressions';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Field,
  Choice,
  Remove,
  LiteralEditor,
  FieldName,
} from './ExpressionFields';
import {
  patternNames,
  newPattern,
  nextField,
  renameField,
} from './expression-model';
export function PatternEditor({
  value,
  onChange,
  label = '匹配规则',
  depth = 0,
}: {
  value: Pattern;
  onChange: (value: Pattern) => void;
  label?: string;
  depth?: number;
}) {
  return (
    <details className="expression-block" open={depth < 1}>
      <summary>
        <span>{label}</span>
        <small>{patternNames[value.kind]}</small>
      </summary>
      <div className="expression-body">
        <Choice
          label="规则类型"
          value={value.kind}
          options={patternNames}
          onChange={(kind) => onChange(newPattern(kind))}
        />
        {value.kind === 'bind' && (
          <Field label="绑定变量名">
            <Input
              value={value.name}
              onChange={(event) =>
                onChange({ ...value, name: event.target.value })
              }
            />
          </Field>
        )}
        {value.kind === 'literal' && (
          <LiteralEditor
            value={value.value}
            onChange={(next) => onChange({ ...value, value: next })}
          />
        )}
        {value.kind === 'type' && (
          <>
            <Choice
              label="匹配类型"
              value={value.valueType}
              options={{
                string: '文本',
                number: '数字',
                boolean: '布尔',
                null: '空值',
                array: '数组',
                object: '对象',
              }}
              onChange={(valueType) => onChange({ ...value, valueType })}
            />
            <Field label="绑定变量名（可选）">
              <Input
                value={value.name || ''}
                onChange={(event) =>
                  onChange({ ...value, name: event.target.value || undefined })
                }
              />
            </Field>
          </>
        )}
        {value.kind === 'object' && (
          <>
            {Object.entries(value.fields).map(([name, child], index) => (
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
                    label={`移除匹配字段 ${name}`}
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
                <PatternEditor
                  label={`字段 ${name}`}
                  value={child}
                  depth={depth + 1}
                  onChange={(next) =>
                    onChange({
                      ...value,
                      fields: { ...value.fields, [name]: next },
                    })
                  }
                />
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
                    [nextField(value.fields)]: { kind: 'wildcard' },
                  },
                })
              }
            >
              添加匹配字段
            </Button>
          </>
        )}
        {value.kind === 'array' && (
          <>
            {value.items.map((child, index) => (
              <div className="expression-entry" key={index}>
                <PatternEditor
                  label={`第 ${index + 1} 项`}
                  value={child}
                  depth={depth + 1}
                  onChange={(next) =>
                    onChange({
                      ...value,
                      items: value.items.map((item, i) =>
                        i === index ? next : item,
                      ),
                    })
                  }
                />
                <Remove
                  label={`移除匹配项 ${index + 1}`}
                  onClick={() =>
                    onChange({
                      ...value,
                      items: value.items.filter((_, i) => i !== index),
                    })
                  }
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onChange({
                  ...value,
                  items: [...value.items, { kind: 'wildcard' }],
                })
              }
            >
              添加匹配项
            </Button>
          </>
        )}
        {(value.kind === 'array' || value.kind === 'object') && (
          <Field label="剩余部分绑定（可选）">
            <Input
              value={value.rest || ''}
              placeholder="rest"
              onChange={(event) =>
                onChange({ ...value, rest: event.target.value || undefined })
              }
            />
          </Field>
        )}
      </div>
    </details>
  );
}
