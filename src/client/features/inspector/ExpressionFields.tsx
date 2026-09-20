import { useEffect, useState, type ReactNode } from 'react';
import type { Json } from '../../../shared/records';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { NativeSelect } from '../../components/ui/native-select';
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="expression-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label}>
      <NativeSelect
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {Object.entries<string>(options).map(([key, name]) => (
          <option key={key} value={key}>
            {name}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}
export function Remove({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button variant="ghost" size="sm" aria-label={label} onClick={onClick}>
      移除
    </Button>
  );
}
export function LiteralEditor({
  value,
  onChange,
}: {
  value: Json;
  onChange: (value: Json) => void;
}) {
  const type: 'null' | 'array' | 'object' | 'string' | 'number' | 'boolean' =
    value === null
      ? 'null'
      : Array.isArray(value)
        ? 'array'
        : (typeof value as 'object' | 'string' | 'number' | 'boolean');
  const [invalid, setInvalid] = useState(false);
  const [raw, setRaw] = useState<string>();
  return (
    <div>
      <Choice
        label="常量类型"
        value={type}
        options={{
          string: '文本',
          number: '数字',
          boolean: '布尔',
          null: '空值',
          object: '对象常量',
          array: '数组常量',
        }}
        onChange={(kind) => {
          setRaw(undefined);
          setInvalid(false);
          onChange(
            kind === 'number'
              ? 0
              : kind === 'boolean'
                ? true
                : kind === 'null'
                  ? null
                  : kind === 'array'
                    ? []
                    : kind === 'object'
                      ? {}
                      : '',
          );
        }}
      />
      {type === 'string' && (
        <Field label="常量值">
          <Input
            value={String(value)}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      )}
      {type === 'number' && (
        <Field label="常量值">
          <Input
            inputMode="decimal"
            value={raw ?? String(value)}
            aria-invalid={invalid}
            onChange={(event) => {
              setRaw(event.target.value);
              const parsed = Number(event.target.value);
              const bad =
                !event.target.value.trim() || !Number.isFinite(parsed);
              setInvalid(bad);
              if (!bad) onChange(parsed);
            }}
          />
        </Field>
      )}
      {type === 'boolean' && (
        <Choice
          label="常量值"
          value={String(value)}
          options={{ true: '真', false: '假' }}
          onChange={(next) => onChange(next === 'true')}
        />
      )}
      {(type === 'object' || type === 'array') && (
        <Field label="JSON 常量">
          <Textarea
            rows={3}
            value={raw ?? JSON.stringify(value)}
            aria-invalid={invalid}
            onChange={(event) => {
              setRaw(event.target.value);
              try {
                const next = JSON.parse(event.target.value);
                if (
                  type === 'array'
                    ? !Array.isArray(next)
                    : next === null ||
                      typeof next !== 'object' ||
                      Array.isArray(next)
                )
                  throw Error();
                setInvalid(false);
                onChange(next);
              } catch {
                setInvalid(true);
              }
            }}
          />
        </Field>
      )}
      {invalid && (
        <p role="alert" className="inline-error">
          值格式无效，尚未应用
        </p>
      )}
    </div>
  );
}
export function FieldName({
  name,
  names,
  onChange,
}: {
  name: string;
  names: string[];
  onChange: (name: string) => void;
}) {
  const [raw, setRaw] = useState<string>();
  useEffect(() => setRaw(undefined), [name]);
  const invalid =
    raw !== undefined && (!raw.trim() || (raw !== name && names.includes(raw)));
  return (
    <Field label="字段名">
      <Input
        value={raw ?? name}
        aria-invalid={invalid}
        onChange={(event) => {
          const next = event.target.value;
          setRaw(next);
          if (next.trim() && (next === name || !names.includes(next)))
            onChange(next);
        }}
      />
      {invalid && <small role="alert">字段名不能为空或重复</small>}
    </Field>
  );
}
