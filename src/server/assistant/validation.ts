import { validateValue } from '../flow/schema.ts';
import type { Json, Work } from '../../shared/records.ts';

function object(value: Json): value is Record<string, Json> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function validateOutput(value: Json, schema: Json, path = '结果'): void {
  validateValue(schema, value, path);
}

/** Check explicit material references and verbatim evidence against this execution's inputs. */
export function validateEvidence(
  value: Json,
  materials: Work['materials'],
): void {
  const sources = new Map(
    materials.map((material) => [material.id, material.text]),
  );
  const checkId = (id: Json) => {
    if (typeof id !== 'string' || !sources.has(id))
      throw new Error(`结果引用了不属于本次输入的材料：${String(id)}`);
  };
  const visit = (item: Json, inheritedIds?: string[]) => {
    if (typeof item === 'string') {
      for (const match of item.matchAll(
        /\[([FM]\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi,
      ))
        checkId(match[1]);
    } else if (Array.isArray(item))
      item.forEach((child) => visit(child, inheritedIds));
    else if (object(item)) {
      const explicitIds: string[] = [];
      for (const key of ['materialId', 'feedbackId', 'sourceId']) {
        if (item[key] !== undefined) {
          checkId(item[key]);
          explicitIds.push(item[key] as string);
        }
      }
      for (const key of ['materialIds', 'references', 'citations']) {
        if (Array.isArray(item[key]))
          for (const reference of item[key]) {
            if (typeof reference === 'string') {
              checkId(reference);
              if (key === 'materialIds') explicitIds.push(reference);
            }
          }
      }
      const sourceIds = explicitIds.length ? explicitIds : inheritedIds;
      const candidates = sourceIds
        ? sourceIds.map((id) => sources.get(id)!)
        : [...sources.values()];
      const checkQuote = (quote: string) => {
        if (!quote.trim() || !candidates.some((text) => text.includes(quote)))
          throw new Error(
            '结果中的逐字引用无法在其指向的原始材料中找到，请检查依据。',
          );
      };
      for (const key of ['quote', 'evidence']) {
        const evidence = item[key];
        if (typeof evidence === 'string') checkQuote(evidence);
        else if (Array.isArray(evidence))
          for (const quote of evidence)
            if (typeof quote === 'string') checkQuote(quote);
      }
      Object.values(item).forEach((child) => visit(child, sourceIds));
    }
  };
  visit(value);
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
