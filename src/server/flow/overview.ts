import type {
  Activity,
  InputItem,
  Inputs,
  Json,
  Run,
  Work,
  ContentMaterial,
} from '../../shared/records.ts';

/** Stop walking as soon as the inline budget is exceeded; never stringify a whole run. */
export function exceedsInlineBudget(value: unknown, budget = 32_000): boolean {
  const pending: unknown[] = [value];
  let remaining = budget;
  while (pending.length && remaining >= 0) {
    const next = pending.pop();
    if (typeof next === 'string') remaining -= next.length;
    else if (next && typeof next === 'object') {
      remaining -= 16;
      for (const key in next) {
        remaining -= key.length + 4;
        pending.push((next as Record<string, unknown>)[key]);
        if (pending.length > budget) return true;
      }
    } else remaining -= 8;
  }
  return remaining < 0;
}
export function contentPage(value: Json, offset = 0) {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const start =
    Number.isSafeInteger(offset) && offset >= 0
      ? Math.min(offset, text.length)
      : 0;
  return {
    text: text.slice(start, start + 20_000),
    offset: start,
    characters: text.length,
    hasMore: start + 20_000 < text.length,
  };
}
export function overviewWork(work: Work, runIds?: string[]): Work {
  const base = `/api/works/${encodeURIComponent(work.id)}/content?`;
  const url = (params: Record<string, string>) =>
    base + new URLSearchParams(params);
  function entry(
    item: InputItem,
    params: Record<string, string>,
    force = false,
  ): InputItem {
    return exceedsInlineBudget(item.value, force ? 2_000 : 32_000)
      ? {
          ...item,
          value: null,
          contentUrl: url(params),
          valueFields: [
            ...new Set(
              (Array.isArray(item.value) ? item.value : [item.value]).flatMap(
                (value) =>
                  value && typeof value === 'object' && !Array.isArray(value)
                    ? Object.keys(value)
                    : [],
              ),
            ),
          ],
        }
      : item;
  }
  function inputs(
    values: Inputs,
    params: Record<string, string>,
    force = false,
  ): Inputs {
    return Object.fromEntries(
      Object.entries(values).map(([port, items]) => [
        port,
        items.map((item, index) =>
          entry(item, { ...params, port, index: String(index) }, force),
        ),
      ]),
    );
  }
  function activity(value: Activity, params: Record<string, string>): Activity {
    return exceedsInlineBudget(value)
      ? {
          ...value,
          args: undefined,
          result: undefined,
          contentUrl: url({ ...params, activityId: value.id }),
        }
      : value;
  }
  function run(value: Run): Run {
    const large = exceedsInlineBudget(value, 128_000);
    const material = (m: ContentMaterial): ContentMaterial =>
      exceedsInlineBudget(m.text)
        ? {
            ...m,
            text: m.text.slice(0, 256),
            characters: m.text.length,
            contentUrl: url({ runId: value.id, materialId: m.id }),
          }
        : m;
    return {
      ...value,
      workItem:
        value.workItem && large
          ? {
              ...value.workItem,
              contextOmitted: true,
              data: {},
              receivedInputs: undefined,
              materials: value.workItem.materials.map(material),
            }
          : value.workItem,
      materials: value.materials?.map(material),
      inputs: inputs(
        value.inputs,
        { runId: value.id, direction: 'inputs' },
        large,
      ),

      results: value.results.map((result) => ({
        ...result,
        input: inputs(
          result.input,
          { runId: value.id, resultId: result.id, direction: 'input' },
          large,
        ),
        outputs: inputs(
          result.outputs,
          { runId: value.id, resultId: result.id, direction: 'outputs' },
          large,
        ),
        activities: result.activities.map((a) =>
          activity(a, { runId: value.id, resultId: result.id }),
        ),
      })),
    };
  }
  return {
    ...work,
    runs: work.runs.filter((r) => !runIds || runIds.includes(r.id)).map(run),
    messages: work.messages.map((m) => ({
      ...m,
      activities: m.activities?.map((a) => activity(a, { messageId: m.id })),
    })),
  };
}
