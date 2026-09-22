import { useEffect, useState } from 'react';
import { Play, Plus, ShieldOff, X } from 'lucide-react';
import type { Definition } from '../../../shared/records';
import {
  buildInvokeFields,
  parseInvokeInputs,
  type InvokeField,
} from '../../core/invoke-form';
import { errorCode, errorText } from '../../core/format';
import { Button, Modal } from '../../components/ui';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '../../components/ui/native-select';

function blankEntries(fields: InvokeField[]): Record<string, string[]> {
  return Object.fromEntries(
    fields.map((field) => [
      field.port,
      [field.kind === 'boolean' ? 'true' : ''],
    ]),
  );
}

function EntryControl({
  field,
  value,
  onChange,
}: {
  field: InvokeField;
  value: string;
  onChange: (text: string) => void;
}) {
  const label = `端口 ${field.port} 的输入`;
  if (field.kind === 'boolean')
    return (
      <NativeSelect
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <NativeSelectOption value="true">是</NativeSelectOption>
        <NativeSelectOption value="false">否</NativeSelectOption>
      </NativeSelect>
    );
  if (field.kind === 'json')
    return (
      <Textarea
        aria-label={label}
        rows={2}
        placeholder='JSON，例如 {"id": 1}'
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  return (
    <Input
      aria-label={label}
      inputMode={field.kind === 'number' ? 'decimal' : undefined}
      placeholder={field.kind === 'number' ? '数字' : '文本'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** 直接输入调用：按定义的输入端口与契约生成表单，裸值提交 invoke；违约显式豁免留痕。 */
export function InvokeDialog({
  open,
  onOpenChange,
  definition,
  invokeWork,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definition: Definition;
  invokeWork: (
    inputs: Record<string, unknown[]>,
    loose: boolean,
  ) => Promise<{ status: string }>;
}) {
  const fields = buildInvokeFields(definition);
  const hasFileSource = definition.nodes.some((n) => n.kind === 'file');
  const [raw, setRaw] = useState<Record<string, string[]>>(() =>
    blankEntries(fields),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [contractBlocked, setContractBlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    // 仅在打开时按当前定义重置表单；打开期间快照刷新不清空已填内容
    if (open) {
      setRaw(blankEntries(buildInvokeFields(definition)));
      setErrors([]);
      setContractBlocked(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function setEntry(port: string, index: number, text: string) {
    setRaw((prev) => ({
      ...prev,
      [port]: prev[port].map((entry, i) => (i === index ? text : entry)),
    }));
  }

  async function submit(loose: boolean) {
    setErrors([]);
    setContractBlocked(false);
    const parsed = parseInvokeInputs(fields, raw);
    if ('errors' in parsed) {
      setErrors(parsed.errors);
      return;
    }
    setSubmitting(true);
    try {
      await invokeWork(parsed.inputs, loose);
      onOpenChange(false);
    } catch (reason) {
      const message = errorText(reason);
      setErrors([message]);
      if (!loose) setContractBlocked(errorCode(reason) === 'contract_violation');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="直接输入运行"
      description="按输入端口直接提供内容，不经过材料选择；输入随本次运行固定保存。"
    >
      <div className="stack">
        {!fields.length && (
          <p className="muted">
            {hasFileSource
              ? '当前做法没有批次输入端口，入口是上传文件节点：请在「输入材料」上传文件后用「运行流程」。'
              : '当前做法没有声明输入端口，无法用直接输入运行。'}
          </p>
        )}
        {fields.map((field) => (
          <div className="invoke-port" key={field.port}>
            <div className="invoke-port-head">
              <strong>{field.port}</strong>
              <span className="muted">
                {field.required ? '必填' : '可选'}
                {field.kind === 'json' && field.contract?.item
                  ? ' · JSON'
                  : ''}
              </span>
            </div>
            {(raw[field.port] ?? []).map((entry, index) => (
              <div className="invoke-entry" key={index}>
                <EntryControl
                  field={field}
                  value={entry}
                  onChange={(text) => setEntry(field.port, index, text)}
                />
                {(raw[field.port]?.length ?? 0) > 1 && (
                  <Button
                    variant="ghost"
                    aria-label={`删除端口 ${field.port} 第 ${index + 1} 条`}
                    onClick={() =>
                      setRaw((prev) => ({
                        ...prev,
                        [field.port]: prev[field.port].filter(
                          (_, i) => i !== index,
                        ),
                      }))
                    }
                  >
                    <X size={14} />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="ghost"
              onClick={() =>
                setRaw((prev) => ({
                  ...prev,
                  [field.port]: [
                    ...(prev[field.port] ?? []),
                    field.kind === 'boolean' ? 'true' : '',
                  ],
                }))
              }
            >
              <Plus size={13} />
              添加一条
            </Button>
          </div>
        ))}
        {errors.length > 0 && (
          <div className="inline-error" role="alert">
            {errors.map((message, index) => (
              <p key={index}>{message}</p>
            ))}
          </div>
        )}
        {contractBlocked && (
          <Button
            variant="secondary"
            disabled={submitting}
            onClick={() => void submit(true)}
          >
            <ShieldOff size={14} />
            豁免契约重试（会留痕）
          </Button>
        )}
      </div>
      <div className="modal-actions">
        <Button
          variant="primary"
          disabled={submitting || !fields.length}
          onClick={() => void submit(false)}
        >
          <Play size={15} />
          {submitting ? '正在运行…' : '运行'}
        </Button>
      </div>
    </Modal>
  );
}
