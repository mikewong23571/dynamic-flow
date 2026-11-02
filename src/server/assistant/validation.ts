import { validateValue } from '../flow/schema.ts';
import type { Json } from '../../shared/records.ts';

function object(value: Json): value is Record<string, Json> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function validateOutput(value: Json, schema: Json, path = '结果'): void {
  validateValue(schema, value, path);
}

export function parseOutput(text: string, schema?: Json): Json {
  if (!text.trim()) throw new Error('模型没有返回节点结果。');
  const raw = text
    .trim()
    .replace(/^```(?:json)?\s*\n?/, '')
    .replace(/\n?```$/, '');
  if (!schema) {
    try {
      return JSON.parse(raw) as Json;
    } catch {
      return text;
    }
  }
  let value: Json;
  try {
    value = JSON.parse(raw) as Json;
  } catch {
    if (object(schema) && schema.type === 'string') value = text;
    else
      throw new Error(
        '节点需要结构化 JSON 输出，但模型返回的内容不是有效 JSON。',
      );
  }
  if (object(schema) && schema.type === 'string' && typeof value !== 'string') {
    throw new Error(
      '节点需要可直接阅读的文本报告，但模型返回了 JSON 对象或其它非文本值。请重试本节点，或在任务中明确要求只返回 Markdown 正文，不用 report 字段包装。',
    );
  }
  validateOutput(value, schema);
  return value;
}
