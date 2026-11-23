import type { Json } from './records';

/** 本轮业务结果的展示契约；不表达运行状态，也不代替人工结项。 */
export interface RunResultSummary {
  title: string;
  summary: string;
  scope: string;
  metrics?: { label: string; value: string | number }[];
  limitations?: string[];
  nextAction?: string;
}
const text = { type: 'string', pattern: '\\S' };
export const runResultSummarySchema: Json = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'scope'],
  properties: {
    title: text,
    summary: text,
    scope: text,
    nextAction: text,
    limitations: { type: 'array', items: text },
    metrics: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'value'],
        properties: {
          label: text,
          value: { anyOf: [text, { type: 'number' }] },
        },
      },
    },
  },
};
export function isRunResultSummary(
  value: Json,
): value is Json & RunResultSummary {
  const nonempty = (v: unknown) => typeof v === 'string' && !!v.trim();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!['title', 'summary', 'scope'].every((key) => nonempty(value[key])))
    return false;
  if (
    Object.keys(value).some(
      (key) =>
        ![
          'title',
          'summary',
          'scope',
          'metrics',
          'limitations',
          'nextAction',
        ].includes(key),
    )
  )
    return false;
  if (value.nextAction !== undefined && !nonempty(value.nextAction))
    return false;
  if (
    value.limitations !== undefined &&
    (!Array.isArray(value.limitations) || !value.limitations.every(nonempty))
  )
    return false;
  return (
    value.metrics === undefined ||
    (Array.isArray(value.metrics) &&
      value.metrics.every(
        (metric) =>
          metric &&
          typeof metric === 'object' &&
          !Array.isArray(metric) &&
          Object.keys(metric).every((key) =>
            ['label', 'value'].includes(key),
          ) &&
          nonempty(metric.label) &&
          (nonempty(metric.value) ||
            (typeof metric.value === 'number' &&
              Number.isFinite(metric.value))),
      ))
  );
}
