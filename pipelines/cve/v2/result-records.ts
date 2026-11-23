import type { Json, OutputReference } from '../../../src/shared/records.ts';

/** CVE example data contract. The application runtime has no special disposition semantics. */
export interface CveBatchRecord {
  id: string;
  title: string;
  scope: string;
  finding: string;
  reason: string;
  actions: ('process' | 'clarify')[];
  disposition: { status: 'pending' | 'decided'; reason: string };
  questions: string[];
  source: OutputReference;
  detail: Json;
}
export interface CveBatchResult {
  title: string;
  items: { id: string; title: string; records: CveBatchRecord[] }[];
}
const text = { type: 'string', minLength: 1 };
export const cveBatchResultSchema: Json = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'items'],
  properties: {
    title: text,
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'records'],
        properties: {
          id: text,
          title: text,
          records: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'id',
                'title',
                'scope',
                'finding',
                'reason',
                'actions',
                'questions',
                'source',
                'detail',
                'disposition',
              ],
              properties: {
                id: text,
                title: text,
                scope: text,
                finding: text,
                reason: text,
                actions: {
                  type: 'array',
                  uniqueItems: true,
                  items: { enum: ['process', 'clarify'] },
                },
                questions: { type: 'array', items: text },
                disposition: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['status', 'reason'],
                  properties: {
                    status: { enum: ['pending', 'decided'] },
                    reason: text,
                  },
                },
                source: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['workId', 'runId', 'resultId', 'port', 'index'],
                  properties: {
                    workId: text,
                    runId: text,
                    resultId: text,
                    port: text,
                    index: { type: 'integer', minimum: 0 },
                  },
                },
                detail: {},
              },
            },
          },
        },
      },
    },
  },
};
export function isCveBatchResult(value: unknown): value is CveBatchResult {
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const text = (v: unknown) => typeof v === 'string' && !!v.trim();
  if (!object(value) || !text(value.title) || !Array.isArray(value.items))
    return false;
  const ids = new Set<string>(),
    recordIds = new Set<string>();
  return value.items.every((i) => {
    if (
      !object(i) ||
      !text(i.id) ||
      !text(i.title) ||
      !Array.isArray(i.records) ||
      ids.has(i.id as string)
    )
      return false;
    ids.add(i.id as string);
    return i.records.every((r) => {
      if (
        !object(r) ||
        !['id', 'title', 'scope', 'finding', 'reason'].every((k) =>
          text(r[k]),
        ) ||
        recordIds.has(r.id as string) ||
        !Array.isArray(r.actions) ||
        !r.actions.every((a) => a === 'process' || a === 'clarify') ||
        new Set(r.actions).size !== r.actions.length ||
        !Array.isArray(r.questions) ||
        !r.questions.every(text) ||
        !object(r.disposition) ||
        !['pending', 'decided'].includes(r.disposition.status as string) ||
        !text(r.disposition.reason) ||
        (r.disposition.status === 'pending' && r.actions.length > 0) ||
        !object(r.source) ||
        !['workId', 'runId', 'resultId', 'port'].every((k) =>
          text((r.source as Record<string, unknown>)[k]),
        ) ||
        !Number.isInteger(r.source.index) ||
        (r.source.index as number) < 0 ||
        !Object.hasOwn(r, 'detail')
      )
        return false;
      recordIds.add(r.id as string);
      return true;
    });
  });
}
