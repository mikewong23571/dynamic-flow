import { randomUUID } from 'node:crypto';
import type { FileStore } from '../files/index.ts';
import { validateForRun } from '../flow/index.ts';
import type {
  Definition,
  FlowNode,
  Inputs,
  InputItem,
  Json,
  NodeExecution,
  NodeResult,
  Run,
  StartRun,
} from '../../shared/records.ts';
const now = () => new Date().toISOString();
const copy = <T>(value: T): T => structuredClone(value);
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const items = (inputs: Inputs) => Object.values(inputs).flat();
function field(value: Json, path: string): Json | undefined {
  if (!path) return value;
  return path
    .split('.')
    .reduce<Json | undefined>(
      (v, k) =>
        v && typeof v === 'object' && !Array.isArray(v) ? v[k] : undefined,
      value,
    );
}
export function nodeInputPorts(node: FlowNode) {
  return node.kind === 'function' && node.functionName === 'merge'
    ? ['left', 'right']
    : ['input'];
}
export function validateInputs(inputs: Inputs, ports: string[]) {
  for (const p of ports)
    if (!Array.isArray(inputs[p]))
      throw Error(`缺少输入端口 ${p}，请选择材料或已有结果。`);
  for (const [p, list] of Object.entries(inputs)) {
    if (!ports.includes(p))
      throw Error(`不支持输入端口 ${p}，需要 ${ports.join('、')}。`);
    for (const i of list)
      if (
        !i.sampleId ||
        !Array.isArray(i.materialIds) ||
        !Array.isArray(i.sourceResultIds) ||
        i.value === undefined
      )
        throw Error('输入项缺少内容或来源。');
  }
}
export function createRuns(
  files: FileStore,
  executeNode: (context: NodeExecution) => Promise<Json>,
) {
  const active = new Map<
    string,
    { runId: string; controller: AbortController }
  >();
  const reservations = new Map<string, string>();
  const jobs = new Map<string, Promise<void>>();
  function reserve(workId: string, owner: string) {
    if (active.has(workId) || reservations.has(workId))
      throw Error('当前工作已有运行，请等待完成或停止。');
    reservations.set(workId, owner);
  }
  function release(workId: string, owner: string) {
    if (reservations.get(workId) === owner) reservations.delete(workId);
  }
  async function start(workId: string, options: StartRun) {
    if (
      active.has(workId) ||
      (reservations.has(workId) &&
        reservations.get(workId) !== options.comparisonId)
    )
      throw Error('当前工作已有运行，请等待完成或停止。');
    const controller = new AbortController(),
      id = randomUUID();
    active.set(workId, { runId: id, controller });
    try {
      const definition = await files.readDefinition(
        workId,
        options.definitionId,
      );
      validateForRun(definition);
      const scope = options.scope;
      const selected =
        typeof scope === 'object'
          ? definition.nodes.find((n) => n.id === scope.nodeId)
          : undefined;
      if (scope !== 'full' && !selected)
        throw Error('该版本中没有选中的节点，请重新选择。');
      validateInputs(
        options.inputs,
        selected ? nodeInputPorts(selected) : definition.inputs,
      );
      const run: Run = {
        id,
        definitionId: options.definitionId,
        scope: copy(scope),
        inputs: copy(options.inputs),
        status: 'queued',
        stopRequested: false,
        comparisonId: options.comparisonId,
        nodeStates: Object.fromEntries(
          (selected ? [selected] : definition.nodes).map((n) => [
            n.id,
            'queued',
          ]),
        ),
        results: [],
        nodeTotals: {},
        startedAt: now(),
      };
      await files.change(workId, (w) => {
        w.runs.push(run);
      });
      const job = perform(workId, run, definition, controller)
        .catch(async (error) => {
          await files.change(workId, (w) => {
            const r = w.runs.find((r) => r.id === id)!;
            r.status = controller.signal.aborted ? 'cancelled' : 'failed';
            r.error = message(error);
            r.finishedAt = now();
          });
        })
        .finally(() => {
          if (active.get(workId)?.runId === id) active.delete(workId);
        });
      jobs.set(id, job);
      void job
        .finally(() => {
          setTimeout(() => jobs.delete(id), 60_000).unref();
        })
        .catch(() => {});
      return id;
    } catch (error) {
      if (active.get(workId)?.runId === id) active.delete(workId);
      throw error;
    }
  }
  async function changeRun(workId: string, id: string, fn: (r: Run) => void) {
    await files.change(workId, (w) => {
      const r = w.runs.find((r) => r.id === id);
      if (!r) throw Error('运行不存在');
      fn(r);
    });
  }
  async function perform(
    workId: string,
    run: Run,
    definition: Definition,
    controller: AbortController,
  ) {
    const signal = controller.signal,
      values: Record<string, Inputs> = { $input: copy(run.inputs) };
    const selectedScope = run.scope;
    const remaining = new Map(
      (selectedScope === 'full'
        ? definition.nodes
        : definition.nodes.filter((n) => n.id === selectedScope.nodeId)
      ).map((n) => [n.id, n]),
    );
    const states: Run['nodeStates'] = { ...run.nodeStates };
    await changeRun(workId, run.id, (r) => {
      r.status = signal.aborted ? 'stopping' : 'running';
    });
    while (remaining.size && !signal.aborted) {
      let advanced = false;
      for (const [nodeId, node] of remaining) {
        if (signal.aborted) break;
        const edges = definition.edges.filter((e) => e.to[0] === nodeId);
        if (
          run.scope === 'full' &&
          edges.some(
            (e) =>
              e.from[0] !== '$input' &&
              ['queued', 'running'].includes(states[e.from[0]] ?? 'queued'),
          )
        )
          continue;
        advanced = true;
        remaining.delete(nodeId);
        if (
          run.scope === 'full' &&
          edges.some(
            (e) => e.from[0] !== '$input' && states[e.from[0]] !== 'completed',
          )
        ) {
          states[nodeId] = 'blocked';
          await changeRun(workId, run.id, (r) => {
            r.nodeStates[nodeId] = 'blocked';
          });
          continue;
        }
        const input: Inputs =
          run.scope === 'full'
            ? Object.fromEntries(
                edges.map((e) => [
                  e.to[1],
                  copy(values[e.from[0]]?.[e.from[1]] ?? []),
                ]),
              )
            : copy(run.inputs);
        validateInputs(input, nodeInputPorts(node));
        states[nodeId] = 'running';
        await changeRun(workId, run.id, (r) => {
          r.nodeStates[nodeId] = 'running';
        });
        const batches: Inputs[] =
          node.mode === 'each' && node.kind !== 'branch'
            ? input.input.map((i) => ({ input: [i] }))
            : [input];
        await changeRun(workId, run.id, (r) => {
          (r.nodeTotals ??= {})[nodeId] = batches.length;
        });
        const output: Inputs =
          node.kind === 'branch'
            ? { matched: [], unmatched: [] }
            : { output: [] };
        let failed = false;
        for (
          let index = 0;
          index < batches.length && !signal.aborted;
          index++
        ) {
          const batch = batches[index],
            result: NodeResult = {
              id: randomUUID(),
              runId: run.id,
              definitionId: run.definitionId,
              nodeId,
              instanceId: `${nodeId}:${node.mode === 'each' ? batch.input[0].sampleId : 'all'}:${index}`,
              input: copy(batch),
              outputs: {},
              status: 'running',
              activities: [],
              startedAt: now(),
            };
          await changeRun(workId, run.id, (r) => {
            r.results.push(result);
          });
          try {
            let produced: Inputs;
            const wrap = (
              value: Json,
              source: InputItem[],
              sampleId?: string,
            ): InputItem => ({
              sampleId:
                sampleId ??
                (source.length === 1 ? source[0].sampleId : result.id),
              value,
              materialIds: [...new Set(source.flatMap((i) => i.materialIds))],
              sourceResultIds: [result.id],
            });
            if (node.kind === 'branch') {
              produced = { matched: [], unmatched: [] };
              for (const item of batch.input) {
                const v = field(item.value, node.condition!.field),
                  c = node.condition!;
                const match =
                  c.operator === 'exists'
                    ? v !== undefined && v !== null
                    : c.operator === 'contains'
                      ? String(v ?? '').includes(String(c.value ?? ''))
                      : JSON.stringify(v) === JSON.stringify(c.value);
                produced[match ? 'matched' : 'unmatched'].push(
                  wrap(item.value, [item], item.sampleId),
                );
              }
            } else if (node.kind === 'function') {
              if (
                node.functionName === 'merge' ||
                node.functionName === 'identity'
              )
                produced = {
                  output: items(batch).map((i) =>
                    wrap(i.value, [i], i.sampleId),
                  ),
                };
              else
                produced = {
                  output: items(batch).map((i) =>
                    wrap(
                      Object.fromEntries(
                        (node.params?.fields ?? []).map((key) => [
                          key,
                          field(i.value, key) ?? null,
                        ]),
                      ),
                      [i],
                      i.sampleId,
                    ),
                  ),
                };
            } else {
              const work = await files.read(workId);
              const value = await executeNode({
                workId,
                runId: run.id,
                definitionId: run.definitionId,
                node,
                instanceId: result.instanceId,
                inputs: copy(batch),
                materials: work.materials,
                signal,
                onActivity: async (activity) => {
                  if (signal.aborted) return;
                  await changeRun(workId, run.id, (r) => {
                    const found = r.results.find((x) => x.id === result.id)!;
                    if (found.status !== 'running') return;
                    const at = found.activities.findIndex(
                      (a) => a.toolCallId === activity.toolCallId,
                    );
                    const scoped = {
                      ...activity,
                      id: `${run.id}:${result.instanceId}:${activity.toolCallId}`,
                    };
                    if (at < 0) found.activities.push(scoped);
                    else found.activities[at] = scoped;
                  });
                },
              });
              produced = { output: [wrap(value, items(batch))] };
            }
            if (signal.aborted) throw Error('运行已停止');
            for (const [port, list] of Object.entries(produced))
              (output[port] ??= []).push(...list);
            await changeRun(workId, run.id, (r) => {
              const saved = r.results.find((x) => x.id === result.id)!;
              if (r.stopRequested) {
                saved.status = 'cancelled';
                saved.finishedAt = now();
                return;
              }
              saved.outputs = produced;
              saved.status = 'completed';
              saved.finishedAt = now();
            });
          } catch (error) {
            failed = true;
            await changeRun(workId, run.id, (r) => {
              const saved = r.results.find((x) => x.id === result.id)!;
              saved.status = signal.aborted ? 'cancelled' : 'failed';
              saved.error = signal.aborted ? '已停止' : message(error);
              saved.finishedAt = now();
            });
          }
        }
        states[nodeId] = signal.aborted
          ? 'cancelled'
          : failed
            ? 'failed'
            : 'completed';
        values[nodeId] = output;
        await changeRun(workId, run.id, (r) => {
          r.nodeStates[nodeId] = states[nodeId];
        });
      }
      if (!advanced && remaining.size)
        throw Error('依赖无法就绪，请检查连线和输入。');
    }
    await changeRun(workId, run.id, (r) => {
      r.status =
        signal.aborted || r.stopRequested
          ? 'cancelled'
          : Object.values(states).some((s) => s === 'failed' || s === 'blocked')
            ? 'failed'
            : 'completed';
      for (const key of Object.keys(r.nodeStates))
        if (['queued', 'running'].includes(r.nodeStates[key]))
          r.nodeStates[key] =
            r.status === 'cancelled' ? 'cancelled' : 'blocked';
      r.finishedAt = now();
    });
  }
  async function stop(workId: string, runId: string) {
    const entry = active.get(workId);
    await changeRun(workId, runId, (r) => {
      if (
        ['completed', 'failed', 'cancelled', 'interrupted'].includes(r.status)
      )
        return;
      r.stopRequested = true;
      r.status = 'stopping';
      if (entry?.runId === runId) entry.controller.abort();
    });
  }
  async function retry(
    workId: string,
    runId: string,
    resultIds: string[],
    definitionId?: string,
  ) {
    const work = await files.read(workId),
      old = work.runs.find((r) => r.id === runId);
    if (!old) throw Error('运行不存在');
    const selected = old.results.filter((r) => resultIds.includes(r.id));
    if (
      !selected.length ||
      selected.length !== new Set(resultIds).size ||
      selected.some((r) => r.status !== 'failed')
    )
      throw Error('请选择失败的输入重试。');
    if (new Set(selected.map((r) => r.nodeId)).size !== 1)
      throw Error('一次重试同一节点的失败输入。');
    const inputs: Inputs = {};
    for (const result of selected)
      for (const [p, list] of Object.entries(result.input))
        (inputs[p] ??= []).push(...copy(list));
    return start(workId, {
      definitionId: definitionId ?? old.definitionId,
      scope: { nodeId: selected[0].nodeId },
      inputs,
    });
  }
  return {
    start,
    stop,
    retry,
    reserve,
    release,
    wait: async (runId: string) => {
      await jobs.get(runId);
    },
    isBusy: (workId: string) => active.has(workId) || reservations.has(workId),
  };
}
export type RunService = ReturnType<typeof createRuns>;
