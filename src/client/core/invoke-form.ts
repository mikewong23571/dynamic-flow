import type { Definition, InputContract } from '../../shared/records';

export type InvokeFieldKind = 'text' | 'number' | 'boolean' | 'json';

export interface InvokeField {
  port: string;
  required: boolean;
  kind: InvokeFieldKind;
  contract?: InputContract;
}

function fieldKind(contract: InputContract | undefined): InvokeFieldKind {
  const type = contract?.item?.type;
  if (type === 'string') return 'text';
  if (type === 'number' || type === 'integer') return 'number';
  if (type === 'boolean') return 'boolean';
  return 'json';
}

/** 调用表单模型：按定义 inputs 顺序给每端口的控件类型与必填性。未声明契约的端口保持宽松。 */
export function buildInvokeFields(definition: Definition): InvokeField[] {
  const contracts = definition.inputContracts ?? {};
  return definition.inputs.map((port) => {
    const contract = contracts[port];
    return {
      port,
      required: contract?.required !== false && Boolean(contract),
      kind: fieldKind(contract),
      ...(contract ? { contract } : {}),
    };
  });
}

function parseEntry(
  field: InvokeField,
  text: string,
  index: number,
): { value: unknown } | { error: string } {
  const where = `端口「${field.port}」第 ${index + 1} 条`;
  if (field.kind === 'text') return { value: text };
  if (field.kind === 'number') {
    const value = Number(text);
    if (text.trim() === '' || Number.isNaN(value))
      return { error: `${where}不是数字。` };
    return { value };
  }
  if (field.kind === 'boolean') return { value: text === 'true' };
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { error: `${where}不是合法 JSON。` };
  }
}

/** 把表单原始字符串条目解析为 invoke 裸值；空白条目视为未填写。 */
export function parseInvokeInputs(
  fields: InvokeField[],
  raw: Record<string, string[]>,
): { inputs: Record<string, unknown[]> } | { errors: string[] } {
  const inputs: Record<string, unknown[]> = {};
  const errors: string[] = [];
  for (const field of fields) {
    const entries = (raw[field.port] ?? []).filter((text) =>
      field.kind === 'boolean' ? true : text.trim() !== '',
    );
    if (!entries.length) {
      if (field.required) errors.push(`端口「${field.port}」必须提供输入。`);
      continue;
    }
    const values: unknown[] = [];
    entries.forEach((text, index) => {
      const parsed = parseEntry(field, text, index);
      if ('error' in parsed) errors.push(parsed.error);
      else values.push(parsed.value);
    });
    if (values.length) inputs[field.port] = values;
  }
  return errors.length ? { errors } : { inputs };
}
