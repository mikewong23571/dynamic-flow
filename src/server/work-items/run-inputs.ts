import { stageSourceScope, withinStageScope } from './source-scope.ts';
import { isDeepStrictEqual } from 'node:util';
import { completionValue } from './completion-inputs.ts';
import { included } from './children.ts';
import type { WorkItem, ChildStageValue } from '../../shared/records.ts';
import type {
  Definition,
  Inputs,
  ItemInputSelection,
  OutputReference,
  Work,
  WorkItemInput,
} from '../../shared/records.ts';
import type { FileStore } from '../files/index.ts';
import { validateInvocation } from '../flow/contracts.ts';

/** Read selected values from their saved output, never from a browser-provided value. */
export async function resolveItemInputs(
  item: WorkItemInput,
  selections: Record<string, ItemInputSelection[]>,
  files: FileStore,
  context?: { readItem(id: string): Promise<WorkItem> },
  options: { namespaceMaterials?: boolean; works?: Map<string, Work> } = {},
) {
  if (
    !selections ||
    typeof selections !== 'object' ||
    Array.isArray(selections)
  )
    throw Error('请按输入入口选择本次输入。');
  const { namespaceMaterials = false, works = new Map<string, Work>() } =
    options;
  const inputs: Inputs = {};
  const materials = new Map<string, WorkItemInput['materials'][number]>();
  const inputSources = new Map<string, OutputReference>();
  const completionWorks = new Map<string, Promise<Work>>();
  for (const port of Object.keys(selections)) {
    const refs = selections[port];
    if (!Array.isArray(refs)) throw Error(`输入入口「${port}」的选择无效。`);
    const seen = new Set<string>();
    const versions = new Map<string, string>();
    inputs[port] = [];
    for (const ref of refs) {
      if (!ref || typeof ref !== 'object')
        throw Error(`输入入口「${port}」的选择无效。`);
      if (ref.kind === 'material') {
        if (typeof ref.materialId !== 'string') throw Error('材料选择无效。');
        const key = `material:${ref.materialId}`;
        if (seen.has(key))
          throw Error(`输入入口「${port}」重复选择了材料 ${ref.materialId}。`);
        seen.add(key);
        const material = item.materials.find(
          (entry) => entry.id === ref.materialId,
        );
        if (!material)
          throw Error(`本工作项没有材料 ${ref.materialId}，请重新选择。`);
        materials.set(material.id, material);
        inputs[port].push({
          sampleId: material.id,
          value: material.text,
          materialIds: [material.id],
          sourceResultIds: [],
        });
        continue;
      }
      if (ref.kind === 'received') {
        const value = item.receivedInputs?.find((i) => i.id === ref.inputId);
        if (!value) throw Error('交接输入不存在。');
        if (seen.has(`received:${ref.inputId}`))
          throw Error('重复选择了交接输入。');
        seen.add(`received:${ref.inputId}`);
        const materialIds: string[] = [];
        for (const material of value.materials ?? []) {
          const id = `received:${value.id}:${material.id}`;
          materials.set(id, { ...material, id });
          materialIds.push(id);
        }
        if (value.source)
          inputSources.set(JSON.stringify(value.source), value.source);
        let sampleId = value.id;
        if (value.inputSource) {
          const source = value.inputSource;
          const original = await files.select(source.workId, (w) => {
            const run = w.runs.find((r) => r.id === source.runId);
            if (run?.workItem?.id !== item.id || run.effectMode !== 'commit')
              throw Error('失败输入来源不属于本项正式执行。');
            return run.results.find((r) => r.id === source.resultId)?.input[
              source.port
            ]?.[source.index];
          });
          if (
            !original ||
            (!value.revised && !isDeepStrictEqual(original.value, value.value))
          )
            throw Error('失败输入与原固定来源不一致。');
          sampleId = original.sampleId;
        }
        inputs[port].push({
          sampleId,
          value: structuredClone(value.value),
          materialIds,
          sourceResultIds: value.source
            ? [value.source.resultId]
            : value.inputSource
              ? [value.inputSource.resultId]
              : [],
          ...(value.inputSource
            ? { inputSource: structuredClone(value.inputSource) }
            : {}),
          ...(value.source ? { source: structuredClone(value.source) } : {}),
        });
        continue;
      }
      if (ref.kind === 'child-results') {
        if (!context) throw Error('当前入口不支持子项阶段成果。');
        if (typeof ref.itemId !== 'string' || !ref.itemId)
          throw Error('子项来源不完整，请重新选择。');
        const child = await context.readItem(ref.itemId);
        const scope = stageSourceScope(ref.scope);
        if (!(await withinStageScope(item.id, child, context.readItem, scope)))
          throw Error(
            scope === 'children'
              ? '请选择当前范围内直属子项的阶段成果。'
              : '请选择当前有效后代范围内的子项阶段成果。',
          );
        const key = `child-results:${child.id}`;
        if (seen.has(key)) throw Error('同一子项请合并为一组阶段成果。');
        seen.add(key);
        if (!Array.isArray(ref.sources) || !ref.sources.length)
          throw Error('请至少选择一份子项阶段成果。');
        // Resolve through the existing precise-reference path in the child's scope.
        // This keeps version checks, materials, raw JSON and failures identical.
        const resolved = await resolveItemInputs(
          child,
          {
            input: ref.sources.map((source) => ({
              kind: 'result' as const,
              source,
            })),
          },
          files,
          undefined,
          { namespaceMaterials: true, works },
        );
        let identity: ChildStageValue['item'] | undefined;
        for (const source of ref.sources) {
          let work = works.get(source.workId);
          if (!work) {
            work = await files.read(source.workId);
            works.set(source.workId, work);
          }
          const run = work.runs.find((r) => r.id === source.runId);
          if (
            run?.workItem?.id !== child.id ||
            !child.runs.some(
              (r) => r.workId === source.workId && r.runId === source.runId,
            ) ||
            run.effectMode !== 'commit' ||
            run.comparisonId
          )
            throw Error('请选择该子项正式运行中已完成的产物。');
          const { id, key, title, goal, data } = run.workItem;
          identity ??= { id, key, title, goal, data: structuredClone(data) };
        }
        const childMaterialIds = new Map<string, string>();
        for (const material of resolved.workItem.materials) {
          const id = `child:${child.id}:${material.id}`;
          const existing = materials.get(id);
          if (existing && existing.text !== material.text)
            throw Error('所选子项成果的原文材料不一致，请分别处理。');
          materials.set(id, { ...material, id });
          childMaterialIds.set(material.id, id);
        }
        const value: ChildStageValue = {
          item: identity!,
          outputs: resolved.inputs.input.map((output, index) => ({
            source: structuredClone(ref.sources[index]),
            value: output.value,
          })),
        };
        inputs[port].push({
          sampleId: key,
          value: {
            item: { ...value.item },
            outputs: value.outputs.map((o) => ({
              source: { ...o.source },
              value: o.value,
            })),
          },
          materialIds: [...childMaterialIds.values()],
          sourceResultIds: [
            ...new Set(resolved.inputs.input.flatMap((i) => i.sourceResultIds)),
          ],
        });
        for (const source of resolved.inputSources)
          inputSources.set(JSON.stringify(source), source);
        continue;
      }
      if (ref.kind === 'completion') {
        if (!context) throw Error('当前入口不支持完成依据。');
        const completed = await context.readItem(ref.itemId);
        if (
          completed.parentId !== item.id ||
          (completed.parentScope?.status === 'excluded' && !ref.historical)
        )
          throw Error('请选择当前范围内子项的完成依据。');
        const latest = completed.history
          .filter((h) => h.kind === 'completed')
          .at(-1);
        if (
          !ref.historical &&
          (completed.status !== 'completed' ||
            latest?.id !== ref.completionHistoryId)
        )
          throw Error('子项已重新打开或完成依据已变化，请重新选择。');
        const key = `completion:${ref.itemId}:${ref.completionHistoryId}`;
        if (seen.has(key)) throw Error('重复选择了完成依据。');
        seen.add(key);
        inputs[port].push({
          sampleId: key,
          value: {
            ...(await completionValue(completed, ref.completionHistoryId, {
              ...context,
              files,
              works: completionWorks,
            })),
            ...(ref.historical ? { historical: true } : {}),
          },
          materialIds: [],
          sourceResultIds: [],
        });
        continue;
      }
      if (ref.kind !== 'result') throw Error('无法识别本次输入的来源。');
      const source = ref.source;
      if (
        !source ||
        [source.workId, source.runId, source.resultId, source.port].some(
          (id) => typeof id !== 'string' || !id,
        ) ||
        !Number.isInteger(source.index) ||
        source.index < 0
      )
        throw Error('成果来源不完整，请重新选择。');
      const key = JSON.stringify([
        source.workId,
        source.runId,
        source.resultId,
        source.port,
        source.index,
      ]);
      if (seen.has(key)) throw Error('重复选择了同一份成果，请取消重复项。');
      seen.add(key);
      let work = works.get(source.workId);
      if (!work) {
        work = await files.read(source.workId);
        works.set(source.workId, work);
      }
      const run = work.runs.find((entry) => entry.id === source.runId);
      const result = run?.results.find((entry) => entry.id === source.resultId);
      if (
        !run ||
        !result ||
        result.status !== 'completed' ||
        result.purpose ||
        result.intermediate
      )
        throw Error('所选来源成果不存在或未完成。');
      if (
        run.workItem?.id !== item.id &&
        !item.receivedInputs?.some((i) => isDeepStrictEqual(i.source, source))
      )
        throw Error('请选择当前工作项历史或明确交接的成果。');
      const output = result.outputs[source.port]?.[source.index];
      if (!output) throw Error('所选输出项不存在，请重新选择。');
      const versionKey = JSON.stringify([
        run.workItem?.id,
        source.workId,
        result.nodeId,
        source.port,
        output.sampleId,
        source.index,
      ]);
      const previousRun = versions.get(versionKey);
      if (previousRun && previousRun !== source.runId)
        throw Error('同一样本选择了多个版本的成果，请保留本次要使用的版本。');
      // Distinct fanout instances in one immutable run can share lineage sampleId.
      // Their precise result references differ; they are not competing run versions.
      versions.set(versionKey, source.runId);
      const sourceMaterialIds: string[] = [];
      for (const sourceId of output.materialIds) {
        const id =
          !namespaceMaterials && run.workItem?.id === item.id
            ? sourceId
            : `source:${source.workId}:${source.runId}:${sourceId}`;
        sourceMaterialIds.push(id);
        const material = run.workItem?.materials.find(
          (entry) => entry.id === sourceId,
        );
        if (!material) throw Error(`来源成果缺少原文材料 ${id}。`);
        const existing = materials.get(id);
        if (existing && existing.text !== material.text)
          throw Error(`所选输入中的原文材料 ${id} 不一致，请分别处理。`);
        materials.set(id, { ...material, id });
      }
      inputSources.set(key, source);
      inputs[port].push({
        ...structuredClone(output),
        materialIds: sourceMaterialIds,
        sourceResultIds: [result.id],
        source: structuredClone(source),
      });
    }
  }
  return {
    inputs,
    inputSources: [...inputSources.values()],
    workItem: {
      id: item.id,
      key: item.key,
      title: item.title,
      goal: item.goal,
      revision: item.revision,
      data: structuredClone(item.data),
      materials: [...materials.values()],
    },
  };
}

export async function prepareItemInputs(
  item: WorkItemInput,
  definition: Definition,
  selections: Record<string, ItemInputSelection[]>,
  files: FileStore,
  context?: { readItem(id: string): Promise<WorkItem> },
) {
  if (
    !selections ||
    typeof selections !== 'object' ||
    Array.isArray(selections)
  )
    throw Error('请按输入入口选择本次输入。');
  for (const port of Object.keys(selections))
    if (!definition.inputs.includes(port))
      throw Error(`此版本没有输入入口「${port}」。`);
  const bindings = Object.fromEntries(
    definition.inputs.map((port) => [
      port,
      selections[port] === undefined &&
      definition.inputContracts?.[port]?.required === false
        ? []
        : selections[port],
    ]),
  );
  for (const port of definition.inputs)
    if (
      !Array.isArray(bindings[port]) ||
      (!bindings[port].length &&
        definition.inputContracts?.[port]?.required !== false)
    )
      throw Error(`请选择输入入口「${port}」的输入。`);
  const prepared = await resolveItemInputs(item, bindings, files, context);
  const { inputs } = prepared;
  const issues = validateInvocation(
    definition,
    Object.fromEntries(
      Object.entries(inputs).map(([port, entries]) => [
        port,
        entries.map((entry) => entry.value),
      ]),
    ),
  );
  if (issues.length)
    throw Object.assign(
      Error(issues.map((issue) => issue.message).join('\n')),
      {
        code: 'INPUT_CONTRACT_INVALID',
        issues,
        inputTypes: Object.fromEntries(
          Object.entries(inputs).map(([port, values]) => [
            port,
            values.map((item) =>
              Array.isArray(item.value)
                ? 'array'
                : item.value === null
                  ? 'null'
                  : typeof item.value,
            ),
          ]),
        ),
      },
    );
  return prepared;
}
