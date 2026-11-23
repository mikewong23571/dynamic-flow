import type { FileStore } from '../files/index.ts';
import type { WorkItem, Work, Json } from '../../shared/records.ts';

export async function completionValue(
  item: WorkItem,
  historyId: string,
  context?: {
    readItem(id: string): Promise<WorkItem>;
    files: FileStore;
    works?: Map<string, Promise<Work>>;
  },
  visited = new Set<string>(),
): Promise<Record<string, Json>> {
  if (context && !context.works) context.works = new Map();
  const event = item.history.find(
    (h) => h.id === historyId && h.kind === 'completed',
  );
  if (!event) throw Error('指定完成记录不存在。');
  const key = `${item.id}:${historyId}`;
  if (visited.has(key)) throw Error('完成依据存在循环引用。');
  const path = new Set(visited).add(key);
  const conclusions = [];
  for (const criterion of event.criteria ?? []) {
    const outputs = [];
    for (const reference of criterion.references ?? []) {
      if (!context) throw Error('缺少完成依据读取上下文。');
      if (!context.works!.has(reference.workId))
        context.works!.set(
          reference.workId,
          context.files.read(reference.workId),
        );
      const work = await context.works!.get(reference.workId)!,
        run = work.runs.find((r) => r.id === reference.runId),
        result = run?.results.find((r) => r.id === reference.resultId);
      if (!result || result.status !== 'completed')
        throw Error('已确认成果来源不可读。');
      let { port, index } = reference;
      if (port === undefined || index === undefined) {
        const positions = Object.entries(result.outputs).flatMap(
          ([port, values]) => values.map((_, index) => ({ port, index })),
        );
        if (positions.length !== 1)
          throw Error('旧完成依据未明确输出位置，请重新确认。');
        ({ port, index } = positions[0]);
      }
      const output = result.outputs[port]?.[index];
      if (!output) throw Error('已确认成果输出不存在。');
      outputs.push({
        source: { ...reference, port, index },
        value: output.value,
      });
    }
    conclusions.push({ ...criterion, outputs });
  }
  const children = [];
  for (const child of event.childCompletions ?? []) {
    if (!context) throw Error('缺少子项完成依据读取上下文。');
    children.push(
      await completionValue(
        await context.readItem(child.itemId),
        child.completionHistoryId,
        context,
        path,
      ),
    );
  }
  return JSON.parse(
    JSON.stringify({
      itemId: item.id,
      completionHistoryId: event.id,
      title: event.completionTitle ?? item.title,
      goal: event.completionGoal ?? item.goal,
      data: event.completionData ?? {},
      confirmedAt: event.at,
      criteria: conclusions,
      children,
    }),
  );
}
