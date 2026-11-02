import {
  stageSourceScope,
  withinStageScope,
  type StageSourceScope,
} from './source-scope.ts';
import type {
  ChildStageInputs,
  Definition,
  Work,
  WorkItem,
} from '../../shared/records.ts';
import type { FileStore } from '../files/index.ts';
import { included } from './children.ts';

/** Discover choices, never choose a latest run or infer business coverage. */
export async function childStageInputs(
  id: string,
  ctx: { read(id: string): Promise<WorkItem>; all(): Promise<WorkItem[]> },
  files: FileStore,
  scope: StageSourceScope = 'children',
): Promise<ChildStageInputs> {
  await ctx.read(id);
  const sourceScope = stageSourceScope(scope);
  const all = await ctx.all();
  const byId = new Map(all.map((item) => [item.id, item]));
  const read = async (key: string) => {
    const found = byId.get(key);
    if (!found) throw Error('来源祖先不存在。');
    return found;
  };
  const children: WorkItem[] = [];
  for (const item of all) {
    if (
      sourceScope === 'children'
        ? item.parentId === id
        : await withinStageScope(id, item, read, sourceScope)
    )
      children.push(item);
  }
  children.sort((a, b) =>
    a.key.localeCompare(b.key, 'zh-CN', { numeric: true }),
  );
  const works = new Map<string, Promise<Work>>();
  const definitions = new Map<string, Promise<Definition>>();
  const response: ChildStageInputs = { children: [] };
  for (const child of children) {
    const row: ChildStageInputs['children'][number] = {
      id: child.id,
      key: child.key,
      title: child.title,
      excluded: !included(child),
      runs: [],
      issues: [],
    };
    response.children.push(row);
    if (row.excluded) continue;
    for (const ref of [...child.runs].reverse()) {
      try {
        let pending = works.get(ref.workId);
        if (!pending) {
          pending = files.read(ref.workId);
          works.set(ref.workId, pending);
        }
        const work = await pending;
        const run = work.runs.find((r) => r.id === ref.runId);
        if (!run || run.workItem?.id !== child.id)
          throw Error('来源运行不存在或不属于本子项');
        if (run.effectMode !== 'commit' || run.comparisonId) continue;
        const definitionKey = `${ref.workId}:${run.definitionId}`;
        let saved = definitions.get(definitionKey);
        if (!saved) {
          saved = files.readDefinition(ref.workId, run.definitionId);
          definitions.set(definitionKey, saved);
        }
        const definition = await saved;
        const groups: ChildStageInputs['children'][number]['runs'][number]['groups'] =
          [];
        for (const result of run.results) {
          if (
            result.status !== 'completed' ||
            result.purpose ||
            result.intermediate
          )
            continue;
          for (const [port, outputs] of Object.entries(result.outputs)) {
            if (!outputs.length) continue;
            let group = groups.find(
              (g) => g.nodeId === result.nodeId && g.port === port,
            );
            if (!group) {
              const aliases = Object.entries(definition.outputs)
                .filter(
                  ([, [nodeId, p]]) => nodeId === result.nodeId && p === port,
                )
                .map(([alias]) => alias);
              group = {
                nodeId: result.nodeId,
                port,
                label:
                  definition.nodes.find((n) => n.id === result.nodeId)?.label ||
                  result.nodeId,
                final: aliases.length > 0,
                summary:
                  !!definition.summaryOutput &&
                  aliases.includes(definition.summaryOutput),
                outputs: [],
              };
              groups.push(group);
            }
            outputs.forEach((output, index) =>
              group.outputs.push({
                source: {
                  workId: ref.workId,
                  runId: run.id,
                  resultId: result.id,
                  port,
                  index,
                },
                preview: JSON.stringify(output.value).slice(0, 180),
                entries: Array.isArray(output.value)
                  ? output.value.length
                  : undefined,
              }),
            );
          }
        }
        if (groups.length)
          row.runs.push({
            ...ref,
            round: child.runs.indexOf(ref) + 1,
            title: work.title || '未命名方法',
            status: run.status,
            startedAt: run.startedAt,
            groups: groups.sort((a, b) => Number(b.final) - Number(a.final)),
          });
      } catch (e) {
        row.issues.push(
          `${ref.runId}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }
  return response;
}
