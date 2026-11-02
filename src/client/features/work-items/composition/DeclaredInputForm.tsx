import { FormActions } from '../../../components/ui/field';
import { Field } from '../../../components/ui/field';
import { useMemo, useState } from 'react';
import Ajv from 'ajv';
import type {
  Definition,
  Json,
  ReceivedItemInput,
  WorkItemView,
} from '../../../../shared/records';
import { Modal } from '../../../components/ui';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { NativeSelect } from '../../../components/ui/native-select';
import { errorText, portLabel } from '../../../core/format';

type Schema = Record<string, unknown>;
const object = (value: unknown): value is Schema =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export function InputFields({
  schema,
  value,
  onChange,
  prefix = '',
}: {
  schema: Schema;
  value: Json;
  onChange: (value: Json) => void;
  prefix?: string;
}) {
  if (schema.type === 'object' || object(schema.properties)) {
    const properties = object(schema.properties) ? schema.properties : {};
    const current = object(value) ? value : {};
    return (
      <>
        {Object.entries(properties).map(([key, field]) =>
          object(field) ? (
            <InputFields
              key={key}
              schema={{ ...field, title: field.title || key }}
              value={(current[key] as Json) ?? null}
              onChange={(next) => onChange({ ...current, [key]: next } as Json)}
              prefix={
                prefix
                  ? `${prefix} / ${String(field.title || key)}`
                  : String(field.title || key)
              }
            />
          ) : null,
        )}
      </>
    );
  }
  const label = String(schema.title || prefix || '输入内容');
  const choices = Array.isArray(schema.enum) ? schema.enum : undefined;
  return (
    <Field>
      {label}
      {choices ? (
        <NativeSelect
          aria-label={prefix || label}
          value={value === null ? '' : String(value)}
          onChange={(event) =>
            onChange(
              choices.find(
                (choice) => String(choice) === event.target.value,
              ) as Json,
            )
          }
        >
          <option value="">请选择</option>
          {choices.map((choice) => (
            <option key={String(choice)} value={String(choice)}>
              {String(choice)}
            </option>
          ))}
        </NativeSelect>
      ) : schema.type === 'boolean' ? (
        <NativeSelect
          aria-label={prefix || label}
          value={value === null ? '' : String(value)}
          onChange={(event) => onChange(event.target.value === 'true')}
        >
          <option value="">请选择</option>
          <option value="true">是</option>
          <option value="false">否</option>
        </NativeSelect>
      ) : schema.type === 'string' &&
        typeof schema.maxLength === 'number' &&
        schema.maxLength > 160 ? (
        <Textarea
          aria-label={prefix || label}
          rows={4}
          value={typeof value === 'string' ? value : ''}
          maxLength={schema.maxLength}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : schema.type === 'array' &&
        object(schema.items) &&
        schema.items.type === 'string' ? (
        <Textarea
          aria-label={prefix || label}
          rows={4}
          value={Array.isArray(value) ? value.join('\n') : ''}
          placeholder="每行一项"
          onChange={(event) => onChange(event.target.value.split('\n'))}
        />
      ) : (
        <Input
          aria-label={prefix || label}
          type={
            schema.type === 'number' || schema.type === 'integer'
              ? 'number'
              : 'text'
          }
          value={
            value === null || typeof value === 'object' ? '' : String(value)
          }
          onChange={(event) =>
            onChange(
              schema.type === 'number' || schema.type === 'integer'
                ? event.target.value === ''
                  ? null
                  : Number(event.target.value)
                : event.target.value,
            )
          }
        />
      )}
    </Field>
  );
}
export function DeclaredInputForm({
  item,
  definition,
  input,
  busy,
  onClose,
  onSave,
}: {
  item: WorkItemView;
  definition: Definition;
  input?: ReceivedItemInput;
  busy: boolean;
  onClose: () => void;
  onSave: (fields: Record<string, unknown>) => Promise<unknown>;
}) {
  const [baseRevision] = useState(item.revision);
  const [formDefinition] = useState(definition);
  const selectedPort = Object.entries(item.inputBindings || {}).find(
    ([, selections]) =>
      selections.some(
        (selection) =>
          selection.kind === 'received' && selection.inputId === input?.id,
      ),
  )?.[0];
  const [port, setPort] = useState(selectedPort || definition.inputs[0] || '');
  const [value, setValue] = useState<Json>(input?.value ?? {});
  const [error, setError] = useState('');
  const schema = formDefinition.inputContracts?.[port]?.item;
  const check = useMemo(() => {
    try {
      return schema
        ? new Ajv({ allErrors: true, strict: false }).compile(schema)
        : undefined;
    } catch {
      return undefined;
    }
  }, [schema]);
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={input ? '修改本轮输入' : '补充结构化输入'}
      className="composition-input-dialog"
    >
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          setError('');
          if (check && !check(value)) {
            setError(
              (check.errors || [])
                .map(
                  (issue) => `${issue.instancePath || '输入'} ${issue.message}`,
                )
                .join('；'),
            );
            return;
          }
          void onSave({
            baseRevision,
            inputPort: port,
            label: input?.label || String(schema?.title || portLabel(port)),
            value,
            ...(input ? { inputId: input.id } : {}),
          })
            .then(onClose)
            .catch((reason) => setError(errorText(reason)));
        }}
      >
        <Field>
          输入用途
          <NativeSelect
            value={port}
            disabled={!!input}
            onChange={(event) => {
              setPort(event.target.value);
              setValue({});
            }}
          >
            {definition.inputs.map((name) => (
              <option key={name} value={name}>
                {portLabel(name)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {schema ? (
          <InputFields schema={schema} value={value} onChange={setValue} />
        ) : (
          <Field>
            输入内容
            <Textarea
              aria-label="输入内容"
              value={typeof value === 'string' ? value : ''}
              onChange={(event) => setValue(event.target.value)}
              rows={5}
            />
          </Field>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <FormActions>
          <Button variant="outline" type="button" onClick={onClose}>
            取消
          </Button>
          <Button variant="default" disabled={busy}>
            保存本轮输入
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}
